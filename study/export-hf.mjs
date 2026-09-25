#!/usr/bin/env node
// Exports the study results as a Hugging Face dataset: one row per change and
// one row per judged test, with flat columns the dataset viewer can show.
//
//   node study/export-hf.mjs <out-dir>
//
// Then upload <out-dir> as a dataset repository (see its README.md).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
if (!out) {
  console.error("usage: node study/export-hf.mjs <out-dir>");
  process.exit(2);
}

// Same outcome rules as study/report.mjs.
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

const VERDICTS = ["PROVEN", "GUARD", "THEATER", "WEAK", "BROKEN", "FLAKY", "SKIPPED", "PRESERVED", "CHANGED"];
const SOURCES = [
  ["maintainer", "maintainer-commits.jsonl"],
  ["agent", "agent-prs.jsonl"],
];

const changes = [];
const tests = [];
for (const [group, file] of SOURCES) {
  const rows = fs.readFileSync(path.join(HERE, "results", file), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  for (const r of rows) {
    const link = r.kind === "pull" ? `${r.url}/pull/${r.pr}` : `${r.url}/commit/${r.sha}`;
    const list = r.tests ?? [];
    const counts = Object.fromEntries(VERDICTS.map((v) => [v.toLowerCase(), list.filter((t) => t.verdict === v).length]));
    changes.push({
      group,
      repo: r.repo,
      link,
      kind: r.kind,
      pr: r.pr ?? null,
      sha: r.sha,
      base: r.base,
      subject: r.subject,
      agent: r.agent ?? null,
      mode: r.mode ?? null,
      outcome: outcome(r),
      judged: ["proven", "mixed", "unproven", "weak"].includes(outcome(r)),
      tests: list.length,
      ...counts,
    });
    for (const t of list) {
      tests.push({
        group,
        repo: r.repo,
        change: link,
        agent: r.agent ?? null,
        test: t.id,
        verdict: t.verdict,
        with_change: (t.green ?? []).join(","),
        without_change: (t.red ?? []).join(","),
      });
    }
  }
}

const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
fs.mkdirSync(path.join(out, "data"), { recursive: true });
fs.writeFileSync(path.join(out, "data", "changes.jsonl"), jsonl(changes));
fs.writeFileSync(path.join(out, "data", "tests.jsonl"), jsonl(tests));

const summary = (group) => {
  const g = changes.filter((c) => c.group === group);
  const judged = g.filter((c) => c.judged).length;
  const n = (o) => g.filter((c) => c.outcome === o).length;
  const pct = (o) => `${n(o)} (${Math.round((100 * n(o)) / judged)}%)`;
  return `| ${group === "agent" ? "Agent pull requests" : "Maintainer fix commits"} | ${g.length} | ${judged} | ${pct("proven")} | ${pct("mixed")} | ${pct("unproven")} | ${pct("weak")} |`;
};

fs.writeFileSync(
  path.join(out, "README.md"),
  `---
license: cc-by-4.0
pretty_name: "Receipts: do the tests in a fix catch the bug?"
language:
- en
tags:
- code
- testing
- software-engineering
- ai-agents
- coding-agents
- claude
- claude-code
- agent-skills
- pull-requests
- red-green
- tdd
size_categories:
- n<1K
task_categories:
- text-classification
configs:
- config_name: changes
  data_files: data/changes.jsonl
  default: true
- config_name: tests
  data_files: data/tests.jsonl
---

# Receipts study: do the tests in a fix catch the bug?

${changes.length} real code changes from 17 open-source repositories. For each one, every test the change added or edited was run twice: with the change, and with the changed source files reverted to the parent commit or the pull request's merge base. A test for a fix should fail without it.

Made with [Receipts](https://github.com/syntaxixr/receipts), which does this check for any pull request (CLI, GitHub Action, and a skill for Claude Code and other coding agents).

## Results

| | Changes | Judged | Proven | Mixed | Unproven | Weak only |
|---|---|---|---|---|---|---|
${summary("maintainer")}
${summary("agent")}

Percentages are of judged changes. The gap that shows up only in agent work is *weak only*: every test fails on the old code just because it imports a name the change adds, so no test ever runs against the old behavior. No maintainer commit had that shape.

## Configurations

- **\`changes\`** (default): one row per change. \`group\` is \`maintainer\` (fix commits on the default branch) or \`agent\` (pull requests whose commits carry a coding agent's fingerprint: Claude Code, Codex, Cursor, Copilot). \`outcome\` is \`proven\`, \`mixed\`, \`unproven\`, \`weak\`, or \`env\` when the tests could not be judged in this environment. The verdict columns count the change's tests per verdict.
- **\`tests\`**: one row per judged test, with its verdict and the raw outcomes with and without the change (\`with_change\`, \`without_change\`; failures were re-run to spot flakes).

## Verdicts

| Verdict | With the change | Without it | Meaning |
|---|---|---|---|
| PROVEN | passes | fails | The test catches what the change fixes |
| GUARD | passes | passes | Guards neighboring behavior next to a PROVEN test |
| THEATER | passes | passes | No test proves the change |
| WEAK | passes | fails on import | The code it calls did not exist yet |
| BROKEN | fails | | The change does not pass its own test |
| FLAKY | mixed | mixed | Different results on the same code |
| SKIPPED | skipped | | The test did not run |
| PRESERVED / CHANGED | | | For behavior-preserving changes: passes on both sides / fails on the old code |

## Method and caveats

Maintainer sample: recent single-parent commits on the default branch whose message mentions a fix, a bug or an issue, and that change both code and tests (click, itsdangerous, markupsafe, sqlparse, humanize, marshmallow, more-itertools, tomlkit, dateutil, dayjs, ufo, defu). Agent sample: up to 20 pull requests per repository, newest first, open and closed alike (anthropics/claude-agent-sdk-python, openai/openai-agents-python, PrefectHQ/fastmcp, modelcontextprotocol/python-sdk, simonw/llm).

Each project was installed once at the tip of its default branch, so older changes can fail for environmental reasons; those are \`env\` and excluded from the percentages. The samples are small and not random: the numbers describe these projects, not the ecosystem. "Agent-authored" means an agent's fingerprint appears in the PR's commits; humans steer those agents. Full method: [docs/study.md](https://github.com/syntaxixr/receipts/blob/main/docs/study.md). Scripts to reproduce: [study/](https://github.com/syntaxixr/receipts/tree/main/study).

## License

The data (verdicts, test ids, commit subjects and links) is released under CC BY 4.0. The code it describes belongs to its projects under their own licenses.
`,
);
console.log(`${changes.length} changes, ${tests.length} tests -> ${out}`);
