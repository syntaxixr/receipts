# Using Receipts with coding agents

Receipts is most useful inside the agent's own loop: the agent runs it before it says "done", and a THEATER verdict sends it back to write a test that actually reproduces the bug.

## Claude Code

Install the plugin from this repository:

```
/plugin marketplace add syntaxixr/receipts
/plugin install receipts-check@receipts
```

You get two things:

- **The `prove-fix` skill.** Claude runs the check after fixing a bug or refactoring, reads the verdicts, and fixes its tests until they prove the change. Call it yourself with `/receipts-check:prove-fix`.
- **A Stop hook, off until you turn it on.** When Claude ends a turn with changed tests that do not prove the change, the hook blocks the stop and tells it which tests to fix. It checks each state of the code once, so it never loops.

  The hook runs the repository's tests, so it never runs on its own: opening Claude Code in a repository you have not vetted must not execute that repository's code. Turn it on for a repository you trust:

  ```bash
  git config receipts.hook true     # this clone only; a repository cannot set this for itself
  ```

  or for every repository with `RECEIPTS_HOOK=on`. `RECEIPTS_HOOK=off` always wins.

## The skill on its own

The skill in `plugin/skills/prove-fix` carries the CLI inside it, so it works in any agent that reads `SKILL.md` (Claude Code, Codex, Cursor, Gemini CLI, Copilot and others):

```bash
npx skills add syntaxixr/receipts
```

For Claude apps (claude.ai, Claude Desktop), download `prove-fix.zip` from the [release page](https://github.com/syntaxixr/receipts/releases/latest) and upload it in *Settings → Capabilities → Skills*.

## Codex, Cursor, Copilot, Aider and other agents, without a skill

Add this block to your `AGENTS.md` (or `.cursor/rules`, `.github/copilot-instructions.md`):

```markdown
## Prove every fix

After fixing a bug or changing behavior, and before saying the work is done, run:

    npx github:syntaxixr/receipts check

It runs each test you added or edited with and without your change.
- PROVEN: done.
- THEATER: the test passes even without your change. Rewrite it so it reproduces the bug.
- WEAK: for a fix, test the behavior, not just that the function exists.
- BROKEN / FLAKY: fix the code or make the test deterministic.
- Refactors (`--mode refactor`): tests must be PRESERVED, never CHANGED.

Never make a verdict pass by weakening, skipping or deleting tests.
```

Use exactly `github:syntaxixr/receipts`: a bare `npx receipts` would fetch an unrelated npm package of that name.
