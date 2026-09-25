import type { TestCase } from "../types.js";

/**
 * Tests are often driven by data that lives outside the test body: a table of
 * cases inside a describe block with an `it` in a loop, a module-level CASES
 * list fed to parametrize, a fixture, a setUp method. A change there changes
 * the tests that use it. Given the changed lines that fall outside every
 * located test, this finds those tests:
 *
 * - a line inside a suite (describe block, test class) touches every test in
 *   the innermost such suite;
 * - a line inside a top-level definition (`CASES = [...]`, `def data():`,
 *   `const cases = [...]`, `function makeUrl()`) touches every test whose text
 *   mentions that name.
 *
 * Blank and comment-only lines touch nothing.
 */

export interface ExpandInput {
  source: string;
  tests: TestCase[];
  suites: { startLine: number; endLine: number }[];
  /** Changed head-side line numbers that no located test contains. */
  lines: number[];
  language: "python" | "js";
}

const COMMENT = { python: /^#/, js: /^(\/\/|\/\*|\*)/ };

const DEFINITION = {
  python: /^(?:async\s+def|def|class)\s+([A-Za-z_]\w*)|^([A-Za-z_]\w*)\s*(?::[^=]*)?=/,
  js: /^(?:export\s+)?(?:default\s+)?(?:const|let|var|function\*?|async\s+function|class)\s+([A-Za-z_$][\w$]*)/,
};

export function expandChangedTests(input: ExpandInput): TestCase[] {
  const lines = input.source.split(/\r?\n/);
  const text = (n: number) => lines[n - 1] ?? "";
  const hit = new Set<TestCase>();

  for (const n of input.lines) {
    const t = text(n).trim();
    if (t === "" || COMMENT[input.language].test(t)) continue;

    const suite = input.suites
      .filter((s) => s.startLine <= n && n <= s.endLine)
      .sort((a, b) => b.startLine - a.startLine)[0];
    if (suite) {
      for (const test of input.tests) {
        if (test.startLine >= suite.startLine && test.endLine <= suite.endLine) hit.add(test);
      }
      continue;
    }

    // The top-level statement this line belongs to: the nearest line above it
    // (or itself) that starts at column 0 and is not a closing bracket.
    let k = n;
    while (k > 1 && (/^\s/.test(text(k)) || /^[)\]}]/.test(text(k)) || text(k).trim() === "")) k--;
    const def = DEFINITION[input.language].exec(text(k));
    const name = def?.[1] ?? def?.[2];
    if (!name) continue;
    const mention = new RegExp(`(^|[^\\w$])${name.replace(/\$/g, "\\$")}([^\\w$]|$)`);
    for (const test of input.tests) {
      const body = lines.slice(test.startLine - 1, test.endLine).join("\n");
      if (mention.test(body)) hit.add(test);
    }
  }
  return [...hit];
}
