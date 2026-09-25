import fs from "node:fs";
import path from "node:path";
import { modeAtRev, showAtRev } from "./git.js";
import type { ChangedFile } from "./types.js";

/**
 * The red run happens in place: worktrees break editable installs (the package
 * still imports from the original checkout), so we swap the source files back to
 * the merge base right here and restore them afterwards. Every original byte is
 * journaled under .git first, so a crash can be undone with `receipts restore`.
 *
 * Safety rules, checked for every path before anything is touched:
 * - the path is a plain repository path: relative, no `..`, inside the root;
 * - no directory on the way to it is a symlink (a pull request that turns
 *   `pkg/` into a link to `~/.ssh` must not get us writing there);
 * - it is not a directory, and no other swapped path lies inside it (a file
 *   turned into a directory, or back, is refused rather than guessed at).
 * If any path fails, nothing is changed and the run stops with an error.
 */

export class UnsafePathError extends Error {}

interface JournalEntry {
  path: string;
  existed: boolean;
  mode?: number;
  blob?: string;
  /** Set when the path was a symlink: its target. */
  link?: string;
}

interface Journal {
  createdDirs: string[];
  entries: JournalEntry[];
}

/** What a path should hold during the red run. */
type Target = { kind: "file"; content: Buffer } | { kind: "link"; target: string } | null;

function lstatOrNull(abs: string): fs.Stats | null {
  try {
    return fs.lstatSync(abs);
  } catch {
    return null;
  }
}

/** Resolves a repository-relative path, refusing anything that could reach outside the root. */
function safeAbs(root: string, rel: string): string {
  const parts = rel.split(/[\\/]/);
  if (!rel || path.isAbsolute(rel) || parts.some((p) => p === "" || p === "." || p === "..")) {
    throw new UnsafePathError(`refusing to touch "${rel}": not a plain path inside the repository`);
  }
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root + path.sep)) {
    throw new UnsafePathError(`refusing to touch "${rel}": it resolves outside the repository`);
  }
  for (let dir = path.dirname(abs); dir !== root; dir = path.dirname(dir)) {
    const st = lstatOrNull(dir);
    if (st && !st.isDirectory()) {
      const what = st.isSymbolicLink() ? "a symlink" : "not a directory";
      throw new UnsafePathError(`refusing to touch "${rel}": "${path.relative(root, dir)}" is ${what}`);
    }
  }
  return abs;
}

/** Removes a file or symlink (never follows a link, never removes a directory). */
function removeEntry(abs: string): void {
  const st = lstatOrNull(abs);
  if (!st) return;
  if (st.isDirectory()) throw new UnsafePathError(`refusing to remove directory "${abs}"`);
  fs.unlinkSync(abs);
}

function baseTarget(root: string, mb: string, rel: string): Target {
  const mode = modeAtRev(root, mb, rel);
  if (!mode) return null;
  const content = showAtRev(root, mb, rel);
  return mode === "120000" ? { kind: "link", target: content.toString("utf8") } : { kind: "file", content };
}

export function journalDir(gitDirPath: string): string {
  return path.join(gitDirPath, "receipts-backup");
}

export function hasPendingJournal(gitDirPath: string): boolean {
  return fs.existsSync(path.join(journalDir(gitDirPath), "journal.json"));
}

function ensureDir(root: string, dir: string, created: string[]): void {
  const missing: string[] = [];
  let cur = dir;
  while (cur !== root && !lstatOrNull(cur)) {
    missing.push(cur);
    cur = path.dirname(cur);
  }
  for (const d of missing.reverse()) {
    fs.mkdirSync(d);
    created.push(path.relative(root, d));
  }
}

/** Puts every changed source file back to its merge-base state. */
export function revertSources(rootIn: string, gitDirPath: string, mb: string, sources: ChangedFile[]): void {
  const root = fs.realpathSync(rootIn);

  // What each touched path must look like during the red run: base content or absent.
  const targets = new Map<string, Target>();
  for (const f of sources) {
    if (f.status === "renamed" && f.oldPath) {
      targets.set(f.path, null);
      targets.set(f.oldPath, baseTarget(root, mb, f.oldPath));
    } else if (f.status === "added") {
      targets.set(f.path, null);
    } else {
      targets.set(f.path, baseTarget(root, mb, f.path));
    }
  }

  // Check every path before touching anything.
  const rels = [...targets.keys()];
  for (const rel of rels) {
    const abs = safeAbs(root, rel);
    if (lstatOrNull(abs)?.isDirectory()) {
      throw new UnsafePathError(`refusing to touch "${rel}": it is a directory now (a file/directory change is not supported)`);
    }
    const inside = rels.find((other) => other.startsWith(`${rel}/`));
    if (inside) {
      throw new UnsafePathError(`refusing to touch "${rel}": "${inside}" is inside it (a file/directory change is not supported)`);
    }
  }

  const dir = journalDir(gitDirPath);
  fs.mkdirSync(dir, { recursive: true });
  const journal: Journal = { createdDirs: [], entries: [] };

  // Journal everything before touching anything. lstat, not stat: a symlink
  // (even a dangling one) is journaled as a link, not as the file it points to.
  let n = 0;
  for (const rel of rels) {
    const abs = safeAbs(root, rel);
    const st = lstatOrNull(abs);
    if (!st) {
      journal.entries.push({ path: rel, existed: false });
    } else if (st.isSymbolicLink()) {
      journal.entries.push({ path: rel, existed: true, link: fs.readlinkSync(abs) });
    } else {
      const blob = `${n++}.bin`;
      fs.copyFileSync(abs, path.join(dir, blob));
      journal.entries.push({ path: rel, existed: true, mode: st.mode, blob });
    }
  }
  const writeJournal = () => fs.writeFileSync(path.join(dir, "journal.json"), JSON.stringify(journal, null, 2));
  writeJournal();

  for (const [rel, target] of targets) {
    const abs = safeAbs(root, rel);
    removeEntry(abs);
    if (target === null) continue;
    ensureDir(root, path.dirname(abs), journal.createdDirs);
    writeJournal();
    if (target.kind === "link") fs.symlinkSync(target.target, abs);
    else fs.writeFileSync(abs, target.content);
  }
}

/**
 * Undoes revertSources. Safe to call when nothing is pending. Each path is
 * restored on its own: one failure does not stop the others, and the journal
 * is kept (and an error thrown) until every path is back.
 */
export function restoreSources(rootIn: string, gitDirPath: string): boolean {
  const dir = journalDir(gitDirPath);
  const file = path.join(dir, "journal.json");
  if (!fs.existsSync(file)) return false;
  const root = fs.realpathSync(rootIn);
  const journal = JSON.parse(fs.readFileSync(file, "utf8")) as Journal;
  const failures: string[] = [];

  for (const e of journal.entries) {
    try {
      const abs = safeAbs(root, e.path);
      removeEntry(abs);
      if (!e.existed) continue;
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      if (e.link !== undefined) {
        fs.symlinkSync(e.link, abs);
      } else if (e.blob) {
        fs.copyFileSync(path.join(dir, e.blob), abs);
        if (e.mode !== undefined) fs.chmodSync(abs, e.mode & 0o7777);
      }
    } catch (err) {
      failures.push(`${e.path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  for (const d of [...journal.createdDirs].reverse()) {
    try {
      const abs = safeAbs(root, d);
      if (fs.readdirSync(abs).length === 0) fs.rmdirSync(abs);
    } catch {
      // Already gone or not empty; either way nothing of ours is left in it.
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `could not restore ${failures.length} file(s); the originals are kept in ${dir}:\n  ${failures.join("\n  ")}`,
    );
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}
