# Do the tests in a fix actually catch the bug?

A study of 181 real changes from 17 open-source repositories, run with Receipts in September 2026.

## Method

For every change we ran each test the change added or edited twice: with the change, and with the changed source files reverted to the parent (for commits) or to the merge base with the default branch (for pull requests). Tests, dependencies and configuration stayed at the new version.

Two samples:

- **Maintainer fix commits.** Recent single-parent commits on the default branch whose message mentions a fix, a bug or an issue, and that change both code and tests. Up to 8 per repository, cherry-picks counted once. click, itsdangerous, markupsafe, sqlparse, humanize, marshmallow, more-itertools, tomlkit, dateutil, dayjs, ufo, defu: 81 changes.
- **Agent-authored pull requests.** Pull request heads, fetched as `refs/pull/*/head` straight from git, whose commits carry a coding agent's fingerprint: `Co-Authored-By: Claude`, "Generated with Claude Code", `copilot-swe-agent`, the Codex connector, `devin-ai-integration`. Up to 20 per repository, newest first, open and closed alike. anthropics/claude-agent-sdk-python, openai/openai-agents-python, PrefectHQ/fastmcp, modelcontextprotocol/python-sdk, simonw/llm: 100 pull requests (87 with Claude Code fingerprints, 6 Codex, 6 Cursor, 1 Copilot).

Each project was installed once, at the tip of its default branch, into its own virtualenv or `node_modules`, and every change ran against that environment. Older changes can therefore fail for environmental reasons (a newer pytest, a moved dependency). Those land in *could not judge* and are excluded from the percentages.

Verdicts per test: PROVEN (fails without the change), GUARD (passes on both sides next to a PROVEN test), THEATER (passes on both sides, and no test proves the change), WEAK (fails without the change only because the code it calls did not exist), BROKEN, FLAKY, SKIPPED. For a change as a whole:

- **Proven**: at least one test proves it and none is THEATER or WEAK.
- **Mixed**: some tests prove it, some are WEAK.
- **Unproven**: every test passes without the change.
- **Weak only**: tests fail without the change only because what they call is new.

## Results

| | Changes | Judged | Proven | Mixed | Unproven | Weak only | Not judged |
|---|---|---|---|---|---|---|---|
| Maintainer fix commits | 81 | 71 | 64 (90%) | 2 (3%) | 5 (7%) | 0 | 10 |
| Agent-authored pull requests | 100 | 91 | 75 (82%) | 5 (5%) | 2 (2%) | 9 (10%) | 9 |

Percentages are of judged changes. Full tables, every change with a link, and the raw results: [maintainer commits](../study/results/maintainer-commits.md), [agent pull requests](../study/results/agent-prs.md).

### What stands out

- **Most changes in these projects come with a test that proves them**: 93% of maintainer commits and 88% of agent PRs have at least one test that fails without the change (proven or mixed). These are well-run projects, several of them maintained by the companies that make the agents.
- **Agents' typical gap is WEAK, not THEATER.** In 10% of agent PRs every test fails on the old code only because the code it calls did not exist yet, most often because the test file imports a name the change adds at the top, so on the old code nothing in that file can even load. Those tests never run against the old behavior. No maintainer commit in the sample had that shape.
- **THEATER is rare, and every case has a story**:
  - fixes that only change types (a `TypedDict` key in claude-agent-sdk-python, two `src/types.ts`-only fixes in defu, marshmallow's `error_messages` annotation): no runtime test can prove them, a type checker can;
  - a platform-bound fix (a Windows newline fix in the MCP SDK) run on Linux, where the bug does not exist;
  - dateutil's fix for a `__repr__` that was dead code: the new `repr` prints exactly what the inherited default already printed, so its regression test passes on the old code and would not have caught the bug;
  - a maintenance commit that happened to mention an issue.
- **Regression guards are common and healthy.** 23% of agent tests and 31% of maintainer tests were GUARD: they pass on both sides next to a proving test, pinning the neighboring behavior.

### What the pilot changed in Receipts

Running over real history found the cases this study depends on: parametrize tables and case tables in loops (a new case is usually one row), GUARD next to PROVEN, `test:`/`chore:` commits as behavior-preserving, timezone-bound suites, hangs as failures, xdist, and tests that import an installed copy instead of the checkout. Each has a scenario in `test/`.

## Caveats

- Samples are small and not random: a handful of well-maintained libraries and five agent-heavy repositories. The numbers describe these projects, not the ecosystem.
- "Agent-authored" means an agent's fingerprint appears in the PR's commits. Humans steer those agents, and some agent-assisted work carries no fingerprint at all.
- Pull requests include unmerged ones. A THEATER test in a PR that was later rejected or reworked still says something about what the agent produced, not about what shipped.
- Receipts runs the test runner directly. Tests that need the project's own environment (a `TZ`, services, feature flags) can read as THEATER in a plain run; we set `TZ` for dayjs, whose timezone fixes only reproduce outside UTC.
- A test module that imports a name the change adds fails to load on the old code, so every test in it is WEAK, even ones that exercise the fixed behavior. Agent PRs that add a constant and import it at the top of an existing test file hit this often.
- A test can prove a change and still test the wrong thing. PROVEN means "this test notices the change", not "the change is correct".

## Reproduce

```bash
npm ci
node study/run.mjs --config study/repos.json --out study-out     # maintainer commits
node study/run.mjs --config study/agents.json --out study-agents # agent PRs
node study/report.mjs study-out/results.jsonl
```

The raw results are in [`study/results/`](../study/results/), and as a dataset on Hugging Face: [syntaxixr/receipts-study](https://huggingface.co/datasets/syntaxixr/receipts-study) (`node study/export-hf.mjs <dir>` rebuilds it). The `Study` workflow runs the same scripts on the AIDev dataset of agent pull requests.
