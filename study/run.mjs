#!/usr/bin/env node
// Batch-runs receipts over real history: for each repository, finds commits
// (or agent-authored pull requests) that change both code and tests, checks
// each one out, and records what receipts says about it.
//
//   node study/run.mjs --config study/repos.json --out study-out [--only click,sqlparse]
//
// Results land in <out>/results.jsonl, one line per commit; study/report.mjs
// turns them into a summary.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { classify } from "../plugin/skills/prove-fix/scripts/classify.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, "../plugin/skills/prove-fix/scripts/cli.js");

// Commit trailers and bot identities coding agents leave behind.
const AGENT_MARKERS = [
  ["claude-code", /Co-Authored-By:\s*Claude|Generated with \[Claude Code\]|claude\.ai\/code/i],
  ["copilot", /copilot-swe-agent|Co-authored-by:\s*Copilot/i],
  ["codex", /chatgpt-codex-connector|Co-authored-by:\s*Codex|codex\/[\w-]+/i],
  ["devin", /devin-ai-integration/i],
  ["cursor", /cursoragent|Co-authored-by:\s*Cursor/i],
  ["jules", /google-labs-jules/i],
];

// Best-effort install for repositories without a hand-written setup ("setup": "auto").
const AUTO_SETUP = {
  python: [
    "pip install -q -U pip",
    "pip install -q -e . || pip install -q .",
    "pip install -q pytest pytest-xdist",
    "for extra in dev test tests testing; do pip install -q -e \".[$extra]\" 2>/dev/null || true; done",
    "for group in dev test tests; do pip install -q --group $group 2>/dev/null || true; done",
  ],
  js: ["npm install --silent --no-audit --no-fund --ignore-scripts --legacy-peer-deps"],
};

const FIX_WORDS = /\b(fix(e[sd])?|bug|regression|crash|incorrect|wrong|broken|issue|error)\b/i;
const PY_TEST = /\.py$/;
const JS_TEST = /\.[cm]?[jt]sx?$/;

function sh(cwd, cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], ...opts });
}

function log(msg) {
  process.stderr.write(`[study] ${msg}\n`);
}

/** `prs` entries are PR numbers or `{ "number": 12, "agent": "codex" }`. */
function prNumber(p) {
  return typeof p === "object" ? p.number : p;
}

function agentOf(text) {
  for (const [name, re] of AGENT_MARKERS) if (re.test(text)) return name;
  return null;
}

/** Clones (blobless, fast) or updates a repository, then installs it into its own virtualenv. */
function prepare(repo, work) {
  const dir = path.join(work, "repos", repo.name);
  if (!fs.existsSync(dir)) {
    log(`${repo.name}: cloning ${repo.url}`);
    sh(work, "git", ["clone", "--quiet", "--filter=blob:none", repo.url, dir]);
  }
  if (repo.pulls || repo.prs) {
    // Pull request heads are plain refs on GitHub: agent PRs are reachable without the API.
    const specs = repo.prs
      ? repo.prs.map((p) => prNumber(p)).map((n) => `+refs/pull/${n}/head:refs/remotes/pull/${n}`)
      : ["+refs/pull/*/head:refs/remotes/pull/*"];
    log(`${repo.name}: fetching ${repo.prs ? repo.prs.length : "all"} pull request head(s)`);
    spawnSync("git", ["fetch", "--quiet", "--filter=blob:none", "origin", ...specs], {
      cwd: dir,
      stdio: "ignore",
      timeout: 20 * 60 * 1000,
    });
  }
  const defaultBranch = sh(dir, "git", ["rev-parse", "--abbrev-ref", "origin/HEAD"]).trim();
  sh(dir, "git", ["checkout", "--quiet", "--force", "--detach", defaultBranch]);

  // Variables the project's own test script sets (e.g. TZ for timezone suites).
  const env = { ...process.env, ...(repo.env ?? {}) };
  let python;
  if (repo.python !== false) {
    const venv = path.join(work, "venvs", repo.name);
    if (!fs.existsSync(venv)) sh(work, "python3", ["-m", "venv", venv]);
    python = path.join(venv, "bin", "python");
    env.PATH = `${path.join(venv, "bin")}${path.delimiter}${env.PATH}`;
    env.VIRTUAL_ENV = venv;
  }
  // Projects that manage their own environment (uv workspaces) point at it instead.
  if (repo.pythonPath) {
    python = path.join(dir, repo.pythonPath);
    env.PATH = `${path.dirname(python)}${path.delimiter}${env.PATH}`;
  }
  const marker = path.join(work, "venvs", `${repo.name}.ready`);
  if (!fs.existsSync(marker)) {
    const setup = repo.setup === "auto" ? AUTO_SETUP[repo.runner] : repo.setup ?? [];
    for (const cmd of setup) {
      log(`${repo.name}: ${cmd}`);
      const r = spawnSync("bash", ["-lc", cmd], { cwd: dir, env, encoding: "utf8", timeout: 20 * 60 * 1000 });
      if (r.status !== 0) throw new Error(`setup failed: ${cmd}\n${(r.stdout + r.stderr).slice(-2000)}`);
    }
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, new Date().toISOString());
  }
  return { dir, env, python, defaultBranch };
}

