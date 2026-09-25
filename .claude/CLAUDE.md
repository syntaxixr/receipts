# Receipts

Proves that a change's tests catch the change: each added or edited test runs with the change and with the changed source files reverted to the merge base.

## Commands

- `npm test`: builds `plugin/skills/prove-fix/scripts/`, then runs the vitest suite. Scenario tests build real git repos and run real pytest, vitest and jest, so `pip install pytest pytest-xdist` first.
- Run the suite directly: `npx vitest run --config test/vitest.config.ts` (after `npm run build`).
- `npm run typecheck`: type-checks `src/` and `test/`.
- `npm run build`: compiles `src/` into `plugin/skills/prove-fix/scripts/`.
- `node docs/media/make-media.mjs`: redraws the README images in `docs/media/` from real runs (needs ffmpeg, and Edge or Chrome).

## Rules

- `plugin/` is the Claude Code plugin root. The build lives inside the skill, in `plugin/skills/prove-fix/scripts/`, so the skill works on its own (`npx skills add`, the claude.ai zip) and is the one build everything runs: the plugin, the skill, the CLI (`bin`), `npx github:syntaxixr/receipts` and the GitHub Action. It is committed: rebuild and commit it with every change to `src/`; CI fails when they drift.
- `plugin/` must never get a lockfile or dependencies (`scripts/package.json` only sets `"type": "module"`): Claude Code runs `npm ci` in a plugin root that has both, and users would download our dev tools. Dev dependencies live in the root `package.json` only.
- No runtime dependencies. `src/` uses only Node built-ins so the action and plugin run without `npm install`.
- The red run edits the user's working tree. Anything that touches files goes through `src/swap.ts`, which journals every original byte before changing it. Never write to the tree outside that path.
- Never block or fail a user because Receipts itself broke: tool errors exit 2, and the Stop hook ignores them.

## Security rules (see .github/SECURITY.md)

- Every string that comes from the repository under test (test names, failure output, paths) goes through `src/sanitize.ts` before it is printed or posted: `plain()` for text, `codeSpan()` for Markdown, `redact()` for anything that may contain secrets.
- Every path the red run touches goes through `safeAbs()` in `src/swap.ts`, and all paths are validated before the first write.
- No runtime dependencies and no `npx`: only the project's own installed runners run.
- The Stop hook stays opt-in (`git config receipts.hook true` or `RECEIPTS_HOOK=on`); a repository must never be able to enable it for itself.
- Third-party actions in `.github/workflows` are pinned to commit SHAs.

## Map

- `src/cli.ts`: argument parsing and output.
- `src/check.ts`: the whole run: diff, locate changed tests, green run, red run, verdicts.
- `src/git.ts`: git plumbing (merge base, changed files and lines).
- `src/classify.ts`: test / source / environment split.
- `src/locate/`: finds test functions and their line ranges (`python.ts`, `js.ts`), and maps edits outside any test (case tables, fixtures, setUp) onto the tests that use them (`expand.ts`).
- `src/runners/`: pytest, vitest and jest, behind one interface in `index.ts`. The pytest plugin is `plugin/skills/prove-fix/scripts/pytest/receipts_pytest.py` (source, not built).
- `src/verdict.ts`: green/red outcomes to a verdict.
- `src/swap.ts`: in-place revert and restore with the journal, behind the path-safety checks.
- `src/sanitize.ts`: `plain()`, `codeSpan()`, `redact()` for everything that comes from the repository under test.
- `action.yml`: the GitHub Action. `plugin/`: the Claude Code plugin `receipts-check` (`.claude-plugin/plugin.json`, the `prove-fix` skill, `hooks/`); `.claude-plugin/marketplace.json` at the root points at it.
- `test/`: `scenarios` (pytest), `js-scenarios` (vitest, jest), `hook`, `security` (attacks on the tool itself), `unit`.
- `study/`: batch runs over real repositories (not shipped). They execute other projects' code: run them in a throwaway container or the `Study` workflow.
