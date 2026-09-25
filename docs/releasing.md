# Updating

There is one release, **Receipts**, on the tag `latest`. Updates go to `main`, and the release moves with them.

1. `npm run build && npm test`, commit (with `plugin/skills/prove-fix/scripts/`), push, wait for green CI.
2. If the output changed, redraw the README images: `node docs/media/make-media.mjs`.
3. Move the release to the new commit:
   ```bash
   git tag -f latest && git push -f origin latest
   gh release edit latest --target main
   ```
   Then re-run the `Release` workflow (or `gh release upload latest prove-fix.zip --clobber` after zipping `plugin/skills/prove-fix`), so the skill zip matches.

Who gets updates how:

- **GitHub Action:** `uses: syntaxixr/receipts@main` follows `main`.
- **Claude Code plugin:** `plugin.json` has no version on purpose, so Claude Code tracks the commit and `/plugin update` picks up every change.
- **Skill:** `npx skills update`.
- **CLI:** `npx github:syntaxixr/receipts` always fetches `main`.

## Repository settings

Set once: private vulnerability reporting on (Settings → Code security), and the social preview image `docs/media/banner.png` (Settings → General → Social preview).
