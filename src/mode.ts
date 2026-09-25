import fs from "node:fs";
import type { Mode } from "./types.js";

const PREFIX: [RegExp, Mode][] = [
  [/^(fix|bugfix|hotfix)(\([^)]*\))?!?:/i, "fix"],
  [/^feat(\([^)]*\))?!?:/i, "feat"],
  [/^refactor(\([^)]*\))?!?:/i, "refactor"],
  // Changes that must not alter behavior are judged like a refactor: their tests
  // should pass before and after.
  [/^(perf|test|tests|chore|docs|style|ci|build)(\([^)]*\))?!?:/i, "refactor"],
  // Plain-English subjects: "Fix crash when ...", "Refactor the splitter".
  [/^(fix|fixes|fixed|bugfix)\b/i, "fix"],
  [/^refactor(s|ed|ing)?\b/i, "refactor"],
];

const LABELS: [RegExp, Mode][] = [
  [/^(bug|fix|bugfix|regression)$/i, "fix"],
  [/^refactor(ing)?$/i, "refactor"],
  [/^(feature|feat|enhancement)$/i, "feat"],
];

function fromText(text: string): Mode | undefined {
  return PREFIX.find(([re]) => re.test(text.trim()))?.[1];
}

export function isMode(value: string): value is Mode {
  return value === "fix" || value === "feat" || value === "refactor";
}

/**
 * The kind of change decides what a test is expected to do without it: a fix's
 * test should fail on the old code, a refactor's test should still pass.
 */
export function detectMode(explicit: string | undefined, subjects: string[]): { mode: Mode; source: string } {
  if (explicit) {
    if (!isMode(explicit)) throw new Error(`--mode must be fix, feat or refactor (got "${explicit}")`);
    return { mode: explicit, source: "--mode" };
  }
  const env = process.env.RECEIPTS_MODE;
  if (env && isMode(env)) return { mode: env, source: "RECEIPTS_MODE" };

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath && fs.existsSync(eventPath)) {
    try {
      const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
      const pr = event.pull_request;
      if (pr) {
        for (const label of pr.labels ?? []) {
          const hit = LABELS.find(([re]) => re.test(String(label.name)));
          if (hit) return { mode: hit[1], source: `PR label "${label.name}"` };
        }
        const byTitle = fromText(String(pr.title ?? ""));
        if (byTitle) return { mode: byTitle, source: "PR title" };
      }
    } catch {
      // Unreadable event payload: fall through to commit subjects.
    }
  }

  const modes = subjects.map(fromText);
  if (modes.includes("fix")) return { mode: "fix", source: "commit messages" };
  if (modes.includes("feat")) return { mode: "feat", source: "commit messages" };
  if (modes.length > 0 && modes.every((m) => m === "refactor")) return { mode: "refactor", source: "commit messages" };
  return { mode: "fix", source: "default" };
}
