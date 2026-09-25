import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { BASE_TEST, BUGGY, FIXED, canSymlinkFiles, commit, git, makeRepo, runCli, treeState, verdicts, write } from "./helpers.js";

const T = "tests/test_calendar.py";

test("a fix whose test fails on the old code is PROVEN", async () => {
  const dir = makeRepo();
  commit(dir, "fix: century years are not leap years", {
    "calendar_utils.py": FIXED,
    [T]: BASE_TEST + "\n\ndef test_1900_is_not_leap():\n    assert not is_leap(1900)\n",
  });
  const before = treeState(dir);
  const run = await runCli(dir);
  assert.equal(run.code, 0, run.stdout + run.stderr);
  assert.deepEqual(verdicts(run.receipt), { [`${T}::test_1900_is_not_leap`]: "PROVEN" });
  assert.equal(treeState(dir), before, "working tree must be left exactly as it was");
  assert.equal(fs.readFileSync(path.join(dir, "calendar_utils.py"), "utf8"), FIXED);
});

test("a fix whose test also passes on the old code is THEATER and fails the check", async () => {
  const dir = makeRepo();
  commit(dir, "fix: century years are not leap years", {
    "calendar_utils.py": FIXED,
    [T]: BASE_TEST + "\n\ndef test_2020_is_leap():\n    assert is_leap(2020)\n",
  });
  const run = await runCli(dir);
  assert.equal(run.code, 1);
  assert.deepEqual(verdicts(run.receipt), { [`${T}::test_2020_is_leap`]: "THEATER" });
  assert.match(run.stdout, /FAIL: 1 THEATER/);
});

test("a new function's test fails on the old code only by ImportError: WEAK, fine for a feature", async () => {
  const dir = makeRepo();
  commit(dir, "feat: days_in_year", {
    "calendar_utils.py": BUGGY + "\n\ndef days_in_year(year):\n    return 366 if is_leap(year) else 365\n",
    "tests/test_days.py": "from calendar_utils import days_in_year\n\n\ndef test_days():\n    assert days_in_year(2023) == 365\n",
  });
  const run = await runCli(dir);
  assert.equal(run.code, 0, run.stdout + run.stderr);
  assert.equal(run.receipt?.mode, "feat");
  assert.deepEqual(verdicts(run.receipt), { "tests/test_days.py::test_days": "WEAK" });
});

test("a test that fails with the change applied is BROKEN", async () => {
  const dir = makeRepo();
  commit(dir, "fix: century years", {
    "calendar_utils.py": BUGGY.replace("year % 4", "(year % 4)"),
    [T]: BASE_TEST + "\n\ndef test_1900_is_not_leap():\n    assert not is_leap(1900)\n",
  });
  const run = await runCli(dir);
  assert.equal(run.code, 1);
  assert.deepEqual(verdicts(run.receipt), { [`${T}::test_1900_is_not_leap`]: "BROKEN" });
});

test("refactor mode: a test passing before and after is PRESERVED, a behavior change is CHANGED", async () => {
  const same = makeRepo();
  commit(same, "refactor: name the divisor", {
    "calendar_utils.py": "LEAP_EVERY = 4\n\n\ndef is_leap(year):\n    return year % LEAP_EVERY == 0\n",
    [T]: BASE_TEST + "\n\ndef test_2023_is_not_leap():\n    assert not is_leap(2023)\n",
  });
  const kept = await runCli(same);
  assert.equal(kept.code, 0, kept.stdout + kept.stderr);
  assert.equal(kept.receipt?.mode, "refactor");
  assert.deepEqual(verdicts(kept.receipt), { [`${T}::test_2023_is_not_leap`]: "PRESERVED" });

  const changed = makeRepo();
  commit(changed, "refactor: tidy is_leap", {
    "calendar_utils.py": FIXED,
    [T]: BASE_TEST + "\n\ndef test_1900():\n    assert not is_leap(1900)\n",
  });
  const run = await runCli(changed);
  assert.equal(run.code, 1);
  assert.deepEqual(verdicts(run.receipt), { [`${T}::test_1900`]: "CHANGED" });
});

