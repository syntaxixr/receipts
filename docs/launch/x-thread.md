# X / Bluesky thread

1/ Your coding agent fixed a bug and added a test. CI is green.
Would that test have failed without the fix?
I checked 181 real changes. 🧵

2/ Receipts runs each test a PR adds or edits twice: with the change, and with the changed code reverted to main.
Fails without the change → PROVEN. Passes both ways → it proves nothing about this change.

3/ Maintainer fixes (click, sqlparse, marshmallow, dayjs…): 90% proven.
Agent PRs (Claude Agent SDK, OpenAI Agents SDK, MCP SDK, fastmcp, llm): 82%.
Good news: in well-run repos, most tests do their job.

4/ The agent-shaped gap: in 10% of agent PRs, tests "fail" on the old code only because they import a name the fix adds. Nothing in the file ever runs against the old behavior.
No maintainer commit did that.

4b/ Example: claude-agent-sdk-python #1016. The test file imports TaskUpdatedMessage at the top, so on the old code all 10 tests die at the import line, including one that already existed.
The fix may be right. The tests can't show it.
github.com/anthropics/claude-agent-sdk-python/pull/1016

5/ Every test that passed both ways had a story: type-only fixes (runtime tests can't see types), a Windows fix tested on Linux, and a __repr__ fix whose output matched the inherited default.

6/ No LLM, deterministic, your own pytest / vitest / jest.
CLI, GitHub Action with a PR comment, and a skill that makes the agent prove its fix before it says "done" (Claude Code plugin, or `npx skills add syntaxixr/receipts` for Codex, Cursor and others).

github.com/syntaxixr/receipts
Data: huggingface.co/datasets/syntaxixr/receipts-study
