import type { Mode, Outcome, Verdict } from "./types.js";

// Failing only because the code under test does not exist yet: a new function or
// module. Normal for a feature, and it proves little about a fix.
const MISSING_SYMBOL = new RegExp(
  [
    // Python
    String.raw`\b(ModuleNotFoundError|ImportError|NameError)\b`,
    "cannot import name",
    // A module or a project class lacking an attribute: the change adds it.
    // (A None or builtin value lacking one is the bug itself; see BEHAVIOR.)
    "has no attribute",
    // JS/TS (node, vitest, jest). A bare imported binding that is not a
    // function ("mul is not a function", vitest's "(0 , mul) is not a
    // function") is missing; "x.map is not a function" is a wrong value.
    String.raw`\(0\s*,\s*[\w$.]+\)\s+is not a (function|constructor)`,
    String.raw`(?<![.\w$])[A-Za-z_$][\w$]*\s+is not a (function|constructor)`,
    "is not defined",
    "Cannot find module",
    "does not provide an export named",
    "Failed to resolve import",
    "Failed to load url",
  ].join("|"),
);

// Failures that are the old code misbehaving, even though they read like a
// missing name: an attribute looked up on None or on a builtin value.
const BEHAVIOR = /'(NoneType|str|int|float|bool|bytes|dict|list|tuple|set)' object has no attribute/;

export function isMissingSymbol(detail: string | undefined): boolean {
  if (detail === undefined || !MISSING_SYMBOL.test(detail)) return false;
  // Only the has-no-attribute match can be a behavior failure in disguise.
  const other = detail.replace(/[^\n]*has no attribute[^\n]*/g, "");
  return MISSING_SYMBOL.test(other) || !BEHAVIOR.test(detail);
}

export function decide(
  mode: Mode,
  green: Outcome[],
  red: Outcome[],
  redDetail: string | undefined,
): { verdict: Verdict; reason: string } {
  if (green.length === 0 || green.every((o) => o === "missing")) {
    return { verdict: "SKIPPED", reason: "not collected by the test runner" };
  }
  if (green.every((o) => o === "skipped")) return { verdict: "SKIPPED", reason: "skipped with the change applied" };
  const gPass = green.includes("passed");
  const gFail = green.includes("failed");
  if (gPass && gFail) return { verdict: "FLAKY", reason: "passes and fails on the same code" };
  if (gFail) return { verdict: "BROKEN", reason: "fails with the change applied" };

  if (red.length === 0 || red.every((o) => o === "missing" || o === "skipped")) {
    return { verdict: "SKIPPED", reason: "did not run against the old code" };
  }
  const rPass = red.includes("passed");
  const rFail = red.includes("failed");
  if (rPass && rFail) return { verdict: "FLAKY", reason: "passes and fails on the old code" };

  if (rPass) {
    return mode === "refactor"
      ? { verdict: "PRESERVED", reason: "passes before and after: behavior kept" }
      : { verdict: "THEATER", reason: "passes without the change too: proves nothing about it" };
  }
  if (isMissingSymbol(redDetail)) {
    return { verdict: "WEAK", reason: "fails without the change only because the code it calls is new" };
  }
  return mode === "refactor"
    ? { verdict: "CHANGED", reason: "fails on the old code: this refactor changed behavior" }
    : { verdict: "PROVEN", reason: "fails without the change, passes with it" };
}

/**
 * A test that passes before and after is only THEATER when nothing else proves
 * the change. Next to a PROVEN test (or, for a feature, a test of the new code)
 * it guards existing behavior the change must not break, which is good practice.
 */
export function relabelGuards(mode: Mode, verdicts: Verdict[]): Verdict[] {
  if (mode === "refactor") return verdicts;
  const proven = verdicts.some((v) => v === "PROVEN" || (mode === "feat" && v === "WEAK"));
  return proven ? verdicts.map((v) => (v === "THEATER" ? "GUARD" : v)) : verdicts;
}

export const GUARD_REASON = "passes before and after: guards existing behavior";

/**
 * The line that says what went wrong: pytest's first `E ` line, or the first
 * line of a JS assertion message.
 */
export function firstErrorLine(detail: string | undefined): string | undefined {
  if (!detail) return undefined;
  const lines = detail.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines[0]?.startsWith("timed out")) return lines[0];
  const pytestE = lines.find((l) => /^E\s+\S/.test(l));
  const picked = pytestE ? pytestE.replace(/^E\s+/, "") : lines.find((l) => !l.startsWith("at ") && !l.startsWith("●")) ?? lines[0];
  return picked && picked.length > 200 ? `${picked.slice(0, 197)}...` : picked;
}
