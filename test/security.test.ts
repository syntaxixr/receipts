import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { BASE_TEST, FIXED, ROOT, commit, git, linkDir, makeRepo, runCli, treeState, write } from "./helpers.js";

const T = "tests/test_calendar.py";

function outsideDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "receipts-outside-"));
  fs.writeFileSync(path.join(dir, "mod.py"), "ORIGINAL\n");
  return dir;
}

function assertOutsideUntouched(dir: string): void {
  assert.deepEqual(fs.readdirSync(dir), ["mod.py"]);
  assert.equal(fs.readFileSync(path.join(dir, "mod.py"), "utf8"), "ORIGINAL\n");
}

test("a PR that turns a source directory into a symlink out of the repo is refused, nothing touched", async () => {
  const outside = outsideDir();
  const dir = makeRepo({ "pkg/mod.py": "X = 1\n" });
  fs.rmSync(path.join(dir, "pkg"), { recursive: true });
  linkDir(outside, path.join(dir, "pkg"));
  commit(dir, "fix: century years", {
    "calendar_utils.py": FIXED,
    [T]: BASE_TEST + "\n\ndef test_1900_is_not_leap():\n    assert not is_leap(1900)\n",
  });
  const before = treeState(dir);
  const run = await runCli(dir);
  assert.equal(run.code, 2, run.stdout + run.stderr);
  assert.match(run.stderr, /refusing to touch "pkg/);
  assertOutsideUntouched(outside);
  assert.equal(treeState(dir), before);
  assert.equal(fs.readlinkSync(path.join(dir, "pkg")), outside);
  assert.equal(fs.existsSync(path.join(dir, ".git", "receipts-backup")), false);
});

test("the same attack through an uncommitted, untracked symlink is refused too", async () => {
  const outside = outsideDir();
  const dir = makeRepo({ "pkg/mod.py": "X = 1\n" });
  write(dir, {
    "calendar_utils.py": FIXED,
    [T]: BASE_TEST + "\n\ndef test_1900_is_not_leap():\n    assert not is_leap(1900)\n",
  });
  fs.rmSync(path.join(dir, "pkg"), { recursive: true });
  linkDir(outside, path.join(dir, "pkg"));
  const before = treeState(dir);
  const run = await runCli(dir);
  assert.equal(run.code, 2, run.stdout + run.stderr);
  assert.match(run.stderr, /is a symlink/);
  assertOutsideUntouched(outside);
  assert.equal(treeState(dir), before);
});

test("a file that became a directory is refused cleanly instead of half-swapped", async () => {
  const dir = makeRepo({ "config.py": "A = 1\n" });
  fs.rmSync(path.join(dir, "config.py"));
  commit(dir, "fix: century years", {
    "config.py/__init__.py": "A = 2\n",
    "calendar_utils.py": FIXED,
    [T]: BASE_TEST + "\n\ndef test_1900_is_not_leap():\n    assert not is_leap(1900)\n",
  });
  const before = treeState(dir);
  const run = await runCli(dir);
  assert.equal(run.code, 2, run.stdout + run.stderr);
  assert.match(run.stderr, /file\/directory change is not supported/);
  assert.equal(treeState(dir), before);
});

test("an interrupted run is detected and `receipts restore` puts the files back", async () => {
  const dir = makeRepo();
  commit(dir, "fix: century years", {
    "calendar_utils.py": FIXED,
    [T]: BASE_TEST + "\n\ndef test_1900_is_not_leap():\n    assert not is_leap(1900)\n",
  });
  // Simulate a run killed mid-swap: journal the fixed file, then leave the old one in place.
  const backup = path.join(dir, ".git", "receipts-backup");
  fs.mkdirSync(backup);
  fs.copyFileSync(path.join(dir, "calendar_utils.py"), path.join(backup, "0.bin"));
  fs.writeFileSync(
    path.join(backup, "journal.json"),
    JSON.stringify({ createdDirs: [], entries: [{ path: "calendar_utils.py", existed: true, mode: 0o100644, blob: "0.bin" }] }),
  );
  write(dir, { "calendar_utils.py": "OLD\n" });

  const blocked = await runCli(dir);
  assert.equal(blocked.code, 2);
  assert.match(blocked.stderr, /receipts restore/);

  const { execFileSync } = await import("node:child_process");
  const out = execFileSync(process.execPath, [path.join(ROOT, "plugin/skills/prove-fix/scripts/cli.js"), "restore"], { cwd: dir, encoding: "utf8" });
  assert.match(out, /Restored/);
  assert.equal(fs.readFileSync(path.join(dir, "calendar_utils.py"), "utf8"), FIXED);
  assert.equal(fs.existsSync(backup), false);
  git(dir, "status", "--porcelain");
});

test("sanitizers: terminal escapes, bidi overrides, code-span breakouts and secrets", async () => {
  const { codeSpan, plain, redact } = await import("../src/sanitize.js");
  assert.equal(plain("a\u001b[2Jb\nc‮d"), "a [2Jb c d");
  assert.equal(codeSpan("x` | @admin <img>"), "`x' \\| @admin <img>`");
  const token = "ghp_" + "A".repeat(36);
  assert.equal(redact(`auth failed for ${token}`), "auth failed for ***");
  assert.equal(redact("key sk-ant-" + "b".repeat(30) + " end"), "key *** end");
  assert.equal(redact("pw=hunter2hunter2", { DB_PASSWORD: "hunter2hunter2" }), "pw=***");
  assert.equal(redact("nothing secret here"), "nothing secret here");
});

test("a failure message with escapes and a token is neutralized in every report", async () => {
  const dir = makeRepo();
  const token = "ghp_" + "Z".repeat(36);
  commit(dir, "fix: century years", {
    "calendar_utils.py": FIXED,
    [T]:
      BASE_TEST +
      `\n\ndef test_leaky():\n    raise AssertionError("\\x1b[2J\\u202e boom \`@maintainers\` ${token}")\n`,
  });
  const md = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "receipts-md-")), "r.md");
  const run = await runCli(dir, ["--markdown", md]);
  assert.equal(run.code, 1);
  const markdown = fs.readFileSync(md, "utf8");
  for (const [name, text] of [["stdout", run.stdout], ["markdown", markdown], ["json", JSON.stringify(run.receipt)]] as const) {
    assert.ok(!text.includes(token), `${name} leaks the token`);
    assert.ok(!text.includes("\u001b[2J"), `${name} carries a raw escape`);
    assert.ok(!text.includes("‮"), `${name} carries a bidi override`);
  }
  assert.match(run.stdout, /BROKEN/);
  assert.match(markdown, /boom '@maintainers' \*\*\*/);
});

test("a --base that looks like an option never reaches git as one", async () => {
  const dir = makeRepo();
  commit(dir, "fix: century years", { "calendar_utils.py": FIXED });
  const probe = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "receipts-opt-")), "written");
  const { execFile } = await import("node:child_process");
  const cli = path.join(ROOT, "plugin/skills/prove-fix/scripts/cli.js");
  const code = await new Promise<number>((resolve) => {
    execFile(process.execPath, [cli, "check", "--base", `--output=${probe}`], { cwd: dir }, (err) =>
      resolve(err ? (typeof err.code === "number" ? err.code : -1) : 0),
    );
  });
  assert.equal(code, 2);
  assert.equal(fs.existsSync(probe), false);
});
