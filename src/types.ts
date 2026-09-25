export type FileKind = "test" | "source" | "infra";

export type ChangeStatus = "added" | "modified" | "deleted" | "renamed";

export interface ChangedFile {
  status: ChangeStatus;
  /** Path at head (working tree), relative to the repo root. For deleted files, the base path. */
  path: string;
  /** Previous path for renames. */
  oldPath?: string;
  kind: FileKind;
}

/** A test located in a test file at head. */
export interface TestCase {
  /** Repo-relative path of the test file. */
  file: string;
  /** Enclosing class (pytest) or describe titles (JS), outermost first. */
  scope: string[];
  /**
   * Test title. May hold placeholders (`%s`, `$name`, `${expr}`) from
   * parametrized tests, or `*` when the title is not a literal.
   */
  name: string;
  /** Stable display id, e.g. `tests/test_x.py::TestA::test_b` or `a.test.ts::suite > case`. */
  id: string;
  /** 1-based inclusive line range, decorators included. */
  startLine: number;
  endLine: number;
}

export type RunnerName = "pytest" | "vitest" | "jest";

export type Outcome = "passed" | "failed" | "skipped" | "missing";

export interface TestResult {
  outcome: Outcome;
  /** Failure text, trimmed. */
  detail?: string;
}

export type Verdict =
  | "PROVEN"
  | "THEATER"
  | "WEAK"
  | "BROKEN"
  | "FLAKY"
  | "SKIPPED"
  | "PRESERVED"
  | "GUARD"
  | "CHANGED";

export type Mode = "fix" | "feat" | "refactor";

export interface TestVerdict {
  id: string;
  test: TestCase;
  verdict: Verdict;
  reason: string;
  /** The first error line behind the verdict: why it failed with or without the change. */
  detail?: string;
  green: Outcome[];
  red: Outcome[];
}

export interface Receipt {
  tool: "receipts";
  version: string;
  mode: Mode;
  modeSource: string;
  base: { ref: string; sha: string };
  head: { sha: string; dirty: boolean };
  runners: RunnerName[];
  /** Changed test files no available runner could run. */
  unsupportedTestFiles: string[];
  /** Conditions that make some verdicts meaningless, e.g. code imported from outside the checkout. */
  warnings: string[];
  /** Set when there was nothing to prove (no changed tests, or no code changed). */
  status: "checked" | "no-tests" | "test-only" | "no-changes";
  sourceFiles: string[];
  testFiles: string[];
  removedTests: string[];
  tests: TestVerdict[];
  summary: Partial<Record<Verdict, number>>;
  failOn: string[];
  violations: string[];
  passed: boolean;
}