test("a test that flips between runs is FLAKY, not BROKEN", async () => {
  const dir = makeRepo();
  const counter = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "receipts-flaky-")), "count");
  commit(dir, "fix: century years", {
    "calendar_utils.py": FIXED,
    "tests/test_flaky.py": [
      "import os",
      "from calendar_utils import is_leap",
      "",
      "",
      "def test_sometimes():",
      "    path = os.environ['FLAKY_COUNTER']",
      "    n = int(open(path).read()) + 1 if os.path.exists(path) else 1",
      "    open(path, 'w').write(str(n))",
      "    assert n % 2 == 0 and not is_leap(1900)",
      "",
    ].join("\n"),
  });
  const run = await runCli(dir, [], { FLAKY_COUNTER: counter });
  assert.deepEqual(verdicts(run.receipt), { "tests/test_flaky.py::test_sometimes": "FLAKY" });
});

test("code changed without any test: status no-tests, failing only when asked", async () => {
  const dir = makeRepo();
  commit(dir, "fix: century years", { "calendar_utils.py": FIXED });
  const lenient = await runCli(dir);
  assert.equal(lenient.code, 0);
  assert.equal(lenient.receipt?.status, "no-tests");
  const strict = await runCli(dir, ["--fail-on", "no-tests"]);
  assert.equal(strict.code, 1);
});

test("uncommitted work is checked too, and restored byte for byte", async () => {
  const dir = makeRepo();
  write(dir, {
    "calendar_utils.py": FIXED,
    [T]: BASE_TEST + "\n\ndef test_1900_is_not_leap():\n    assert not is_leap(1900)\n",
    "helpers_new.py": "X = 1\n",
  });
  const before = treeState(dir);
  const run = await runCli(dir);
  assert.equal(run.code, 0, run.stdout + run.stderr);
  assert.equal(run.receipt?.head.dirty, true);
  assert.deepEqual(verdicts(run.receipt), { [`${T}::test_1900_is_not_leap`]: "PROVEN" });
  assert.equal(treeState(dir), before);
  assert.equal(fs.readFileSync(path.join(dir, "helpers_new.py"), "utf8"), "X = 1\n");
});

test("only the edited tests are judged; class methods, parametrized cases and removed tests are handled", async () => {
  const dir = makeRepo({
    "tests/test_more.py": [
      "import pytest",
      "from calendar_utils import is_leap",
      "",
      "",
      "def test_old_one():",
      "    assert is_leap(2000)",
      "",
      "",
      "def test_to_remove():",
      "    assert is_leap(2008)",
      "",
    ].join("\n"),
  });
  commit(dir, "fix: century years", {
    "calendar_utils.py": FIXED,
    "tests/test_more.py": [
      "import pytest",
      "from calendar_utils import is_leap",
      "",
      "",
      "def test_old_one():",
      "    assert is_leap(2000)",
      "",
      "",
      "class TestCenturies:",
      "    @pytest.mark.parametrize('year', [1700, 1800, 1900])",
      "    def test_not_leap(self, year):",
      "        assert not is_leap(year)",
      "",
    ].join("\n"),
  });
  const run = await runCli(dir);
  assert.equal(run.code, 0, run.stdout + run.stderr);
  assert.deepEqual(verdicts(run.receipt), { "tests/test_more.py::TestCenturies::test_not_leap": "PROVEN" });
  assert.deepEqual(run.receipt?.removedTests, ["tests/test_more.py::test_to_remove"]);
});

test("a source file added or deleted by the change is restored afterwards", async () => {
  const dir = makeRepo({ "legacy.py": "OLD = True\n" });
  commit(dir, "fix: move leap logic", {
    "legacy.py": null,
    "calendar_utils.py": "from leap_rules import is_leap\n",
    "leap_rules.py": FIXED,
    [T]: BASE_TEST + "\n\ndef test_1900_is_not_leap():\n    assert not is_leap(1900)\n",
  });
  const before = treeState(dir);
  const run = await runCli(dir);
  assert.equal(run.code, 0, run.stdout + run.stderr);
  assert.deepEqual(verdicts(run.receipt), { [`${T}::test_1900_is_not_leap`]: "PROVEN" });
  assert.equal(treeState(dir), before);
  assert.equal(fs.existsSync(path.join(dir, "legacy.py")), false);
  assert.equal(fs.existsSync(path.join(dir, "leap_rules.py")), true);
});

