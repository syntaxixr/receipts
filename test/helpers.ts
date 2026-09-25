import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Receipt } from "../src/types.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Scenarios drive the built CLI, exactly as users run it (`npm test` builds first).
const CLI = path.join(ROOT, "plugin/skills/prove-fix/scripts/cli.js");

export const BUGGY = `def is_leap(year):
    return year % 4 == 0
`;

export const FIXED = `def is_leap(year):
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
`;

export const BASE_TEST = `from calendar_utils import is_leap


def test_2024_is_leap():
    assert is_leap(2024)
`;

// A link to a directory: a junction on Windows, which needs no special rights.
export function linkDir(target: string, at: string): void {
  fs.symlinkSync(target, at, process.platform === "win32" ? "junction" : "dir");
}

// Windows creates file symlinks only with Developer Mode or admin rights.
export const canSymlinkFiles = ((): boolean => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "receipts-link-"));
  try {
    fs.symlinkSync("target", path.join(dir, "link"));
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
})();

export function git(dir: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], {
    cwd: dir,
    encoding: "utf8",
  });
}

export function write(dir: string, files: Record<string, string | null>): void {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    if (content === null) fs.rmSync(abs, { force: true });
    else {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }
  }
}

/** A repo whose main branch holds a leap-year bug and one passing test. */
export function makeRepo(extraBase: Record<string, string> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "receipts-fixture-"));
  git(dir, "init", "-q", "-b", "main");
  write(dir, {
    "pytest.ini": "[pytest]\n",
    "calendar_utils.py": BUGGY,
    "tests/test_calendar.py": BASE_TEST,
    ...extraBase,
  });
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "initial");
  git(dir, "checkout", "-q", "-b", "pr");
  return dir;
}

export function commit(dir: string, message: string, files: Record<string, string | null>): void {
  write(dir, files);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", message);
}

export interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
  receipt?: Receipt;
}

/**
 * Runs the built CLI asynchronously: a synchronous spawn would block the vitest
 * worker for the whole run and trip its RPC timeouts on a busy machine.
 */
export function runCli(dir: string, args: string[] = [], env: Record<string, string> = {}): Promise<CliRun> {
  const jsonOut = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "receipts-out-")), "receipt.json");
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI, "check", "--base", "main", "--json", jsonOut, ...args],
      {
        cwd: dir,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, GITHUB_EVENT_PATH: "", GITHUB_BASE_REF: "", RECEIPTS_MODE: "", GITHUB_STEP_SUMMARY: "", ...env },
      },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === "number" ? error.code : -1) : 0;
        const receipt = fs.existsSync(jsonOut) ? (JSON.parse(fs.readFileSync(jsonOut, "utf8")) as Receipt) : undefined;
        resolve({ code, stdout, stderr, receipt });
      },
    );
  });
}

export function verdicts(r: Receipt | undefined): Record<string, string> {
  return Object.fromEntries((r?.tests ?? []).map((t) => [t.id, t.verdict]));
}

/** Snapshot of everything a run must leave untouched. */
export function treeState(dir: string): string {
  return git(dir, "status", "--porcelain", "--untracked-files=all") + git(dir, "diff") + git(dir, "rev-parse", "HEAD");
}