function changedPaths(dir, from, to) {
  const out = sh(dir, "git", ["diff", "--name-status", "-M", "-z", from, to]);
  const parts = out.split("\0");
  const files = [];
  for (let i = 0; i < parts.length; ) {
    const code = parts[i++];
    if (!code) continue;
    if (code[0] === "R" || code[0] === "C") {
      i++;
      files.push({ status: code[0], path: parts[i++] });
    } else files.push({ status: code[0], path: parts[i++] });
  }
  return files;
}

/** A change is worth checking when it edits code and adds or edits a test a supported runner can run. */
function interesting(files, runner) {
  const testRe = runner === "python" ? PY_TEST : JS_TEST;
  const tests = files.filter((f) => f.status !== "D" && classify(f.path) === "test" && testRe.test(f.path) && !f.path.endsWith("conftest.py"));
  const sources = files.filter((f) => classify(f.path) === "source" && !/\.(md|rst|txt)$/i.test(f.path));
  return tests.length > 0 && sources.length > 0;
}

/** Recent single-parent commits on the default branch that look like fixes and touch code and tests. */
function historyCandidates(repo, dir, defaultBranch) {
  const out = sh(dir, "git", ["log", "--no-merges", `-n${repo.scan ?? 400}`, "--format=%H%x1f%P%x1f%an <%ae>%x1f%s%x1f%b%x1e", defaultBranch]);
  const picks = [];
  const seen = new Set();
  for (const rec of out.split("\x1e")) {
    const [sha, parents, author, subject, body] = rec.trim().split("\x1f");
    if (!sha || !parents || parents.includes(" ")) continue;
    if (repo.fixesOnly !== false && !FIX_WORDS.test(`${subject}\n${body}`)) continue;
    // The same change cherry-picked onto a maintenance branch: count it once.
    if (seen.has(subject)) continue;
    seen.add(subject);
    const files = changedPaths(dir, parents, sha);
    if (!interesting(files, repo.runner)) continue;
    picks.push({ kind: "commit", sha, base: parents, subject, agent: agentOf(`${author}\n${body}`) });
    if (picks.length >= (repo.max ?? 8)) break;
  }
  return picks;
}

/**
 * Pull request heads whose commits carry an agent's marks. With an explicit
 * `prs` list (e.g. from the AIDev dataset) the agent is already known.
 */
function pullCandidates(repo, dir, defaultBranch) {
  const refs = sh(dir, "git", ["for-each-ref", "--format=%(refname:short)", "refs/remotes/pull/"]).split("\n").filter(Boolean);
  const known = repo.prs ? new Map(repo.prs.map((p) => [String(prNumber(p)), p.agent ?? repo.agent ?? "agent"])) : null;
  const picks = [];
  for (const ref of refs.sort((a, b) => Number(b.split("/").pop()) - Number(a.split("/").pop()))) {
    let mb;
    try {
      mb = sh(dir, "git", ["merge-base", defaultBranch, ref]).trim();
    } catch {
      continue;
    }
    const head = sh(dir, "git", ["rev-parse", ref]).trim();
    if (head === mb) continue;
    // A PR against another branch (a v1.x maintenance line) shares an old merge
    // base with the default branch and would drag that branch's history along.
    const ahead = Number(sh(dir, "git", ["rev-list", "--count", `${mb}..${head}`]).trim());
    if (ahead > (repo.maxPrCommits ?? 40)) continue;
    const number = ref.split("/").pop();
    if (known && !known.has(number)) continue;
    const text = sh(dir, "git", ["log", "--format=%an <%ae>%n%s%n%b", `${mb}..${ref}`]);
    const agent = known ? known.get(number) : agentOf(text);
    if (!agent) continue;
    const files = changedPaths(dir, mb, head);
    if (!interesting(files, repo.runner)) continue;
    const subject = sh(dir, "git", ["log", "-1", "--format=%s", ref]).trim();
    picks.push({ kind: "pull", pr: Number(ref.split("/").pop()), sha: head, base: mb, subject, agent });
    if (picks.length >= (repo.maxPulls ?? 15)) break;
  }
  return picks;
}

