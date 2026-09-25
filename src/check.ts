import fs from "node:fs";
import path from "node:path";
import { classify } from "./classify.js";
import {
  changedFiles,
  changedLines,
  commitSubjects,
  gitDir,
  hasTrackedChanges,
  headSha,
  isDirty,
  mergeBase,
  repoRoot,
  resolveBase,
  showAtRev,
} from "./git.js";
import { expandChangedTests } from "./locate/expand.js";
import { findShadowedSources } from "./shadow.js";
import { detectMode } from "./mode.js";
import { availableRunners, lookup, type Runner } from "./runners/index.js";
import { hasPendingJournal, restoreSources, revertSources } from "./swap.js";
import type { ChangedFile, Outcome, Receipt, TestCase, Verdict } from "./types.js";
import { plain, redact } from "./sanitize.js";
import { GUARD_REASON, decide, firstErrorLine, relabelGuards } from "./verdict.js";
import { VERSION } from "./version.js";

export interface CheckOptions {
  cwd: string;
  base?: string;
  mode?: string;
  failOn: string[];
  reruns: number;
  python?: string;
  jsRunner?: string;
  /** Check only committed work (HEAD against the merge base), ignoring the working tree. */
  committed?: boolean;
  /** Per test-runner invocation; tests still running when it expires count as failed. */
  timeoutMs?: number;
  log?: (msg: string) => void;
}

export const DEFAULT_FAIL_ON = ["broken", "theater", "changed"];

interface Track {
  test: TestCase;
  runner: Runner;
  green: Outcome[];
  red: Outcome[];
  redDetail?: string;
  greenDetail?: string;
  /** Killed for time: re-running would only hang again. */
  hung?: boolean;
}

/** Runs the given tracks' files, one runner at a time, and appends each outcome. Returns the files the tests imported. */
function runAndRecord(root: string, tracks: Track[], side: "green" | "red", opts: CheckOptions): Set<string> {
  const imported = new Set<string>();
  const byRunner = new Map<Runner, Track[]>();
  for (const t of tracks) byRunner.set(t.runner, [...(byRunner.get(t.runner) ?? []), t]);
  for (const [runner, group] of byRunner) {
    const files = [...new Set(group.map((t) => t.test.file))];
    const run = runner.run(root, files, { python: opts.python, timeoutMs: opts.timeoutMs }, group.map((t) => t.test));
    for (const f of run.imported ?? []) imported.add(f);
    for (const tr of group) {
      const r = lookup(run, tr.test);
      tr[side].push(r.outcome);
      if (r.outcome === "failed" && r.detail) {
        if (side === "red") tr.redDetail ??= r.detail;
        else tr.greenDetail ??= r.detail;
        if (run.timedOut && r.detail.startsWith(run.timedOut)) tr.hung = true;
      }
    }
  }
  return imported;
}

/** Re-runs tests that have only failed so far, so a flake is not reported as a verdict. */
function rerunFailures(root: string, tracks: Track[], side: "green" | "red", opts: CheckOptions): void {
  for (let i = 0; i < opts.reruns; i++) {
    const suspects = tracks.filter((t) => !t.hung && t[side].length > 0 && t[side].every((o) => o === "failed"));
    if (suspects.length === 0) return;
    runAndRecord(root, suspects, side, opts);
  }
}

