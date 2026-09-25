import { codeSpan, plain } from "./sanitize.js";
import type { Receipt, Verdict } from "./types.js";

const ICON: Record<Verdict, string> = {
  PROVEN: "✅",
  PRESERVED: "✅",
  GUARD: "🛡️",
  THEATER: "⚠️",
  CHANGED: "⚠️",
  WEAK: "🟡",
  BROKEN: "❌",
  FLAKY: "🔁",
  SKIPPED: "⏭️",
};

const ORDER: Verdict[] = ["BROKEN", "THEATER", "CHANGED", "FLAKY", "WEAK", "SKIPPED", "PROVEN", "PRESERVED", "GUARD"];

function sorted(r: Receipt) {
  return [...r.tests].sort((a, b) => ORDER.indexOf(a.verdict) - ORDER.indexOf(b.verdict) || a.id.localeCompare(b.id));
}

function statusLine(r: Receipt): string {
  switch (r.status) {
    case "no-changes":
      return "No code or test changes against the base: nothing to prove.";
    case "no-tests":
      return `Code changed in ${r.sourceFiles.length} file(s), but no test was added or edited: nothing proves this change.`;
    case "test-only":
      return "Only tests changed: there is no code change to prove.";
    default: {
      const parts = ORDER.filter((v) => r.summary[v]).map((v) => `${r.summary[v]} ${v.toLowerCase()}`);
      return parts.join(", ");
    }
  }
}

// Terminals disagree on emoji widths, which breaks the columns: single-width
// symbols plus color there, emoji in Markdown where GitHub renders them.
const MARK: Record<Verdict, [string, string]> = {
  PROVEN: ["✓", "32"],
  PRESERVED: ["✓", "32"],
  GUARD: ["·", "2"],
  THEATER: ["!", "33"],
  CHANGED: ["!", "33"],
  WEAK: ["~", "33"],
  BROKEN: ["✗", "31"],
  FLAKY: ["↻", "35"],
  SKIPPED: ["-", "2"],
};

export function toText(r: Receipt, color: boolean): string {
  const c = (code: string, s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
  const out: string[] = [];
  out.push(c("1", "receipts") + c("2", ` · mode: ${r.mode} (${r.modeSource}) · base: ${r.base.ref} @ ${r.base.sha.slice(0, 7)}`));
  out.push("");
  if (r.tests.length > 0) {
    const ids = new Map(r.tests.map((t) => [t, plain(t.id, 160)]));
    const width = Math.max(...[...ids.values()].map((id) => id.length));
    for (const t of sorted(r)) {
      const [mark, tone] = MARK[t.verdict];
      out.push(`  ${c(tone, `${mark} ${t.verdict.padEnd(9)}`)} ${ids.get(t)!.padEnd(width)}  ${c("2", t.reason)}`);
      if (t.detail && t.verdict !== "PROVEN") out.push(`  ${" ".repeat(12 + width)}${c("2", `↳ ${plain(t.detail)}`)}`);
    }
    out.push("");
  }
  if (r.removedTests.length > 0) {
    out.push(c("33", `  Removed tests: ${r.removedTests.map((t) => plain(t, 160)).join(", ")}`));
    out.push("");
  }
  if (r.unsupportedTestFiles.length > 0) {
    out.push(
      c("33", `  No runner for: ${r.unsupportedTestFiles.map((t) => plain(t, 160)).join(", ")} (add vitest or jest to package.json, or pass --js-runner)`),
    );
    out.push("");
  }
  for (const w of r.warnings) out.push(c("33", `  Warning: ${plain(w, 600)}`), "");
  out.push(`  ${statusLine(r)}`);
  out.push(
    r.passed
      ? c("32", "  PASS")
      : c("31", `  FAIL: ${r.violations.join(", ")}`) + c("2", `  (--fail-on ${r.failOn.join(",")})`),
  );
  return out.join("\n");
}

export function toMarkdown(r: Receipt): string {
  const out: string[] = [];
  const head = r.passed ? "✅ **Receipts: pass**" : `❌ **Receipts: ${r.violations.join(", ")}**`;
  out.push(`### ${head}`);
  out.push("");
  out.push(`Mode \`${r.mode}\` (from ${r.modeSource}) · base \`${r.base.ref}\` @ \`${r.base.sha.slice(0, 7)}\``);
  out.push("");
  if (r.tests.length > 0) {
    out.push("| | Verdict | Test | Why |");
    out.push("|---|---|---|---|");
    for (const t of sorted(r)) {
      const why = t.detail && t.verdict !== "PROVEN" ? `${t.reason}<br>${codeSpan(t.detail, 200)}` : t.reason;
      out.push(`| ${ICON[t.verdict]} | ${t.verdict} | ${codeSpan(t.id, 160)} | ${why} |`);
    }
    out.push("");
  }
  if (r.removedTests.length > 0) {
    out.push(`**Removed tests:** ${r.removedTests.map((t) => codeSpan(t, 160)).join(", ")}`);
    out.push("");
  }
  if (r.unsupportedTestFiles.length > 0) {
    out.push(`**Not checked (no runner found):** ${r.unsupportedTestFiles.map((t) => codeSpan(t, 160)).join(", ")}`);
    out.push("");
  }
  for (const w of r.warnings) out.push(`> [!WARNING]\n> ${plain(w, 600).replace(/[<>]/g, "")}`, "");
  out.push(statusLine(r));
  out.push("");
  out.push(
    "<sub>Each changed test runs twice: with the change, and with the code under test reverted to the base. " +
      "A test that passes both times does not prove the change.</sub>",
  );
  return out.join("\n");
}

export function toJson(r: Receipt): string {
  return JSON.stringify(r, null, 2);
}