test("a same-size fix is not masked by a cached .pyc from the other side", async () => {
  const dir = makeRepo();
  const sameSize = BUGGY.replace("== 0", "!= 1").replace("% 4", "% 2");
  assert.equal(sameSize.length, BUGGY.length);
  commit(dir, "fix: parity", {
    "calendar_utils.py": sameSize,
    [T]: BASE_TEST + "\n\ndef test_2022():\n    assert is_leap(2022)\n",
  });
  const run = await runCli(dir);
  assert.deepEqual(verdicts(run.receipt), { [`${T}::test_2022`]: "PROVEN" });
});

test("untracked dependency and cache directories are never treated as part of the change", async () => {
  const dir = makeRepo();
  commit(dir, "fix: century years", {
    "calendar_utils.py": FIXED,
    [T]: BASE_TEST + "\n\ndef test_1900_is_not_leap():\n    assert not is_leap(1900)\n",
  });
  write(dir, { "node_modules/pkg/index.js": "module.exports = 1;\n", ".venv/lib/x.py": "X = 1\n" });
  const run = await runCli(dir);
  assert.equal(run.code, 0, run.stdout + run.stderr);
  assert.deepEqual(run.receipt?.sourceFiles, ["calendar_utils.py"]);
  assert.equal(fs.existsSync(path.join(dir, "node_modules/pkg/index.js")), true);
});

test("--committed checks HEAD only and refuses a dirty tree", async () => {
  const dir = makeRepo();
  commit(dir, "fix: century years", {
    "calendar_utils.py": FIXED,
    [T]: BASE_TEST + "\n\ndef test_1900_is_not_leap():\n    assert not is_leap(1900)\n",
  });
  write(dir, { "scratch.py": "print('not part of the commit')\n" });
  const run = await runCli(dir, ["--committed"]);
  assert.equal(run.code, 0, run.stdout + run.stderr);
  assert.deepEqual(run.receipt?.sourceFiles, ["calendar_utils.py"]);
  assert.deepEqual(verdicts(run.receipt), { [`${T}::test_1900_is_not_leap`]: "PROVEN" });

  write(dir, { "calendar_utils.py": FIXED + "# edit\n" });
  const dirty = await runCli(dir, ["--committed"]);
  assert.equal(dirty.code, 2);
  assert.match(dirty.stderr, /clean working tree/);
});

test("unittest.TestCase classes are located whatever their name", async () => {
  const dir = makeRepo();
  commit(dir, "fix: century years", {
    "calendar_utils.py": FIXED,
    "tests/test_unit_style.py":
      "import unittest\nfrom calendar_utils import is_leap\n\n\nclass LeapTests(unittest.TestCase):\n    def test_1900(self):\n        self.assertFalse(is_leap(1900))\n",
  });
  const run = await runCli(dir);
  assert.deepEqual(verdicts(run.receipt), { "tests/test_unit_style.py::LeapTests::test_1900": "PROVEN" });
});

test("pytest-xdist in addopts (-n 2) still reports every test", async () => {
  const dir = makeRepo({ "pytest.ini": "[pytest]\naddopts = -n 2\n" });
  commit(dir, "fix: century years", {
    "calendar_utils.py": FIXED,
    "tests/test_more.py": [
      "import pytest",
      "from calendar_utils import is_leap",
      "",
      "",
      "class TestCenturies:",
      "    @pytest.mark.parametrize('year', [1700, 1800, 1900])",
      "    def test_not_leap(self, year):",
      "        assert not is_leap(year)",
      "",
    ].join("\n"),
  });
  const run = await runCli(dir);
  assert.equal(run.code, 0, run.stdout + run.stderr);
  assert.deepEqual(verdicts(run.receipt), { "tests/test_more.py::TestCenturies::test_not_leap": "PROVEN" });
});

