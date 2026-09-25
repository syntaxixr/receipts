import fs from "node:fs";
import path from "node:path";
import { locateJsSuites, locateJsTests } from "../locate/js.js";
import { locatePythonSuites, locatePythonTests } from "../locate/python.js";
import { runJs } from "./js.js";
import { runPytest } from "./pytest.js";
const PY_TEST = /\.py$/;
const JS_TEST = /\.[cm]?[jt]sx?$/;
const pytest = {
    name: "pytest",
    language: "python",
    suites: locatePythonSuites,
    owns: (file) => PY_TEST.test(file) && !file.endsWith("conftest.py"),
    locate: locatePythonTests,
    run: (root, files, opts, tests) => runPytest(root, files, opts, tests),
};
function jsRunner(name) {
    return {
        name,
        language: "js",
        suites: locateJsSuites,
        owns: (file) => JS_TEST.test(file),
        locate: locateJsTests,
        run: (root, files, opts) => runJs(name, root, files, opts),
    };
}
function detectJsRunner(root) {
    const pkgPath = path.join(root, "package.json");
    if (!fs.existsSync(pkgPath))
        return undefined;
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps.vitest)
            return "vitest";
        if (deps.jest)
            return "jest";
        const script = String(pkg.scripts?.test ?? "");
        if (/\bvitest\b/.test(script))
            return "vitest";
        if (/\bjest\b/.test(script))
            return "jest";
    }
    catch {
        // Malformed package.json: no JS runner.
    }
    return undefined;
}
export function availableRunners(root, jsOverride) {
    const runners = [pytest];
    if (jsOverride && jsOverride !== "vitest" && jsOverride !== "jest") {
        throw new Error(`--js-runner must be vitest or jest (got "${jsOverride}")`);
    }
    const js = jsOverride ?? detectJsRunner(root);
    if (js)
        runners.push(jsRunner(js));
    return runners;
}
/**
 * Parametrized titles carry placeholders the runner fills in: printf-style
 * `%s`/`%d`/`%#`, `$field` for object tables, `${expr}` in templates, or `*`
 * for a non-literal title. Each becomes a wildcard.
 */
export function titleMatcher(title) {
    if (title === "*")
        return /^.*$/s;
    const parts = title.slice(0, 500).split(/(%[sdifjoOpc#]|\$\{[^}]*\}|\$[A-Za-z_][\w.]*|\$\d+)/);
    // Titles come from the repository. Many wildcards in one pattern backtrack
    // badly on a long non-matching name, so past a few only the prefix counts.
    if ((parts.length - 1) / 2 > 6) {
        return new RegExp(`^${parts[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "s");
    }
    const body = parts
        .map((part, idx) => (idx % 2 === 1 ? ".*" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%%/g, "%")))
        .join("");
    return new RegExp(`^${body}$`, "s");
}
function fold(prev, next) {
    if (!prev)
        return next;
    if (prev.outcome === "failed")
        return prev;
    if (next.outcome === "failed")
        return next;
    if (prev.outcome === "passed" || next.outcome === "passed")
        return { outcome: "passed" };
    return prev;
}
/** Folds every reported case of a located test (all its parametrizations) into one result. */
export function lookup(run, t) {
    const name = titleMatcher(t.name);
    const scope = t.scope.map(titleMatcher);
    let result;
    for (const item of run.items) {
        if (item.file !== t.file || item.scope.length !== scope.length)
            continue;
        if (!name.test(item.name) || !scope.every((re, k) => re.test(item.scope[k])))
            continue;
        result = fold(result, { outcome: item.outcome, detail: item.detail });
    }
    if (result)
        return result;
    const fileError = run.fileErrors.get(t.file);
    if (fileError !== undefined)
        return { outcome: "failed", detail: fileError };
    // A test that never reported in a run killed for time is the one that hung.
    if (run.timedOut)
        return { outcome: "failed", detail: `${run.timedOut}: the test did not finish` };
    return { outcome: "missing" };
}
