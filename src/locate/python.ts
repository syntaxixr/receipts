import type { TestCase } from "../types.js";

const CLASS_RE = /^(\s*)class\s+([A-Za-z_]\w*)\s*(?:\(([^)]*)\))?/;
const DEF_RE = /^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/;

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/** Net count of opened brackets on a line, ignoring strings and comments. */
function bracketDelta(line: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (let k = 0; k < line.length; k++) {
    const ch = line[k]!;
    if (quote) {
      if (ch === "\\") k++;
      else if (ch === quote) quote = null;
    } else if (ch === "#") break;
    else if (ch === '"' || ch === "'") quote = ch;
    else if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
  }
  return depth;
}

/** Index of the last line of the bracketed statement starting at line i. */
function statementEnd(lines: string[], i: number): number {
  let depth = bracketDelta(lines[i]!);
  while (depth > 0 && i + 1 < lines.length) depth += bracketDelta(lines[++i]!);
  return i;
}

function isCode(line: string): boolean {
  const t = line.trim();
  return t !== "" && !t.startsWith("#");
}

/**
 * Finds pytest-style test functions (`test*` at module level or inside `Test*`
 * classes) by indentation. Good enough for the diff mapping; pytest itself stays
 * the source of truth for what actually runs.
 */
export function locatePythonTests(file: string, source: string): TestCase[] {
  const lines = source.split(/\r?\n/);
  const tests: TestCase[] = [];
  const scopes: { indent: number; kind: "class" | "def"; name: string; isTestClass?: boolean }[] = [];
  // First line of the decorators stacked on the next def or class.
  let decoratorStart: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!isCode(line)) continue;
    const indent = indentOf(line);
    while (scopes.length && scopes[scopes.length - 1]!.indent >= indent) scopes.pop();

    if (line.trim().startsWith("@")) {
      // A decorator can span many lines, e.g. a parametrize table: adding a
      // case there is the most common way to add a regression test.
      decoratorStart ??= i;
      i = statementEnd(lines, i);
      continue;
    }
    const start = decoratorStart ?? i;
    decoratorStart = null;

    const cls = CLASS_RE.exec(line);
    const def = cls ? null : DEF_RE.exec(line);
    // Headers can span lines (`def test_x(\n    a,\n):`); their continuation
    // lines must not pop the scope they open.
    // Only headers are followed across lines: an arbitrary statement could be a
    // docstring line with an unbalanced bracket.
    const headerEnd = cls || def ? statementEnd(lines, i) : i;
    i = headerEnd;
    if (cls) {
      // pytest collects Test* classes, and unittest.TestCase subclasses whatever their name.
      const isTestClass = cls[2]!.startsWith("Test") || /Test/.test(cls[3] ?? "");
      scopes.push({ indent, kind: "class", name: cls[2]!, isTestClass });
      continue;
    }
    if (!def) continue;
    const owner = scopes[scopes.length - 1];
    scopes.push({ indent, kind: "def", name: def[2]! });

    // pytest collects module-level test functions and methods of Test* classes,
    // never functions nested inside another function.
    if (!def[2]!.startsWith("test")) continue;
    if (owner && (owner.kind !== "class" || !owner.isTestClass)) continue;

    let end = headerEnd;
    for (let j = headerEnd + 1; j < lines.length; j++) {
      const next = lines[j]!;
      if (!isCode(next)) continue;
      if (indentOf(next) <= indent) break;
      end = j;
    }

    const scope = owner ? [owner.name] : [];
    tests.push({
      file,
      scope,
      name: def[2]!,
      id: [file, ...scope, def[2]!].join("::"),
      startLine: start + 1,
      endLine: end + 1,
    });
  }
  return tests;
}

/** Line ranges (1-based, inclusive) of test classes: their setUp, fixtures and data serve every test inside. */
export function locatePythonSuites(source: string): { startLine: number; endLine: number }[] {
  const lines = source.split(/\r?\n/);
  const suites: { startLine: number; endLine: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cls = CLASS_RE.exec(lines[i]!);
    if (!cls || !(cls[2]!.startsWith("Test") || /Test/.test(cls[3] ?? ""))) continue;
    const indent = indentOf(lines[i]!);
    let end = i;
    for (let j = statementEnd(lines, i) + 1; j < lines.length; j++) {
      if (!isCode(lines[j]!)) continue;
      if (indentOf(lines[j]!) <= indent) break;
      end = j;
    }
    suites.push({ startLine: i + 1, endLine: end + 1 });
  }
  return suites;
}
