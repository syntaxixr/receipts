import fs from "node:fs";
import path from "node:path";
import { locateJsSuites, locateJsTests } from "../locate/js.js";
import { locatePythonSuites, locatePythonTests } from "../locate/python.js";
import type { Outcome, RunnerName, TestCase, TestResult } from "../types.js";
import { runJs, type JsRunner } from "./js.js";
import { runPytest } from "./pytest.js";

/** One test outcome as the runner reports it. */
export interface RawItem {
  file: string;
  scope: string[];
  name: string;
  outcome: Outcome;
  detail?: string;
}

export interface RunResult {
  items: RawItem[];
  /** Files that failed before any test ran (import/collection errors). */
  fileErrors: Map<string, string>;
  /** Set when the run was killed for taking too long: tests without a result hung. */
  timedOut?: string;
  /** Real paths of the source files the tests imported, when the runner reports them (pytest). */
  imported?: Set<string>;
}

export interface RunOptions {
  python?: string;
  /** Per runner invocation. A hung run is killed and its unfinished tests count as failed. */
  timeoutMs?: number;
}

export interface Runner {
  name: RunnerName;
  language: "python" | "js";
  owns(file: string): boolean;
  locate(file: string, source: string): TestCase[];
  /** Line ranges of suites (test classes, describe blocks) whose shared setup and data serve the tests inside. */
  suites(source: string): { startLine: number; endLine: number }[];
  /** Runs the given files; runners that can select single tests use `tests` to run only those. */
  run(root: string, files: string[], opts: RunOptions, tests: TestCase[]): RunResult;
}

const PY_TEST = /\.py$/;
const JS_TEST = /\.[cm]?[jt]sx?$/;

const pytest: Runner = {
  name: "pytest",
  language: "python",
  suites: locatePythonSuites,
  owns: (file) => PY_TEST.test(file) && !file.endsWith("conftest.py"),
  locate: locatePythonTests,
  run: (root, files, opts, tests) => runPytest(root, files, opts, tests),
};

function jsRunner(name: JsRunner): Runner {
  return {
    name,
    language: "js",
    suites: locateJsSuites,
    owns: (file) => JS_TEST.test(file),
    locate: locateJsTests,
    run: (root, files, opts) => runJs(name, root, files, opts),
  };
}

function detectJsRunner(root: string): JsRunner | undefined {
  const pkgPath = path.join(root, "package.json");
  if (!fs.existsSync(pkgPath)) return undefined;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.vitest) return "vitest";
    if (deps.jest) return "jest";
    const script = String(pkg.scripts?.test ?? "");
    if (/\bvitest\b/.test(script)) return "vitest";
    if (/\bjest\b/.test(script)) return "jest";
  } catch {
    // Malformed package.json: no JS runner.
  }
  return undefined;
}

export function availableRunners(root: string, jsOverride?: string): Runner[] {
  const runners: Runner[] = [pytest];
  if (jsOverride && jsOverride !== "vitest" && jsOverride !== "jest") {
    throw new Error(`--js-runner must be vitest or jest (got "${jsOverride}")`);
  }
  const js = (jsOverride as JsRunner | undefined) ?? detectJsRunner(root);
  if (js) runners.push(jsRunner(js));
  return runners;
}

/**
 * Parametrized titles carry placeholders the runner fills in: printf-style
 * `%s`/`%d`/`%#`, `$field` for object tables, `${expr}` in templates, or `*`
 * for a non-literal title. Each becomes a wildcard.
 */
export function titleMatcher(title: string): RegExp {
  if (title === "*") return /^.*$/s;
  const parts = title.slice(0, 500).split(/(%[sdifjoOpc#]|\$\{[^}]*\}|\$[A-Za-z_][\w.]*|\$\d+)/);
  // Titles come from the repository. Many wildcards in one pattern backtrack
  // badly on a long non-matching name, so past a few only the prefix counts.
  if ((parts.length - 1) / 2 > 6) {
    return new RegExp(`^${parts[0]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "s");
  }
  const body = parts
    .map((part, idx) => (idx % 2 === 1 ? ".*" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%%/g, "%")))
    .join("");
  return new RegExp(`^${body}$`, "s");
}

function fold(prev: TestResult | undefined, next: TestResult): TestResult {
  if (!prev) return next;
  if (prev.outcome === "failed") return prev;
  if (next.outcome === "failed") return next;
  if (prev.outcome === "passed" || next.outcome === "passed") return { outcome: "passed" };
  return prev;
}

/** Folds every reported case of a located test (all its parametrizations) into one result. */
export function lookup(run: RunResult, t: TestCase): TestResult {
  const name = titleMatcher(t.name);
  const scope = t.scope.map(titleMatcher);
  let result: TestResult | undefined;
  for (const item of run.items) {
    if (item.file !== t.file || item.scope.length !== scope.length) continue;
    if (!name.test(item.name) || !scope.every((re, k) => re.test(item.scope[k]!))) continue;
    result = fold(result, { outcome: item.outcome, detail: item.detail });
  }
  if (result) return result;
  const fileError = run.fileErrors.get(t.file);
  if (fileError !== undefined) return { outcome: "failed", detail: fileError };
  // A test that never reported in a run killed for time is the one that hung.
  if (run.timedOut) return { outcome: "failed", detail: `${run.timedOut}: the test did not finish` };
  return { outcome: "missing" };
}
