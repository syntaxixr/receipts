import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { relPath } from "../paths.js";
import type { TestCase } from "../types.js";
import type { RawItem, RunOptions, RunResult } from "./index.js";

/** One line of the plugin's output (see receipts_pytest.py). */
type PluginRecord =
  | {
      type: "result";
      nodeid: string;
      when: "setup" | "call" | "teardown";
      path: string;
      cls: string | null;
      name: string;
      outcome: "passed" | "failed" | "skipped";
      detail: string;
    }
  | { type: "collectError"; path: string | null; nodeid: string; detail: string }
  | { type: "modules"; files: string[] }
  | { type: "end"; exitstatus: number };

// scripts/runners/pytest.js -> scripts/pytest, where receipts_pytest.py ships.
const PLUGIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../pytest");

function pickPython(explicit?: string): string {
  if (explicit) return explicit;
  if (process.env.RECEIPTS_PYTHON) return process.env.RECEIPTS_PYTHON;
  for (const candidate of ["python", "python3"]) {
    if (spawnSync(candidate, ["--version"], { stdio: "ignore" }).status === 0) return candidate;
  }
  throw new Error("No Python interpreter found. Pass --python <path>.");
}

/**
 * Runs just the given tests by node id (`file::Class::test`), which keeps large
 * test modules fast. A node id pytest cannot resolve (nested classes, dynamic
 * names) makes it abort, so that falls back to running the whole files.
 */
export function runPytest(root: string, testFiles: string[], opts: RunOptions = {}, tests: TestCase[] = []): RunResult {
  if (tests.length > 0) {
    const nodeIds = [...new Set(tests.map((t) => [t.file, ...t.scope, t.name].join("::")))];
    const byId = runPytestArgs(root, nodeIds, opts);
    if (byId) return byId;
  }
  const byFile = runPytestArgs(root, testFiles, opts);
  if (!byFile) throw new Error(`pytest did not produce results for ${testFiles.join(", ")}`);
  return byFile;
}

function runPytestArgs(root: string, targetsIn: string[], opts: RunOptions): RunResult | undefined {
  // A root-level file named "-p..." must stay a path, not become an option.
  const targets = targetsIn.map((t) => (t.startsWith("-") ? `./${t}` : t));
  const python = pickPython(opts.python);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "receipts-pytest-"));
  const outFile = path.join(scratch, "out.json");
  try {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      RECEIPTS_PYTEST_OUT: outFile,
      PYTHONPATH: [PLUGIN_DIR, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
      // Fresh bytecode cache per run: a same-size edit within the same second
      // would otherwise let Python reuse the other side's stale .pyc.
      PYTHONDONTWRITEBYTECODE: "1",
      PYTHONPYCACHEPREFIX: path.join(scratch, "pycache"),
    };
    const args = ["-m", "pytest", "-p", "receipts_pytest", "-p", "no:cacheprovider", "-q", "--no-header", ...targets];
    const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
    const proc = spawnSync(python, args, {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: timeoutMs,
      killSignal: "SIGKILL",
      maxBuffer: 64 * 1024 * 1024,
    });
    const timedOut = (proc.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT";
    if (proc.error && !timedOut) throw proc.error;

    const records: PluginRecord[] = fs.existsSync(outFile)
      ? fs.readFileSync(outFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as PluginRecord)
      : [];
    const ended = records.some((r) => r.type === "end");
    // Exit 4 is a usage error, such as a node id pytest could not find.
    if (!timedOut && (!ended || proc.status === 4)) {
      if (targets.some((t) => t.includes("::"))) return undefined;
      const tail = `${proc.stdout ?? ""}\n${proc.stderr ?? ""}`.trim().split("\n").slice(-20).join("\n");
      throw new Error(`pytest did not produce results (exit ${proc.status}).\n${tail}`);
    }

    // setup / call / teardown arrive as separate records: a test failed if any
    // phase failed. It only finished once its call phase reported (or its setup
    // failed or skipped): a passed setup alone is a test that hung in its body.
    const byNode = new Map<string, RawItem & { finished: boolean }>();
    const fileErrors = new Map<string, string>();
    const imported = new Set<string>();
    for (const rec of records) {
      if (rec.type === "modules") {
        for (const f of rec.files) imported.add(f);
        continue;
      }
      if (rec.type === "collectError") {
        if (rec.path) fileErrors.set(relPath(root, rec.path), rec.detail);
        continue;
      }
      if (rec.type !== "result") continue;
      const item = byNode.get(rec.nodeid) ?? {
        file: relPath(root, rec.path),
        scope: rec.cls ? [rec.cls] : [],
        name: rec.name,
        outcome: "passed" as const,
        finished: false,
      };
      if (rec.when === "call" || rec.outcome !== "passed") item.finished = true;
      if (rec.outcome === "failed") {
        item.outcome = "failed";
        item.detail = rec.detail || undefined;
      } else if (rec.outcome === "skipped" && item.outcome === "passed") {
        item.outcome = "skipped";
      }
      byNode.set(rec.nodeid, item);
    }
    return {
      items: [...byNode.values()].filter((i) => i.finished).map(({ finished: _, ...item }) => item),
      fileErrors,
      timedOut: timedOut ? `timed out after ${Math.round(timeoutMs / 1000)}s` : undefined,
      imported,
    };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
