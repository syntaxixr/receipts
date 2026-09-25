import { execFileSync } from "node:child_process";
export function git(cwd, args) {
    return execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
    });
}
export function gitBuffer(cwd, args) {
    return execFileSync("git", args, {
        cwd,
        maxBuffer: 256 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
    });
}
function tryGit(cwd, args) {
    try {
        return git(cwd, args).trim();
    }
    catch {
        return undefined;
    }
}
export function repoRoot(cwd) {
    return git(cwd, ["rev-parse", "--show-toplevel"]).trim();
}
export function gitDir(root) {
    return git(root, ["rev-parse", "--absolute-git-dir"]).trim();
}
export function headSha(root) {
    return git(root, ["rev-parse", "HEAD"]).trim();
}
export function isDirty(root) {
    return git(root, ["status", "--porcelain", "--untracked-files=all"]).trim() !== "";
}
export function hasTrackedChanges(root) {
    return git(root, ["status", "--porcelain", "--untracked-files=no"]).trim() !== "";
}
/**
 * Picks the ref the change is measured against: an explicit --base, the PR base
 * branch in GitHub Actions, or the usual default-branch names.
 */
export function resolveBase(root, explicit) {
    // A ref that starts with "-" would reach git as an option, not a revision.
    if (explicit !== undefined && (explicit.startsWith("-") || /[\s\0]/.test(explicit))) {
        throw new Error(`--base "${explicit}" is not a valid ref`);
    }
    const candidates = [];
    if (explicit)
        candidates.push(explicit);
    else {
        const prBase = process.env.GITHUB_BASE_REF;
        if (prBase && !prBase.startsWith("-"))
            candidates.push(`origin/${prBase}`, prBase);
        candidates.push("origin/HEAD", "origin/main", "origin/master", "main", "master");
    }
    for (const ref of candidates) {
        if (tryGit(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]))
            return ref;
    }
    throw new Error(explicit
        ? `Base ref "${explicit}" not found. In CI, check out with fetch-depth: 0.`
        : "Could not find a base branch (tried origin/HEAD, origin/main, origin/master, main, master). Pass --base <ref>.");
}
export function mergeBase(root, base) {
    return git(root, ["merge-base", base, "HEAD"]).trim();
}
/**
 * Changes between the merge base and the working tree, untracked files included,
 * or only up to HEAD when `committed` is set.
 */
export function changedFiles(root, mb, committed = false) {
    const out = git(root, ["diff", "--name-status", "-M", "-z", "--no-ext-diff", mb, ...(committed ? ["HEAD"] : [])]);
    const parts = out.split("\0");
    const changes = [];
    for (let i = 0; i < parts.length;) {
        const code = parts[i++];
        if (!code)
            continue;
        const letter = code[0];
        if (letter === "R" || letter === "C") {
            const oldPath = parts[i++];
            const path = parts[i++];
            changes.push(letter === "R" ? { status: "renamed", path, oldPath } : { status: "added", path });
        }
        else {
            const path = parts[i++];
            if (letter === "A")
                changes.push({ status: "added", path });
            else if (letter === "D")
                changes.push({ status: "deleted", path });
            else
                changes.push({ status: "modified", path });
        }
    }
    if (committed)
        return changes;
    const untracked = git(root, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean);
    for (const path of untracked) {
        if (!ENVIRONMENT_DIR.test(path))
            changes.push({ status: "added", path });
    }
    return changes;
}
// Installed dependencies and caches are never part of the change, even when a
// project forgot to gitignore them: treating them as new source files would
// delete them for the red run.
const ENVIRONMENT_DIR = /(^|\/)(node_modules|\.venv|venv|__pycache__|\.pytest_cache|\.mypy_cache|\.ruff_cache|\.tox|\.nox|\.cache|site-packages|\.eggs|[^/]+\.egg-info)\/|\.py[co]$/;
/**
 * Head-side line numbers touched by the change. A pure deletion marks the lines
 * around it, so deleting an assertion still counts as editing that test.
 */
export function changedLines(root, mb, path, oldPath, committed = false) {
    const paths = oldPath ? [oldPath, path] : [path];
    const revs = committed ? [mb, "HEAD"] : [mb];
    const out = git(root, ["diff", "-U0", "-M", "--no-color", "--no-ext-diff", ...revs, "--", ...paths]);
    const lines = new Set();
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
    for (const line of out.split("\n")) {
        const m = hunk.exec(line);
        if (!m)
            continue;
        const start = Number(m[1]);
        const count = m[2] === undefined ? 1 : Number(m[2]);
        if (count === 0) {
            lines.add(start);
            lines.add(start + 1);
        }
        else {
            for (let n = start; n < start + count; n++)
                lines.add(n);
        }
    }
    return lines;
}
export function showAtRev(root, rev, path) {
    return gitBuffer(root, ["show", `${rev}:${path}`]);
}
/** Git file mode at a revision ("100644", "100755", "120000" for a symlink), or undefined if absent. */
export function modeAtRev(root, rev, path) {
    const out = tryGit(root, ["ls-tree", rev, "--", path]);
    return out ? out.split(/\s/)[0] : undefined;
}
export function commitSubjects(root, mb) {
    return git(root, ["log", "--format=%s", `${mb}..HEAD`]).split("\n").filter(Boolean);
}
