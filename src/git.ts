import { execFileSync } from "node:child_process";

export function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function gitBuffer(cwd: string, args: string[]): Buffer {
  return execFileSync("git", args, {
    cwd,
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function tryGit(cwd: string, args: string[]): string | undefined {
  try {
    return git(cwd, args).trim();
  } catch {
    return undefined;
  }
}

export function repoRoot(cwd: string): string {
  return git(cwd, ["rev-parse", "--show-toplevel"]).trim();
}

export function gitDir(root: string): string {
  return git(root, ["rev-parse", "--absolute-git-dir"]).trim();
}

export function headSha(root: string): string {
  return git(root, ["rev-parse", "HEAD"]).trim();
}

export function isDirty(root: string): boolean {
  return git(root, ["status", "--porcelain", "--untracked-files=all"]).trim() !== "";
}

export function hasTrackedChanges(root: string): boolean {
  return git(root, ["status", "--porcelain", "--untracked-files=no"]).trim() !== "";
}

/**
 * Picks the ref the change is measured against: an explicit --base, the PR base
 * branch in GitHub Actions, or the usual default-branch names.
 */
export function resolveBase(root: string, explicit?: string): string {
  // A ref that starts with "-" would reach git as an option, not a revision.
  if (explicit !== undefined && (explicit.startsWith("-") || /[\s\0]/.test(explicit))) {
    throw new Error(`--base "${explicit}" is not a valid ref`);
  }
  const candidates: string[] = [];
  if (explicit) candidates.push(explicit);
  else {
    const prBase = process.env.GITHUB_BASE_REF;
    if (prBase && !prBase.startsWith("-")) candidates.push(`origin/${prBase}`, prBase);
    candidates.push("origin/HEAD", "origin/main", "origin/master", "main", "master");
  }
  for (const ref of candidates) {
    if (tryGit(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])) return ref;
  }
  throw new Error(
    explicit
      ? `Base ref "${explicit}" not found. In CI, check out with fetch-depth: 0.`
      : "Could not find a base branch (tried origin/HEAD, origin/main, origin/master, main, master). Pass --base <ref>.",
  );
}

export function mergeBase(root: string, base: string): string {
  return git(root, ["merge-base", base, "HEAD"]).trim();
}

export interface RawChange {
  status: "added" | "modified" | "deleted" | "renamed";
  path: string;
  oldPath?: string;
}

/**
 * Changes between the merge base and the working tree, untracked files included,
 * or only up to HEAD when `committed` is set.
 */
export function changedFiles(root: string, mb: string, committed = false): RawChange[] {
  const out = git(root, ["diff", "--name-status", "-M", "-z", "--no-ext-diff", mb, ...(committed ? ["HEAD"] : [])]);
  const parts = out.split("\0");
  const changes: RawChange[] = [];
  for (let i = 0; i < parts.length; ) {
    const code = parts[i++];
    if (!code) continue;
    const letter = code[0];
    if (letter === "R" || letter === "C") {
      const oldPath = parts[i++]!;
      const path = parts[i++]!;
      changes.push(letter === "R" ? { status: "renamed", path, oldPath } : { status: "added", path });
    } else {
      const path = parts[i++]!;
      if (letter === "A") changes.push({ status: "added", path });
      else if (letter === "D") changes.push({ status: "deleted", path });
      else changes.push({ status: "modified", path });
    }
  }
  if (committed) return changes;
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean);
  for (const path of untracked) {
    if (!ENVIRONMENT_DIR.test(path)) changes.push({ status: "added", path });
  }
  return changes;
}

// Installed dependencies and caches are never part of the change, even when a
// project forgot to gitignore them: treating them as new source files would
// delete them for the red run.
const ENVIRONMENT_DIR =
  /(^|\/)(node_modules|\.venv|venv|__pycache__|\.pytest_cache|\.mypy_cache|\.ruff_cache|\.tox|\.nox|\.cache|site-packages|\.eggs|[^/]+\.egg-info)\/|\.py[co]$/;

/**
 * Head-side line numbers touched by the change. A pure deletion marks the lines
 * around it, so deleting an assertion still counts as editing that test.
 */
export function changedLines(
  root: string,
  mb: string,
  path: string,
  oldPath?: string,
  committed = false,
): Set<number> {
  const paths = oldPath ? [oldPath, path] : [path];
  const revs = committed ? [mb, "HEAD"] : [mb];
  const out = git(root, ["diff", "-U0", "-M", "--no-color", "--no-ext-diff", ...revs, "--", ...paths]);
  const lines = new Set<number>();
  const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
  for (const line of out.split("\n")) {
    const m = hunk.exec(line);
    if (!m) continue;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (count === 0) {
      lines.add(start);
      lines.add(start + 1);
    } else {
      for (let n = start; n < start + count; n++) lines.add(n);
    }
  }
  return lines;
}

export function showAtRev(root: string, rev: string, path: string): Buffer {
  return gitBuffer(root, ["show", `${rev}:${path}`]);
}

/** Git file mode at a revision ("100644", "100755", "120000" for a symlink), or undefined if absent. */
export function modeAtRev(root: string, rev: string, path: string): string | undefined {
  const out = tryGit(root, ["ls-tree", rev, "--", path]);
  return out ? out.split(/\s/)[0] : undefined;
}

export function commitSubjects(root: string, mb: string): string[] {
  return git(root, ["log", "--format=%s", `${mb}..HEAD`]).split("\n").filter(Boolean);
}
