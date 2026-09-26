---
title: "Would your agent's test have failed without the fix? I checked 181 real changes"
published: false
tags: testing, ai, python, opensource
cover_image: https://raw.githubusercontent.com/syntaxixr/receipts/main/docs/media/banner.png
canonical_url: https://github.com/syntaxixr/receipts/blob/main/docs/study.md
---

A coding agent fixes a bug, adds a test, CI turns green, and the agent says it's done. The green check tells you one thing: the tests pass. It doesn't tell you whether the new test would have failed before the fix. If it wouldn't have, it checks nothing about the bug, however green it is.

There's an old, boring way to find out: revert the fix and run the test again. I made that into a tool, Receipts, and ran it over the real history of 17 open-source projects to see how often it matters.

## The check

For every test a change adds or edits, Receipts does two runs:

1. **Green run:** the test runs with the change.
2. **Red run:** only the changed source files go back to the base branch. Tests, dependencies and config stay at the new version. The same test runs again.

Then each test gets a verdict:

| Verdict | With the change | Without it | Meaning |
|---|---|---|---|
| PROVEN | passes | fails | The test catches what the change fixes |
| GUARD | passes | passes | Guards the neighboring behavior, while another test proves the change |
| THEATER | passes | passes | No test proves the change |
| WEAK | passes | fails on import | The code it calls didn't exist yet |
| BROKEN | fails | | The change doesn't pass its own test |

GUARD matters more than it looks. A good fix often comes with a test for the neighboring case ("did I break 2024 while fixing 1900?"). That test *should* pass on both sides. It only becomes a problem when it's the only test there is, and then it's THEATER.

![receipts check: THEATER, then PROVEN after a real test is added](https://raw.githubusercontent.com/syntaxixr/receipts/main/docs/media/demo.gif)

For refactors the expectation flips: every test should pass on both sides (PRESERVED), and one that fails on the old code means the refactor changed behavior (CHANGED).

## What 181 real changes showed

I took two samples:

- **81 maintainer fix commits** from twelve libraries: click, itsdangerous, markupsafe, sqlparse, humanize, marshmallow, more-itertools, tomlkit, dateutil, dayjs, ufo, defu.
- **100 pull requests carrying a coding agent's fingerprint** (87 Claude Code, 6 Codex, 6 Cursor, 1 Copilot) from five agent-heavy repositories: Claude Agent SDK, OpenAI Agents SDK, the MCP Python SDK, fastmcp and simonw/llm.

| | Judged | Proven | Mixed | Unproven | Weak only |
|---|---|---|---|---|---|
| Maintainer fix commits | 71 | 90% | 3% | 7% | 0% |
| Agent pull requests | 91 | 82% | 5% | 2% | 10% |

*Judged* means at least one test ran on both sides; the rest failed for environmental reasons (each project was installed once, at its current tip, so some older changes can't run).

The first thing to say is the good news: **most tests do their job**. These are well-run projects, several of them maintained by the companies that make the agents, and most of their fixes arrive with a test that fails on the old code.

The second thing is where the agents differ.

## The agent-shaped gap: WEAK

In 10% of the agent PRs, every test failed on the old code for the same reason: the test file imports, at the top, a name the change adds. On the old code that import fails, the whole file can't load, and every test in it "fails". It looks like proof. It isn't: none of those tests ever ran against the old behavior.

A concrete one: [anthropics/claude-agent-sdk-python#1016](https://github.com/anthropics/claude-agent-sdk-python/pull/1016), "fix: correct task_updated status vocabulary to match the CLI". Its test file gains two imports at the top:

```python
from claude_agent_sdk.types import (
    TERMINAL_TASK_STATUSES,
    ...
    TaskUpdatedMessage,
    ...
)
```

On the old code neither name exists, so all 10 changed tests fail at import time, including a test that already existed and checks that unknown system subtypes stay generic. The fix may well be right. The tests just can't show it, because the old code was never exercised.

No maintainer commit in the sample had that shape. The fix is small: import new names inside the tests that need them, or put those tests in their own file, so the rest of the module still runs against the old code and can prove the change.

## THEATER is rare, and every case has a story

Only 7 of the 162 judged changes were unproven, with every test passing on the old code too, and each one had a reason:

- **Type-only fixes.** A new key in a `TypedDict`, or a fix to a TypeScript `types.ts`. Runtime tests can't see types; a type checker can.
- **Platform-bound fixes.** A Windows newline fix, tested on Linux, where the bug doesn't exist.
- **A dead-code fix.** dateutil fixed a `__repr__` that was never reached: the new output matched what the inherited default already printed, so the regression test passed on the old code too.
- **Not really a fix.** A maintenance commit that happened to mention an issue number.

That's reassuring about the method: when the tool says THEATER, there's usually something real to look at.

## Things that took real history to get right

- **A new case is one more row.** Most Python regression tests arrive as a row in a multi-line `@pytest.mark.parametrize`, not a new function, and JS ones as a row in an `.each` table or a case table feeding a loop of `it` calls. The locator has to map those edits to the tests they feed.
- **Hangs are failures.** A common fix is for a hang. On the old code the test never returns, so a test still running at the timeout counts as failed, and the fix is PROVEN.
- **Editable installs.** If the project is installed with a plain `pip install .`, tests import the copy in site-packages and the revert never reaches them: every test passes on both sides, a false THEATER. Receipts checks where the changed module was actually imported from and says so instead.
- **Revert in place, with a journal.** A separate git worktree breaks editable installs, so the red run swaps files in the working tree. Every original byte is journaled under `.git` first and restored afterwards, on Ctrl-C too.

## Using it

As a skill for your agent. The agent runs the check on its own tests before it says it's done, and rewrites a THEATER test (not the fix) until it's proven:

```
# Claude Code
/plugin marketplace add syntaxixr/receipts
/plugin install receipts-check@receipts

# Codex, Cursor, Gemini CLI and other agents
npx skills add syntaxixr/receipts
```

As a GitHub Action that keeps one report comment on the PR:

```yaml
- uses: actions/checkout@v7
  with:
    fetch-depth: 0
    persist-credentials: false
# ...set the project up as for your normal test job...
- uses: syntaxixr/receipts@main
```

Or from the command line, in any git repository:

```
npx github:syntaxixr/receipts check
```

It's deterministic: no LLM, no API keys, nothing leaves the machine. It runs your own pytest, vitest or jest, and has no runtime dependencies.

## Limits

The samples are small and not random: a dozen well-maintained libraries and five agent-heavy repositories. The numbers describe those projects, not the ecosystem. "Agent-authored" means an agent's fingerprint is in the PR's commits; humans steer those agents. And PROVEN means "this test notices the change", not "the change is correct".

Python and JavaScript/TypeScript only for now; Go, Java and Rust are on the roadmap.

- Repo: https://github.com/syntaxixr/receipts
- Full method and every change with a link: https://github.com/syntaxixr/receipts/blob/main/docs/study.md
- Data: https://huggingface.co/datasets/syntaxixr/receipts-study

If you run it on your own code, I'd like to hear where the verdicts are wrong.