test.skipIf(!canSymlinkFiles)("a symlinked source file is swapped as a link and restored as the same link", async () => {
  const dir = makeRepo({ "impl/v1.py": BUGGY, "impl/v2.py": FIXED, "calendar_utils.py": BUGGY });
  fs.rmSync(path.join(dir, "calendar_utils.py"));
  fs.symlinkSync("impl/v1.py", path.join(dir, "calendar_utils.py"));
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "link to v1");
  git(dir, "branch", "-f", "main");
  fs.rmSync(path.join(dir, "calendar_utils.py"));
  fs.symlinkSync("impl/v2.py", path.join(dir, "calendar_utils.py"));
  commit(dir, "fix: point at v2", {
    [T]: BASE_TEST + "\n\ndef test_1900_is_not_leap():\n    assert not is_leap(1900)\n",
  });
  const before = treeState(dir);
  const run = await runCli(dir);
  assert.equal(run.code, 0, run.stdout + run.stderr);
  assert.deepEqual(verdicts(run.receipt), { [`${T}::test_1900_is_not_leap`]: "PROVEN" });
  // Windows reports link targets with backslashes.
  assert.equal(fs.readlinkSync(path.join(dir, "calendar_utils.py")).replaceAll("\\", "/"), "impl/v2.py");
  assert.equal(treeState(dir), before);
});

test("a fix for a hang: the old code never returns, the test times out there, and that is PROVEN", async () => {
  const dir = makeRepo();
  write(dir, {
    "calendar_utils.py": "def is_leap(year):\n    while year % 100 == 0 and year % 400 != 0:\n        pass\n    return year % 4 == 0\n",
  });
  git(dir, "commit", "-qam", "hangs on 1900");
  git(dir, "branch", "-f", "main");
  commit(dir, "fix: do not hang on century years", {
    "calendar_utils.py": FIXED,
    [T]: BASE_TEST + "\n\ndef test_1900_is_not_leap():\n    assert not is_leap(1900)\n",
  });
  const started = Date.now();
  const run = await runCli(dir, ["--timeout", "4"]);
  assert.equal(run.code, 0, run.stdout + run.stderr);
  assert.deepEqual(verdicts(run.receipt), { [`${T}::test_1900_is_not_leap`]: "PROVEN" });
  assert.match(run.receipt?.tests[0]?.detail ?? "", /timed out after 4s/);
  assert.ok(Date.now() - started < 20_000, "a hung test is not re-run");
});

test("a change to CI config or lockfiles only has nothing to prove", async () => {
  const dir = makeRepo();
  commit(dir, "chore: bump an action", { ".github/workflows/ci.yml": "name: CI\n", "requirements.txt": "pytest\n" });
  const run = await runCli(dir, ["--fail-on", "no-tests"]);
  assert.equal(run.code, 0, run.stdout + run.stderr);
  assert.equal(run.receipt?.status, "no-changes");
  assert.match(run.stdout, /No code or test changes/);
});

test("tests that import an installed copy (site-packages) get a warning, not a false THEATER", async () => {
  const dir = makeRepo();
  // src layout: the checkout's module is not importable by itself...
  fs.mkdirSync(path.join(dir, "src"));
  git(dir, "mv", "calendar_utils.py", "src/calendar_utils.py");
  git(dir, "commit", "-qm", "src layout");
  git(dir, "branch", "-f", "main");
  // ...the tests get a non-editable install instead, frozen at the fixed version.
  const site = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "receipts-site-")), "lib", "site-packages");
  fs.mkdirSync(site, { recursive: true });
  fs.writeFileSync(path.join(site, "calendar_utils.py"), FIXED);
  commit(dir, "fix: century years", {
    "src/calendar_utils.py": FIXED,
    [T]: BASE_TEST + "\n\ndef test_1900_is_not_leap():\n    assert not is_leap(1900)\n",
  });
  const run = await runCli(dir, [], { PYTHONPATH: site });
  assert.equal(run.code, 0, run.stdout + run.stderr);
  assert.equal(run.receipt?.warnings.length, 1);
  assert.match(run.receipt!.warnings[0]!, /src\/calendar_utils\.py was imported from .*site-packages[\\/]calendar_utils\.py/);
  assert.deepEqual(verdicts(run.receipt), { [`${T}::test_1900_is_not_leap`]: "SKIPPED" });
  assert.match(run.stdout, /pip install -e/);
});

test("a normal checkout import produces no warning", async () => {
  const dir = makeRepo();
  commit(dir, "fix: century years", {
    "calendar_utils.py": FIXED,
    [T]: BASE_TEST + "\n\ndef test_1900_is_not_leap():\n    assert not is_leap(1900)\n",
  });
  const run = await runCli(dir);
  assert.deepEqual(run.receipt?.warnings, []);
  assert.deepEqual(verdicts(run.receipt), { [`${T}::test_1900_is_not_leap`]: "PROVEN" });
});
