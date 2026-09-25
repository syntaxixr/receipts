import assert from "node:assert/strict";
import { test } from "vitest";
import { classify } from "../src/classify.js";
import { locateJsTests } from "../src/locate/js.js";
import { locatePythonTests } from "../src/locate/python.js";
import { titleMatcher } from "../src/runners/index.js";
import { detectMode } from "../src/mode.js";
import { decide, relabelGuards } from "../src/verdict.js";

test("classify splits tests, sources and environment files", () => {
  assert.equal(classify("tests/test_x.py"), "test");
  assert.equal(classify("pkg/x_test.py"), "test");
  assert.equal(classify("conftest.py"), "test");
  assert.equal(classify("src/a.test.ts"), "test");
  assert.equal(classify("src/__tests__/a.js"), "test");
  assert.equal(classify("src/app.py"), "source");
  assert.equal(classify("src/testing_utils.py"), "source");
  assert.equal(classify("pyproject.toml"), "infra");
  assert.equal(classify("package-lock.json"), "infra");
  assert.equal(classify("requirements-dev.txt"), "infra");
});

test("locatePythonTests finds module tests, class tests and their line ranges", () => {
  const src = [
    "import pytest", // 1
    "", // 2
    "def helper():", // 3
    "    return 1", // 4
    "", // 5
    "@pytest.mark.slow", // 6
    "def test_a():", // 7
    "    x = 1", // 8
    "", // 9
    "    # trailing comment", // 10
    "    assert x", // 11
    "", // 12
    "class TestB:", // 13
    "    def test_b(self):", // 14
    "        def test_nested():", // 15
    "            pass", // 16
    "        assert True", // 17
    "", // 18
    "class Helper:", // 19
    "    def test_not_collected(self):", // 20
    "        pass", // 21
    "", // 22
    "async def test_c():", // 23
    "    pass", // 24
    "", // 25
    "class ChunkedTests(unittest.TestCase):", // 26
    "    def test_d(self):", // 27
    "        pass", // 28
  ].join("\n");
  const found = locatePythonTests("t.py", src).map((t) => [t.scope.join("/"), t.name, t.startLine, t.endLine]);
  assert.deepEqual(found, [
    ["", "test_a", 6, 11],
    ["TestB", "test_b", 14, 17],
    ["", "test_c", 23, 24],
    ["ChunkedTests", "test_d", 27, 28],
  ]);
});

test("decide maps green/red outcomes to verdicts per mode", () => {
  assert.equal(decide("fix", ["passed"], ["failed"], "assert False").verdict, "PROVEN");
  assert.equal(decide("fix", ["passed"], ["passed"], undefined).verdict, "THEATER");
  assert.equal(decide("fix", ["passed"], ["failed"], "ImportError: cannot import name 'x'").verdict, "WEAK");
  assert.equal(decide("fix", ["failed", "failed"], [], undefined).verdict, "BROKEN");
  assert.equal(decide("fix", ["failed", "passed"], [], undefined).verdict, "FLAKY");
  assert.equal(decide("fix", ["passed"], ["failed", "passed"], "x").verdict, "FLAKY");
  assert.equal(decide("refactor", ["passed"], ["passed"], undefined).verdict, "PRESERVED");
  assert.equal(decide("refactor", ["passed"], ["failed"], "assert 1 == 2").verdict, "CHANGED");
  assert.equal(decide("fix", ["skipped"], [], undefined).verdict, "SKIPPED");
  assert.equal(decide("fix", ["missing"], [], undefined).verdict, "SKIPPED");
});