export function runCheck(opts: CheckOptions): Receipt {
  const log = opts.log ?? (() => {});
  const root = repoRoot(opts.cwd);
  const gdir = gitDir(root);
  if (hasPendingJournal(gdir)) {
    throw new Error("A previous receipts run was interrupted and left the old code in place. Run `receipts restore` first.");
  }

  if (opts.committed && hasTrackedChanges(root)) {
    throw new Error("--committed needs a clean working tree: tests run on the files on disk. Commit or stash first.");
  }
  const baseRef = resolveBase(root, opts.base);
  const mb = mergeBase(root, baseRef);
  const { mode, source: modeSource } = detectMode(opts.mode, commitSubjects(root, mb));
  const runners = availableRunners(root, opts.jsRunner);

  const changes: ChangedFile[] = changedFiles(root, mb, opts.committed).map((c) => ({ ...c, kind: classify(c.path) }));
  const sources = changes.filter((c) => c.kind === "source");
  const testChanges = changes.filter((c) => c.kind === "test");

  const tracks: Track[] = [];
  const removedTests: string[] = [];
  const unsupported: string[] = [];
  const usedRunners = new Set<Runner>();
  for (const f of testChanges) {
    const runner = runners.find((r) => r.owns(f.path));
    if (!runner) {
      // Helpers and fixtures (conftest.py, data files) are fine; flag only what looks like a test.
      if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(f.path) && f.status !== "deleted") unsupported.push(f.path);
      continue;
    }
    const basePath = f.oldPath ?? f.path;
    const before = f.status === "added" ? [] : runner.locate(f.path, showAtRev(root, mb, basePath).toString("utf8"));
    if (f.status === "deleted") {
      removedTests.push(...before.map((t) => t.id));
      continue;
    }
    const source = fs.readFileSync(path.join(root, f.path), "utf8");
    const after = runner.locate(f.path, source);
    const afterIds = new Set(after.map((t) => t.id));
    removedTests.push(...before.map((t) => t.id).filter((id) => !afterIds.has(id)));

    let changed = after;
    if (f.status !== "added") {
      const lines = [...changedLines(root, mb, f.path, f.oldPath, opts.committed)];
      changed = after.filter((t) => lines.some((n) => n >= t.startLine && n <= t.endLine));
      // Edits outside every test (case tables, fixtures, setUp) change the tests that use them.
      const outside = lines.filter((n) => !after.some((t) => n >= t.startLine && n <= t.endLine));
      if (outside.length > 0) {
        const extra = expandChangedTests({
          source,
          tests: after,
          suites: runner.suites(source),
          lines: outside,
          language: runner.language,
        });
        changed = [...new Set([...changed, ...extra])];
      }
    }
    for (const test of changed) tracks.push({ test, runner, green: [], red: [] });
    if (changed.length > 0) usedRunners.add(runner);
  }

  const receipt: Receipt = {
    tool: "receipts",
    version: VERSION,
    mode,
    modeSource,
    base: { ref: baseRef, sha: mb },
    head: { sha: headSha(root), dirty: isDirty(root) },
    runners: [...usedRunners].map((r) => r.name),
    unsupportedTestFiles: unsupported,
    warnings: [],
    status: "checked",
    sourceFiles: sources.map((s) => s.path),
    testFiles: testChanges.filter((t) => t.status !== "deleted").map((t) => t.path),
    removedTests,
    tests: [],
    summary: {},
    failOn: opts.failOn,
    violations: [],
    passed: true,
  };

  // Only environment files (lockfiles, CI config) changed: there is nothing to prove.
  if (changes.length === 0 || (sources.length === 0 && tracks.length === 0)) receipt.status = "no-changes";
  else if (tracks.length === 0) receipt.status = "no-tests";
  else if (sources.length === 0) receipt.status = "test-only";

  if (receipt.status === "checked") {
    log(`green: running ${tracks.length} changed test(s) with the change applied`);
    const imported = runAndRecord(root, tracks, "green", opts);
    const shadowed = findShadowedSources(root, receipt.sourceFiles, imported);
    if (shadowed.length > 0) {
      receipt.warnings.push(
        `The tests do not run this checkout's code: ${shadowed.join("; ")}. ` +
          "Install the project in editable mode (pip install -e .) so the swap reaches the tests.",
      );
    }
    rerunFailures(root, tracks, "green", opts);

    const redTracks = tracks.filter((t) => t.green.length > 0 && t.green.every((o) => o === "passed"));
    if (redTracks.length > 0) {
      log(`red: reverting ${sources.length} source file(s) to ${mb.slice(0, 7)} and running again`);
      const onSignal = () => {
        try {
          restoreSources(root, gdir);
        } catch (err) {
          console.error(`receipts: ${err instanceof Error ? err.message : String(err)}`);
        }
        process.exit(130);
      };
      process.once("SIGINT", onSignal);
      process.once("SIGTERM", onSignal);
      process.once("SIGHUP", onSignal);
      try {
        revertSources(root, gdir, mb, sources);
        runAndRecord(root, redTracks, "red", opts);
        rerunFailures(root, redTracks, "red", opts);
      } finally {
        restoreSources(root, gdir);
        process.removeListener("SIGINT", onSignal);
        process.removeListener("SIGTERM", onSignal);
        process.removeListener("SIGHUP", onSignal);
      }
    }

    const decided = tracks.map((tr) => decide(mode, tr.green, tr.red, tr.redDetail));
    let verdicts = relabelGuards(mode, decided.map((d) => d.verdict));
    // When the tests import the code from elsewhere, "passes on both sides"
    // says nothing about the change: report it as not judged, not as THEATER.
    const unreliable = receipt.warnings.length > 0;
    if (unreliable) {
      verdicts = verdicts.map((v) => (v === "THEATER" || v === "GUARD" || v === "PRESERVED" ? "SKIPPED" : v));
    }
    tracks.forEach((tr, i) => {
      const verdict = verdicts[i]!;
      const reason =
        verdict === decided[i]!.verdict
          ? decided[i]!.reason
          : verdict === "GUARD"
            ? GUARD_REASON
            : "not judged: the tests import the code from outside this checkout (see warning)";
      const raw =
        verdict === "BROKEN" || verdict === "FLAKY"
          ? firstErrorLine(tr.greenDetail)
          : verdict === "WEAK" || verdict === "PROVEN" || verdict === "CHANGED"
            ? firstErrorLine(tr.redDetail)
            : undefined;
      // The receipt may be posted publicly (PR comment, job summary): no secrets in it.
      const detail = raw === undefined ? undefined : plain(redact(raw));
      receipt.tests.push({ id: tr.test.id, test: tr.test, verdict, reason, detail, green: tr.green, red: tr.red });
      receipt.summary[verdict] = (receipt.summary[verdict] ?? 0) + 1;
    });
  }

  const failOn = new Set(opts.failOn.map((s) => s.toLowerCase()));
  for (const [verdict, count] of Object.entries(receipt.summary) as [Verdict, number][]) {
    if (failOn.has(verdict.toLowerCase())) receipt.violations.push(`${count} ${verdict}`);
  }
  if (receipt.status === "no-tests" && failOn.has("no-tests")) receipt.violations.push("code changed without tests");
  receipt.passed = receipt.violations.length === 0;
  return receipt;
}
