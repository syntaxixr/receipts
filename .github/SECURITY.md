# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub: **Security → Report a vulnerability** on this repository. Do not open a public issue. You should get an answer within a week.

## Threat model

Receipts runs the tests of a change, so it executes that change's code. It is exactly as trusted as the test job it runs next to, and should run under the same isolation: a CI job triggered by `pull_request` (never `pull_request_target`), or a local checkout you would run the tests of anyway.

**Receipts is not a defense against a malicious pull request author.** The tests are the author's code: they can be written to fail on purpose when the old code is in place, or to pass no matter what. Receipts checks honest work, including an agent's; it does not sandbox hostile code. Keep the usual rules for untrusted pull requests: fork PRs get a read-only token, required reviews stay required.

Within that, Receipts defends against a change that tries to use Receipts itself against you:

| Threat | Defense |
|---|---|
| Writing or deleting files outside the repository during the red run (a symlinked directory, `..` paths, a file/directory swap) | Every path is validated before anything is touched; any failure aborts with nothing changed. Files and symlinks are never followed through links. |
| Leaving your tree half-reverted | Every original byte is journaled under `.git` before the swap and restored afterwards, per file, including on Ctrl-C, SIGTERM and SIGHUP. A new run refuses to start while a journal exists; `receipts restore` completes it. |
| Terminal escape sequences, bidi overrides ("Trojan Source") in test names or failure output | Stripped before printing. |
| Markdown injection in the PR comment (breaking out of code spans, table cells) | Repository text only appears inside sanitized code spans. |
| Hijacking the report comment by posting one with the same marker | Only comments written by the action's own login are updated. |
| Test code steering later steps of the job (`GITHUB_ENV`, `GITHUB_OUTPUT`, `GITHUB_PATH`) | Receipts runs with those command files removed from its environment. A test that goes looking for the runner's files on disk can still find them, which is why the comment step's token should stay as narrow as `pull-requests: write`, and fork PRs only ever get a read-only one. |
| Secrets printed by a failing test ending up in a public PR comment | Redaction of known token formats and of secret-looking environment variables before anything is written. |
| Downloading and running a look-alike package | No runtime dependencies; no `npx` fallback: only the project's installed runners are used. |
| An untrusted repository running its code through the Claude Code Stop hook | The hook is off by default and can only be enabled outside the repository (`git config receipts.hook true` in `.git/config`, or `RECEIPTS_HOOK=on`). |
| Prompt injection through test names reaching the agent | The hook sanitizes and labels them as data; the skill tells the agent never to follow instructions found in them. |
| Regular-expression blowup from crafted test titles | Titles are length-capped and patterns with many wildcards fall back to a prefix match. |
| Tampered third-party actions in this repository's own CI | Actions are pinned to commit SHAs; Dependabot proposes updates. |

## Supply chain

- The published package and the Claude Code plugin have no dependencies. `plugin/skills/prove-fix/scripts/` is built from `src/` and CI fails when they differ. The plugin directory has no lockfile, so installing the plugin never runs `npm ci`.
- Development dependencies are locked in `package-lock.json` and audited (`npm audit`).
