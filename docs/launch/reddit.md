# Reddit

Post them on launch day, about half an hour apart, and stay in the comments. Read each subreddit's rules first: they change, and all three remove posts that break them.

---

## r/ClaudeAI

**Flair:** Built with Claude (or whatever the sidebar currently asks project posts to use)

**Title:** I built a Claude Code skill that makes Claude prove its bug fixes: every test it writes has to fail without the fix

**Text:**

Claude Code fixes a bug, adds a test, CI goes green, and it says "done". But a green test only says the test passes. It doesn't say the test would have failed before the fix.

So I built Receipts. It runs every test a change adds or edits twice: once with the change, and once with the changed source files reverted to main. A test for a fix has to fail without it.

- **PROVEN**: fails without the fix, passes with it. That's the one you want.
- **THEATER**: passes both ways. It would have passed before the fix too, so it proves nothing.
- **WEAK**: fails without the fix only because it imports something the fix added.

It ships as a Claude Code plugin with a `prove-fix` skill. After Claude fixes a bug, it runs the check on its own tests before saying it's done. In a real session, Claude wrote a test for `is_leap(2020)`, got THEATER (2020 was never broken; 1900 was), wrote a test for 1900 instead, and got PROVEN, without touching the fix.

```
/plugin marketplace add syntaxixr/receipts
/plugin install receipts-check@receipts
```

To see how often this matters, I ran it over 100 pull requests with coding-agent fingerprints (mostly Claude Code) in Claude Agent SDK, OpenAI Agents SDK, the MCP Python SDK, fastmcp and simonw/llm, plus 81 maintainer fix commits in libraries like click and sqlparse:

- 82% of agent PRs and 90% of maintainer fixes were proven. Most tests do their job.
- In **10% of agent PRs**, every test failed on the old code only because the test file imported a name the PR added at the top. On the old code the file can't even load, so nothing ever ran against the old behavior. No maintainer commit did that.

Example: [claude-agent-sdk-python #1016](https://github.com/anthropics/claude-agent-sdk-python/pull/1016). Its test file imports `TaskUpdatedMessage` and `TERMINAL_TASK_STATUSES` at the top. On the old code the whole file fails to import, so all 10 tests "fail", including an existing test for unknown subtypes. The fix may well be right; the tests just can't show it.

There's also an opt-in Stop hook that won't let Claude end a turn while its changed tests prove nothing. It's off by default, because it runs the repo's tests.

No LLM in the check itself: it's just your pytest, vitest or jest, run twice. Repo, GIFs and the full study: https://github.com/syntaxixr/receipts

Happy to hear where the verdicts are wrong for your code.

---

## r/Python

**Flair:** Showcase

**Title:** Receipts: checks whether the pytest tests in a fix would have failed without the fix

**Text:**

**What My Project Does**

Receipts runs every test a change adds or edits twice: once with the change, and once with the changed source files reverted to the base branch (tests, dependencies and config stay new). Each test gets a verdict:

- PROVEN: fails without the change, passes with it
- GUARD: passes both ways, next to a PROVEN test (a regression guard for the neighboring case)
- THEATER: passes both ways and no test proves the change
- WEAK: fails without the change only because what it imports didn't exist yet

It understands `@pytest.mark.parametrize` (a new case is usually one more row), unittest classes, pytest-xdist, and counts a test that hangs on the old code as failed, so a fix for a hang is PROVEN. It also detects when tests import an installed copy from site-packages instead of the checkout (a non-editable `pip install .`), and says so instead of reporting a false THEATER.

```
npx github:syntaxixr/receipts check
```

Zero runtime dependencies (Node 20+ and git), and a GitHub Action that comments on the PR. It also works for vitest and jest.

**Target Audience**

Anyone reviewing pull requests where the tests were written alongside the fix, which increasingly means by a coding agent. It's usable today in CI and locally; it runs your project's own pytest.

**Comparison**

- **Coverage** tells you which lines ran. A test can cover the fixed line and still pass on the old code.
- **Mutation testing** (mutmut, cosmic-ray) mutates code at random across the codebase and takes a long time. Receipts reverts the one mutation that matters, your fix, so it takes about as long as running the changed tests twice.
- **Doing it by hand** (`git stash` the fix, rerun the test) is what this automates, per test, with a journal that restores your files even after Ctrl-C.

I ran it over 81 maintainer fix commits (click, sqlparse, marshmallow, dateutil, more-itertools…) and 100 agent-authored PRs: 90% vs 82% proven. The agent-only pattern was WEAK: a test module that imports a new name at the top can't even load on the old code, so none of its tests run against the old behavior. Study and data: https://github.com/syntaxixr/receipts/blob/main/docs/study.md

Repo: https://github.com/syntaxixr/receipts

---

## r/ChatGPTCoding

**Flair:** Project

**Title:** I checked 100 PRs written by coding agents: in 10% of them, the tests could never have caught the bug

**Text:**

Agents write the fix and the test, CI goes green, and it gets merged. I wanted to know how often the test would have failed without the fix, so I built a tool that checks exactly that: it runs every changed test with the change and with the code reverted to main.

Results over 100 agent PRs (Claude Code, Codex, Cursor, Copilot fingerprints) in Claude Agent SDK, OpenAI Agents SDK, MCP Python SDK, fastmcp and simonw/llm, compared with 81 maintainer fix commits:

| | Proven | Weak only |
|---|---|---|
| Maintainer fixes | 90% | 0% |
| Agent PRs | 82% | 10% |

"Weak only" means every test failed on the old code just because it imported something the PR added. The test file can't load on the old code, so the old behavior never gets tested. Example: [claude-agent-sdk-python #1016](https://github.com/anthropics/claude-agent-sdk-python/pull/1016), where all 10 tests fail on the old code at the import line.

The tool is Receipts. The useful part for agent workflows: it's a skill the agent runs on its own tests before it says "done", in Claude Code, Codex, Cursor and other agents that read SKILL.md:

```
npx skills add syntaxixr/receipts
```

When a test comes back THEATER (passes even without the fix), the agent rewrites the test around the input that was actually broken, not the fix. There's also a GitHub Action that comments on the PR.

Deterministic, no LLM in the check, runs your own pytest / vitest / jest. Repo: https://github.com/syntaxixr/receipts