function check(repo, ctx, cand, outDir) {
  const { dir, env, python } = ctx;
  // A run killed earlier may have left its journal: finish that restore first,
  // or receipts rightly refuses to start on a half-reverted tree.
  spawnSync(process.execPath, [CLI, "restore"], { cwd: dir, stdio: "ignore" });
  sh(dir, "git", ["checkout", "--quiet", "--force", "--detach", cand.sha]);
  sh(dir, "git", ["clean", "-fdq"]);
  const json = path.join(outDir, "receipts", `${repo.name}-${cand.sha.slice(0, 10)}.json`);
  fs.mkdirSync(path.dirname(json), { recursive: true });
  const args = [CLI, "check", "--committed", "--base", cand.base, "--json", json, "--reruns", "1"];
  if (python) args.push("--python", python);
  if (repo.jsRunner) args.push("--js-runner", repo.jsRunner);
  const started = Date.now();
  const proc = spawnSync(process.execPath, args, {
    cwd: dir,
    env: { ...env, GITHUB_EVENT_PATH: "", GITHUB_BASE_REF: "", RECEIPTS_MODE: "" },
    encoding: "utf8",
    timeout: (repo.timeoutMin ?? 10) * 60 * 1000,
  });
  const receipt = fs.existsSync(json) ? JSON.parse(fs.readFileSync(json, "utf8")) : null;
  return {
    repo: repo.name,
    url: repo.url,
    ...cand,
    exit: proc.status,
    seconds: Math.round((Date.now() - started) / 1000),
    status: receipt?.status ?? "error",
    mode: receipt?.mode,
    summary: receipt?.summary ?? {},
    tests: (receipt?.tests ?? []).map((t) => ({ id: t.id, verdict: t.verdict, green: t.green, red: t.red })),
    unsupported: receipt?.unsupportedTestFiles ?? [],
    error: receipt ? undefined : `${proc.stderr ?? ""}`.trim().split("\n").slice(-15).join("\n") || String(proc.error ?? "timeout"),
  };
}

function main() {
  const { values } = parseArgs({
    options: {
      config: { type: "string", default: path.join(HERE, "repos.json") },
      out: { type: "string", default: "study-out" },
      only: { type: "string" },
    },
  });
  const out = path.resolve(values.out);
  const work = path.join(out, "work");
  fs.mkdirSync(work, { recursive: true });
  const only = values.only ? new Set(values.only.split(",")) : null;
  const repos = JSON.parse(fs.readFileSync(values.config, "utf8")).filter((r) => !only || only.has(r.name));
  const resultsFile = path.join(out, "results.jsonl");
  const done = new Set(
    fs.existsSync(resultsFile)
      ? fs.readFileSync(resultsFile, "utf8").split("\n").filter(Boolean).map((l) => {
          const r = JSON.parse(l);
          return `${r.repo}@${r.sha}`;
        })
      : [],
  );

  for (const repo of repos) {
    let ctx;
    try {
      ctx = prepare(repo, work);
    } catch (err) {
      log(`${repo.name}: skipped (${err.message.split("\n")[0]})`);
      fs.appendFileSync(path.join(out, "skipped.txt"), `${repo.name}: ${err.message}\n\n`);
      continue;
    }
    const cands = [
      ...(repo.history === false ? [] : historyCandidates(repo, ctx.dir, ctx.defaultBranch)),
      ...(repo.pulls || repo.prs ? pullCandidates(repo, ctx.dir, ctx.defaultBranch) : []),
    ];
    log(`${repo.name}: ${cands.length} candidate(s)`);
    for (const cand of cands) {
      if (done.has(`${repo.name}@${cand.sha}`)) continue;
      const result = check(repo, ctx, cand, out);
      const verdicts = Object.entries(result.summary).map(([v, n]) => `${n} ${v}`).join(", ");
      log(`${repo.name} ${cand.sha.slice(0, 8)} ${result.status} ${verdicts} (${result.seconds}s) ${cand.subject.slice(0, 60)}`);
      fs.appendFileSync(resultsFile, JSON.stringify(result) + "\n");
    }
    sh(ctx.dir, "git", ["checkout", "--quiet", "--force", "--detach", ctx.defaultBranch]);
  }
  log(`done: ${resultsFile}`);
}

main();
