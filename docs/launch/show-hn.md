# Show HN

**Title** (80 chars max):

Show HN: Receipts – checks that a PR's tests would have caught the bug it fixes

**URL:** https://github.com/syntaxixr/receipts

**Text:**

Coding agents write most of the tests in their pull requests now. A green run tells you those tests pass. It doesn't tell you whether they would have failed before the fix.

Receipts runs every test a change adds or edits twice: with the change, and with the changed source files reverted to the base branch. A test for a fix must fail without it. Each test gets a verdict: PROVEN (fails without the change), GUARD (passes both ways next to a proving test: a regression guard), THEATER (passes both ways and nothing proves the change), WEAK (fails only because the code it calls didn't exist yet).

To see how this plays out on real code, we ran it over 181 changes: maintainer fix commits in 12 libraries (click, sqlparse, marshmallow, dateutil, dayjs…) and 100 pull requests with coding-agent fingerprints in 5 agent-heavy repos (Claude Agent SDK, OpenAI Agents SDK, MCP Python SDK, fastmcp, simonw/llm). What we found:

- Most changes are proven: in 90% of maintainer fixes and 82% of agent PRs a test fails without the change and none of the others is THEATER or WEAK. These are well-run projects.
- The agent-specific gap is WEAK, not THEATER: in 10% of agent PRs, the tests fail on the old code only because the test file imports a name the change adds, so nothing in it ever runs against the old behavior. No maintainer commit had that shape.
- Every THEATER had a story: fixes that only change types (a TypedDict key; TypeScript types), a Windows-only fix tested on Linux, and a `__repr__` fix whose new output matched the inherited one, so the regression test passed on the old code too.

Method, caveats, every change with a link, and the scripts: https://github.com/syntaxixr/receipts/blob/main/docs/study.md

Details that took real history to get right: new regression cases usually arrive as one more row in a parametrize table or a case table in a loop; `test:`/`chore:` commits must be judged as behavior-preserving; a fix for a hang must count the hang as the failure; and a non-editable `pip install .` makes tests import site-packages, so the swap would prove nothing (Receipts detects that and says so instead of guessing).

Deterministic, no LLM, runs your own pytest / vitest / jest, zero runtime dependencies. It ships as a CLI (`npx github:syntaxixr/receipts check`), a GitHub Action that comments on the PR, and an agent skill (a Claude Code plugin, or `npx skills add syntaxixr/receipts` for Codex, Cursor and others) that has the agent prove its own fix before it says it's done. In a test run, Claude got THEATER on its test, replaced it with one for the century case, and got PROVEN, without touching the fix.

Where are the verdicts wrong for your codebase?
