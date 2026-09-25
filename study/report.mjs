#!/usr/bin/env node
// Summarizes study results: node study/report.mjs study-out/results.jsonl > report.md

import fs from "node:fs";

const file = process.argv[2] ?? "study-out/results.jsonl";
const rows = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

/**
 * One outcome per change, from the verdicts of the tests it touched:
 * proven     every judged test fails without the change
 * mixed      some tests prove it, some are THEATER
 * unproven   no test proves it: every test passes without the change
 * weak       tests fail without the change only because what they call did not exist
 * env        the tests could not be judged here (BROKEN / SKIPPED / FLAKY only)
 */
// The study installs each project once, from its default branch. An older
// change whose tests need a dependency that install lacks cannot be judged
// here; that is the environment, not a verdict.
const ENVIRONMENT_ERROR = /ModuleNotFoundError|ImportError|No module named|Cannot find module|is not installed/;

function outcome(r) {
  if (r.status === "error") return ENVIRONMENT_ERROR.test(r.error ?? "") ? "env" : "error";
  if (r.status !== "checked") return r.status;
  const v = r.tests.map((t) => t.verdict);
  const good = v.filter((x) => x === "PROVEN" || x === "PRESERVED").length;
  const theater = v.filter((x) => x === "THEATER" || x === "CHANGED").length;
  const weak = v.filter((x) => x === "WEAK").length;
  if (good === 0 && theater === 0 && weak === 0) return "env";
  if (theater === 0 && weak === 0) return "proven";
  if (good > 0) return "mixed";
  if (theater > 0) return "unproven";
  return "weak";
}

const ORDER = ["proven", "mixed", "unproven", "weak", "env", "no-tests", "test-only", "no-changes", "error"];
const pct = (n, d) => (d === 0 ? "–" : `${Math.round((100 * n) / d)}%`);

function table(group) {
  const counts = Object.fromEntries(ORDER.map((o) => [o, 0]));
  for (const r of group) counts[outcome(r)]++;
  const judged = counts.proven + counts.mixed + counts.unproven + counts.weak;
  return { counts, judged };
}

function link(r) {
  return r.kind === "pull" ? `${r.url}/pull/${r.pr}` : `${r.url}/commit/${r.sha}`;
}

const out = [];
const groups = [
  ["All changes", rows],
  ["Human-authored commits", rows.filter((r) => !r.agent)],
  ["Agent-authored (commit trailers or PR commits)", rows.filter((r) => r.agent)],
];

out.push("# Receipts study", "");
out.push(`${rows.length} changes from ${new Set(rows.map((r) => r.repo)).size} repositories. Each one edits code and adds or edits tests; every such test ran with and without the change.`, "");
out.push("| Group | Changes | Judged | Proven | Mixed | Unproven | Weak only | Could not judge | No test located | Errors |");
out.push("|---|---|---|---|---|---|---|---|---|---|");
for (const [name, group] of groups) {
  const { counts, judged } = table(group);
  out.push(
    `| ${name} | ${group.length} | ${judged} | ${counts.proven} (${pct(counts.proven, judged)}) | ${counts.mixed} (${pct(counts.mixed, judged)}) | ${counts.unproven} (${pct(counts.unproven, judged)}) | ${counts.weak} (${pct(counts.weak, judged)}) | ${counts.env} | ${counts["no-tests"]} | ${counts.error} |`,
  );
}
out.push("");
out.push("*Judged*: at least one test ran on both sides. *Proven*: at least one test fails without the change, and none of the others is THEATER (GUARD tests next to proof are fine). *Mixed*: some tests prove the change, others are WEAK (or, for a refactor, some tests CHANGED). *Unproven*: every test passes without the change. *Weak only*: tests fail without the change only because the function they call did not exist yet.", "");

const tests = rows.flatMap((r) => r.tests);
const byVerdict = {};
for (const t of tests) byVerdict[t.verdict] = (byVerdict[t.verdict] ?? 0) + 1;
out.push("## Tests", "");
out.push(`${tests.length} tests judged: ` + Object.entries(byVerdict).sort((a, b) => b[1] - a[1]).map(([v, n]) => `${n} ${v} (${pct(n, tests.length)})`).join(", "), "");

out.push("## By repository", "");
out.push("| Repository | Changes | Proven | Mixed | Unproven | Other |");
out.push("|---|---|---|---|---|---|");
for (const repo of [...new Set(rows.map((r) => r.repo))]) {
  const g = rows.filter((r) => r.repo === repo);
  const { counts } = table(g);
  const other = g.length - counts.proven - counts.mixed - counts.unproven;
  out.push(`| ${repo} | ${g.length} | ${counts.proven} | ${counts.mixed} | ${counts.unproven} | ${other} |`);
}
out.push("");

const agents = rows.filter((r) => r.agent);
if (agents.length > 0) {
  out.push("## Agent-authored changes", "");
  out.push("| Change | Agent | Outcome | Verdicts |");
  out.push("|---|---|---|---|");
  for (const r of agents) {
    const verdicts = Object.entries(r.summary).map(([v, n]) => `${n} ${v}`).join(", ") || r.status;
    out.push(`| [${r.repo} ${r.kind === "pull" ? `#${r.pr}` : r.sha.slice(0, 8)}](${link(r)}) ${r.subject.replace(/\|/g, "\\|").slice(0, 70)} | ${r.agent} | ${outcome(r)} | ${verdicts} |`);
  }
  out.push("");
}

const unproven = rows.filter((r) => outcome(r) === "unproven");
if (unproven.length > 0) {
  out.push("## Changes no test proves", "");
  out.push("Every test these changes added or edited passes without the change.", "");
  for (const r of unproven) {
    const theater = r.tests.filter((t) => t.verdict === "THEATER" || t.verdict === "CHANGED").map((t) => `\`${t.id}\``);
    out.push(`- [${r.repo} ${r.kind === "pull" ? `#${r.pr}` : r.sha.slice(0, 8)}](${link(r)}) ${r.subject.slice(0, 80)}${r.agent ? ` (${r.agent})` : ""}: ${theater.join(", ")}`);
  }
  out.push("");
}

const weak = rows.filter((r) => outcome(r) === "weak");
if (weak.length > 0) {
  out.push("## Changes proven only by tests of new code (WEAK)", "");
  for (const r of weak) {
    out.push(`- [${r.repo} ${r.kind === "pull" ? `#${r.pr}` : r.sha.slice(0, 8)}](${link(r)}) ${r.subject.slice(0, 80)}${r.agent ? ` (${r.agent})` : ""}`);
  }
  out.push("");
}

const errors = rows.filter((r) => outcome(r) === "error" || outcome(r) === "env" || outcome(r) === "no-tests");
if (errors.length > 0) {
  out.push("## Not judged", "");
  for (const r of errors) {
    const why = r.error ? r.error.split("\n").pop() : Object.entries(r.summary).map(([v, n]) => `${n} ${v}`).join(", ") || r.status;
    out.push(`- [${r.repo} ${r.kind === "pull" ? `#${r.pr}` : r.sha.slice(0, 8)}](${link(r)}) ${outcome(r)}: ${why.slice(0, 160)}`);
  }
  out.push("");
}

process.stdout.write(out.join("\n"));
