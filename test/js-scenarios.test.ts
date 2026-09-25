import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { ROOT, commit, git, linkDir, runCli, treeState, verdicts, write } from "./helpers.js";

// Fixture repos borrow this package's node_modules (vitest and jest are devDependencies).
const NODE_MODULES = path.join(ROOT, "node_modules");

const BUGGY_ESM = "export function isLeap(year) {\n  return year % 4 === 0;\n}\n";
const FIXED_ESM =
  "export function isLeap(year) {\n  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);\n}\n";

const VITEST_BASE = `import { describe, it, expect } from "vitest";
import { isLeap } from "../src/calendar.js";

describe("isLeap", () => {
  it("2024 is leap", () => {
    expect(isLeap(2024)).toBe(true);
  });
});
`;

function makeJsRepo(runner: "vitest" | "jest", files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `receipts-${runner}-`));
  git(dir, "init", "-q", "-b", "main");
  linkDir(NODE_MODULES, path.join(dir, "node_modules"));
  const pkg =
    runner === "vitest"
      ? { name: "fixture", type: "module", devDependencies: { vitest: "*" } }
      : { name: "fixture", devDependencies: { jest: "*" } };
  write(dir, { ".gitignore": "node_modules\n", "package.json": JSON.stringify(pkg, null, 2) + "\n", ...files });
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "initial");
  git(dir, "checkout", "-q", "-b", "pr");
  return dir;
}

function withTests(base: string, extra: string): string {
  // Insert extra cases before the closing of the describe block.
  return base.replace(/\n}\);\n$/, `\n${extra}});\n`);
}

test("vitest: a PROVEN test next to one that passes anyway: the second is a GUARD, tree restored", async () => {
  const dir = makeJsRepo("vitest", { "src/calendar.js": BUGGY_ESM, "test/calendar.test.js": VITEST_BASE });
  commit(dir, "fix: century years", {
    "src/calendar.js": FIXED_ESM,
    "test/calendar.test.js": withTests(
      VITEST_BASE,
      '\n  it("1900 is not leap", () => {\n    expect(isLeap(1900)).toBe(false);\n  });\n\n  it("2020 is leap", () => {\n    expect(isLeap(2020)).toBe(true);\n  });\n',
    ),
  });
  const before = treeState(dir);
  const run = await runCli(dir);
  assert.equal(run.code, 0, run.stdout + run.stderr);
  assert.deepEqual(verdicts(run.receipt), {
    "test/calendar.test.js::isLeap > 1900 is not leap": "PROVEN",
    "test/calendar.test.js::isLeap > 2020 is leap": "GUARD",
  });
  assert.deepEqual(run.receipt?.runners, ["vitest"]);
  assert.equal(treeState(dir), before);
});

test("vitest: .each cases fold into one test; a new export is WEAK", async () => {
  const dir = makeJsRepo("vitest", { "src/calendar.js": BUGGY_ESM, "test/calendar.test.js": VITEST_BASE });
  commit(dir, "fix: century years", {
    "src/calendar.js": FIXED_ESM + "\nexport const daysIn = (y) => (isLeap(y) ? 366 : 365);\n",
    "test/calendar.test.js": withTests(
      VITEST_BASE,
      '\n  it.each([[1700], [1800], [1900]])("%i is not leap", (y) => {\n    expect(isLeap(y)).toBe(false);\n  });\n',
    ),
    "test/days.test.ts":
      'import { it, expect } from "vitest";\nimport { daysIn } from "../src/calendar.js";\n\nit("2023 has 365 days", () => {\n  expect(daysIn(2023)).toBe(365);\n});\n',
  });
  const run = await runCli(dir);
  assert.deepEqual(verdicts(run.receipt), {
    "test/calendar.test.js::isLeap > %i is not leap": "PROVEN",
    "test/days.test.ts::2023 has 365 days": "WEAK",
  });
  assert.equal(run.code, 0, run.stdout + run.stderr);
});

test("jest: PROVEN and GUARD with CommonJS; THEATER when nothing proves the fix", async () => {
  const base = `const { isLeap } = require("../src/calendar");

describe("isLeap", () => {
  test("2024 is leap", async () => {
    expect(isLeap(2024)).toBe(true);
  });
});
`;
  const dir = makeJsRepo("jest", {
    "src/calendar.js": "exports.isLeap = (year) => year % 4 === 0;\n",
    "__tests__/calendar.test.js": base,
  });
  commit(dir, "fix: century years", {
    "src/calendar.js": "exports.isLeap = (year) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);\n",
    "__tests__/calendar.test.js": withTests(
      base,
      '\n  test("1900 is not leap", async () => {\n    expect(isLeap(1900)).toBe(false);\n  });\n\n  test("2020 is leap", async () => {\n    expect(isLeap(2020)).toBe(true);\n  });\n',
    ),
  });
  const before = treeState(dir);
  const run = await runCli(dir);
  assert.deepEqual(verdicts(run.receipt), {
    "__tests__/calendar.test.js::isLeap > 1900 is not leap": "PROVEN",
    "__tests__/calendar.test.js::isLeap > 2020 is leap": "GUARD",
  });
  assert.deepEqual(run.receipt?.runners, ["jest"]);
  assert.equal(treeState(dir), before);

  commit(dir, "fix: drop the proving test", {
    "__tests__/calendar.test.js": withTests(base, '\n  test("2020 is leap", async () => {\n    expect(isLeap(2020)).toBe(true);\n  });\n'),
  });
  const unproven = await runCli(dir);
  assert.equal(unproven.code, 1);
  assert.deepEqual(verdicts(unproven.receipt), { "__tests__/calendar.test.js::isLeap > 2020 is leap": "THEATER" });
});

test("a JS test file with no runner configured is reported, not silently passed", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "receipts-norunner-"));
  git(dir, "init", "-q", "-b", "main");
  write(dir, { "package.json": '{"name":"x"}\n', "src/a.js": "exports.a = 1;\n" });
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "initial");
  git(dir, "checkout", "-q", "-b", "pr");
  commit(dir, "fix: a", { "src/a.js": "exports.a = 2;\n", "src/a.test.js": "test('a', () => {});\n" });
  const run = await runCli(dir);
  assert.equal(run.receipt?.status, "no-tests");
  assert.deepEqual(run.receipt?.unsupportedTestFiles, ["src/a.test.js"]);
  assert.match(run.stdout, /No runner for: src\/a\.test\.js/);
});

test("vitest: a case added to a table that feeds a loop of `it` calls is judged", async () => {
  const base = `import { describe, it, expect } from "vitest";
import { isLeap } from "../src/calendar.js";

describe("isLeap", () => {
  const cases = [
    [2024, true],
  ];
  for (const [year, leap] of cases) {
    it(\`\${year}\`, () => {
      expect(isLeap(year)).toBe(leap);
    });
  }
});
`;
  const dir = makeJsRepo("vitest", { "src/calendar.js": BUGGY_ESM, "test/calendar.test.js": base });
  commit(dir, "fix: century years", {
    "src/calendar.js": FIXED_ESM,
    "test/calendar.test.js": base.replace("    [2024, true],\n", "    [2024, true],\n    [1900, false],\n"),
  });
  const run = await runCli(dir);
  assert.equal(run.code, 0, run.stdout + run.stderr);
  assert.deepEqual(verdicts(run.receipt), { "test/calendar.test.js::isLeap > ${year}": "PROVEN" });
});
