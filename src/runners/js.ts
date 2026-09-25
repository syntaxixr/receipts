import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { relPath } from "../paths.js";
import type { Outcome } from "../types.js";
import type { RawItem, RunOptions, RunResult } from "./index.js";

export type JsRunner = "vitest" | "jest";

// vitest's JSON reporter follows jest's --json format, so one parser reads both.
interface JestJson {
  testResults: {
    name: string;
    status: string;
    message?: string;
    assertionResults: {
      ancestorTitles: string[];
      title: string;
      status: string;
      failureMessages?: string[];
    }[];
  }[];
}

function outcomeOf(status: string): Outcome {
  if (status === "passed") return "passed";
  if (status === "failed") return "failed";
  return "skipped";
}

function trim(text: string, limit = 4000): string {
  return text.length <= limit ? text : text.slice(-limit);
}

/**
 * Only the project's own installed runner is used. No npx fallback: it could
 * resolve a name from the registry, and running whatever it downloads is not
 * something a verification tool should ever do.
 *
 * The runner's own entry script runs under this Node, not `node_modules/.bin`:
 * on Windows that holds `.cmd` shims, which only start through a shell.
 */
function binary(root: string, name: JsRunner): [string, string[]] {
  const pkgDir = path.join(root, "node_modules", name);
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8")) as {
      bin?: string | Record<string, string>;
    };
    const entry = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.[name];
    if (entry && fs.existsSync(path.join(pkgDir, entry))) return [process.execPath, [path.join(pkgDir, entry)]];
  } catch {
    // Not a plain install; try the .bin link below.
  }
  const local = path.join(root, "node_modules", ".bin", name);
  if (process.platform !== "win32" && fs.existsSync(local)) return [local, []];
  throw new Error(`${name} is not installed in ${path.join(root, "node_modules")}. Install the project's dependencies first.`);
}

export function runJs(name: JsRunner, root: string, files: string[], opts: RunOptions = {}): RunResult {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `receipts-${name}-`));
  const outFile = path.join(scratch, "out.json");
  try {
    const [cmd, prefix] = binary(root, name);
    // A root-level file named "-x.test.js" must stay a path, not become an option.
    files = files.map((f) => (f.startsWith("-") ? `./${f}` : f));
    const args = [
      ...prefix,
      ...(name === "vitest"
        ? ["run","--reporter=json", `--outputFile=${outFile}`, ...files]
        : ["--json", `--outputFile=${outFile}`, "--watchAll=false", "--runTestsByPath", ...files]),
    ];
    const proc = spawnSync(cmd, args, {
      cwd: root,
      env: { ...process.env, CI: "1", NO_COLOR: "1", FORCE_COLOR: "0" },
      encoding: "utf8",
      timeout: opts.timeoutMs ?? 10 * 60 * 1000,
      maxBuffer: 64 * 1024 * 1024,
    });
    if (proc.error) throw proc.error;
    if (!fs.existsSync(outFile)) {
      const tail = `${proc.stdout ?? ""}\n${proc.stderr ?? ""}`.trim().split("\n").slice(-20).join("\n");
      throw new Error(`${name} did not produce results (exit ${proc.status}).\n${tail}`);
    }
    const data = JSON.parse(fs.readFileSync(outFile, "utf8")) as JestJson;

    const items: RawItem[] = [];
    const fileErrors = new Map<string, string>();
    for (const suite of data.testResults) {
      const file = relPath(root, suite.name);
      if (suite.assertionResults.length === 0 && suite.status === "failed") {
        fileErrors.set(file, trim(suite.message ?? "test file failed to load"));
      }
      for (const a of suite.assertionResults) {
        const detail = (a.failureMessages ?? []).join("\n");
        items.push({
          file,
          scope: a.ancestorTitles,
          name: a.title,
          outcome: outcomeOf(a.status),
          detail: detail ? trim(detail) : undefined,
        });
      }
    }
    return { items, fileErrors };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