test("detectMode reads conventional commit prefixes", () => {
  const saved = { ...process.env };
  delete process.env.RECEIPTS_MODE;
  delete process.env.GITHUB_EVENT_PATH;
  try {
    assert.equal(detectMode(undefined, ["fix(api): x"]).mode, "fix");
    assert.equal(detectMode(undefined, ["feat: y", "chore: z"]).mode, "feat");
    assert.equal(detectMode(undefined, ["refactor: a", "refactor(b): c"]).mode, "refactor");
    assert.equal(detectMode(undefined, ["refactor: a", "wip"]).mode, "fix");
    assert.equal(detectMode(undefined, ["wip"]).source, "default");
    assert.equal(detectMode(undefined, ["Fix crash when the list is empty"]).mode, "fix");
    assert.equal(detectMode(undefined, ["Refactor statement splitter"]).mode, "refactor");
    assert.equal(detectMode(undefined, ["Fixtures cleanup"]).source, "default");
    assert.equal(detectMode(undefined, ["test: close coverage gaps"]).mode, "refactor");
    assert.equal(detectMode(undefined, ["chore(deps): bump", "perf: faster split"]).mode, "refactor");
    assert.equal(detectMode("feat", ["fix: x"]).mode, "feat");
    assert.throws(() => detectMode("nope", []));
  } finally {
    process.env = saved;
  }
});

test("locateJsTests finds nested describe/it/test blocks, modifiers and .each", () => {
  const src = [
    'import { describe, it, expect } from "vitest";', // 1
    "", // 2
    'describe("math", () => {', // 3
    '  it("adds (with parens)", () => {', // 4
    '    const s = "it(\\"fake\\", () => {})";', // 5
    "    // it('commented', () => {})", // 6
    "    expect(1 + 1).toBe(2);", // 7
    "  });", // 8
    "", // 9
    "  describe.skipIf(process.env.X)('inner', () => {", // 10
    "    test.each([[1], [2]])('case %i', (n) => {", // 11
    "      expect(/[)]/.test(')')).toBe(true);", // 12
    "    });", // 13
    "  });", // 14
    "});", // 15
    "", // 16
    "it.only(`template ${1 + 1}`, () => {});", // 17
    "test(someName, () => {});", // 18
    "helpers.test('not a test', () => {});", // 19
  ].join("\n");
  const found = locateJsTests("a.test.ts", src).map((t) => [t.id, t.startLine, t.endLine]);
  assert.deepEqual(found, [
    ["a.test.ts::math > adds (with parens)", 4, 8],
    ["a.test.ts::math > inner > case %i", 11, 13],
    ["a.test.ts::template ${1 + 1}", 17, 17],
    ["a.test.ts::*", 18, 18],
  ]);
});

test("titleMatcher turns parametrized placeholders into wildcards", () => {
  assert.ok(titleMatcher("case %i").test("case 2"));
  assert.ok(titleMatcher("adds $a + $b").test("adds 1 + 2"));
  assert.ok(titleMatcher("template ${1 + 1}").test("template 2"));
  assert.ok(titleMatcher("*").test("anything"));
  assert.ok(titleMatcher("100%% (a.b)").test("100% (a.b)"));
  assert.ok(!titleMatcher("adds").test("adds more"));
  assert.ok(!titleMatcher("a.b").test("axb"));
});

test("a test passing on both sides is THEATER alone, GUARD next to proof", () => {
  assert.deepEqual(relabelGuards("fix", ["THEATER", "THEATER"]), ["THEATER", "THEATER"]);
  assert.deepEqual(relabelGuards("fix", ["PROVEN", "THEATER"]), ["PROVEN", "GUARD"]);
  assert.deepEqual(relabelGuards("fix", ["WEAK", "THEATER"]), ["WEAK", "THEATER"]);
  assert.deepEqual(relabelGuards("feat", ["WEAK", "THEATER"]), ["WEAK", "GUARD"]);
  assert.deepEqual(relabelGuards("refactor", ["PRESERVED", "CHANGED"]), ["PRESERVED", "CHANGED"]);
});

test("locatePythonTests covers multi-line parametrize tables and signatures", () => {
  const src = [
    "import pytest", // 1
    "", // 2
    "@pytest.mark.parametrize(", // 3
    '    "value, expected",', // 4
    "    [", // 5
    '        (9999, "10.0 k"),  # a case added by the fix', // 6
    '        (1, "1"),', // 7
    "    ],", // 8
    ")", // 9
    "def test_metric(value, expected):", // 10
    "    assert value", // 11
    "", // 12
    "def test_long_signature(", // 13
    "    a,", // 14
    "):", // 15
    '    """Docstring with an unbalanced ( bracket."""', // 16
    "    assert a", // 17
    "", // 18
    "def test_after():", // 19
    "    pass", // 20
  ].join("\n");
  const found = locatePythonTests("t.py", src).map((t) => [t.name, t.startLine, t.endLine]);
  assert.deepEqual(found, [
    ["test_metric", 3, 11],
    ["test_long_signature", 13, 17],
    ["test_after", 19, 20],
  ]);
});

