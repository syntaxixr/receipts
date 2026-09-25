import fs from "node:fs";
import path from "node:path";
/**
 * The red run swaps files in the checkout. If the tests import the code under
 * test from somewhere else (a non-editable `pip install .` into site-packages,
 * or an editable install that points at another clone), the swap cannot reach
 * them and every test would pass on both sides: a false THEATER.
 *
 * Given the Python source files the change touched and the files the tests
 * actually imported, returns a note for each changed file that was imported
 * from outside the checkout and never from inside it.
 */
export function findShadowedSources(root, sources, imported) {
    const realRoot = fs.realpathSync(root);
    const outside = [...imported].filter((f) => !f.startsWith(realRoot + path.sep));
    const notes = [];
    for (const rel of sources) {
        if (!rel.endsWith(".py"))
            continue;
        let abs;
        try {
            abs = fs.realpathSync(path.join(root, rel));
        }
        catch {
            continue;
        }
        if (imported.has(abs))
            continue;
        // The module's import path: drop a leading src/ or lib/ layout directory.
        const modulePath = rel.replace(/^(src|lib)\//, "");
        const twin = outside.find((f) => {
            const norm = f.split(path.sep).join("/");
            if (modulePath.includes("/"))
                return norm.endsWith(`/${modulePath}`);
            // A top-level module: only a copy installed directly into site-packages counts.
            return /\/(site|dist)-packages\//.test(norm) && norm.endsWith(`-packages/${modulePath}`);
        });
        if (twin)
            notes.push(`${rel} was imported from ${twin}, not from this checkout`);
    }
    return notes;
}
