import path from "node:path";
/** Repo-relative path with forward slashes, whatever the platform. */
export function relPath(root, abs) {
    return path.relative(root, abs).split(path.sep).join("/");
}