test("expandChangedTests maps edits to case tables, fixtures and setUp onto the tests using them", async () => {
  const { expandChangedTests } = await import("../src/locate/expand.js");
  const { locateJsSuites } = await import("../src/locate/js.js");
  const { locatePythonSuites } = await import("../src/locate/python.js");
  const names = (xs: { name: string }[]) => xs.map((t) => t.name).sort();

  const js = [
    'describe("withoutBase", () => {', // 1
    "  const tests = [", // 2
    '    { input: "/a", out: "/a" },', // 3
    '    { input: "//evil", out: "/evil" },', // 4  <- added case
    "  ];", // 5
    "  for (const t of tests) {", // 6
    "    it(`${t.input}`, () => {});", // 7
    "  }", // 8
    '  it("unrelated", () => {});', // 9
    "});", // 10
    'it("outside", () => {});', // 11
  ].join("\n");
  const jsTests = locateJsTests("u.test.ts", js);
  const jsHit = expandChangedTests({ source: js, tests: jsTests, suites: locateJsSuites(js), lines: [4], language: "js" });
  assert.deepEqual(names(jsHit), ["${t.input}", "unrelated"]);

  const py = [
    "import pytest", // 1
    "", // 2
    "CASES = [", // 3
    "    (1, 1),", // 4
    "    (9999, 10),", // 5  <- added case
    "]", // 6
    "", // 7
    "@pytest.fixture", // 8
    "def data():", // 9
    "    return 2  # changed", // 10
    "", // 11
    '@pytest.mark.parametrize("x, y", CASES)', // 12
    "def test_cases(x, y):", // 13
    "    assert x", // 14
    "", // 15
    "def test_data(data):", // 16
    "    assert data", // 17
    "", // 18
    "class TestThing(unittest.TestCase):", // 19
    "    def setUp(self):", // 20
    "        self.v = 1  # changed", // 21
    "    def test_a(self):", // 22
    "        pass", // 23
    "    def test_b(self):", // 24
    "        pass", // 25
    "", // 26
    "# just a comment", // 27
  ].join("\n");
  const pyTests = locatePythonTests("t.py", py);
  const expand = (lines: number[]) =>
    names(expandChangedTests({ source: py, tests: pyTests, suites: locatePythonSuites(py), lines, language: "python" }));
  assert.deepEqual(expand([5]), ["test_cases"]);
  assert.deepEqual(expand([10]), ["test_data"]);
  assert.deepEqual(expand([21]), ["test_a", "test_b"]);
  assert.deepEqual(expand([27, 26]), []);
});

test("WEAK means the code did not exist, not that the old code misbehaved", async () => {
  const { isMissingSymbol } = await import("../src/verdict.js");
  // Missing names: the change adds them.
  assert.ok(isMissingSymbol("ImportError: cannot import name 'TERMINAL_TASK_STATUSES' from 'x.types'"));
  assert.ok(isMissingSymbol("AttributeError: 'Query' object has no attribute '_track_task_lifecycle'"));
  assert.ok(isMissingSymbol("AttributeError: module 'llm.plugins' has no attribute '_load'"));
  assert.ok(isMissingSymbol("TypeError: (0 , mul) is not a function"));
  assert.ok(isMissingSymbol("TypeError: mul is not a function"));
  assert.ok(isMissingSymbol("ReferenceError: daysIn is not defined"));
  // The old code misbehaving: that is what a proving test catches.
  assert.ok(!isMissingSymbol("AttributeError: 'NoneType' object has no attribute 'model_dump'"));
  assert.ok(!isMissingSymbol("AttributeError: 'str' object has no attribute 'get'"));
  assert.ok(!isMissingSymbol("TypeError: value.map is not a function"));
  assert.ok(!isMissingSymbol("AssertionError: expected 1 to be 2"));
});
