#!/usr/bin/env node
// Renders the README images in docs/media from real runs of the CLI. It builds a
// tiny repo with a leap-year bug, commits an agent-style fix whose test proves
// nothing, runs `receipts check`, adds a test for the year that was actually
// broken and runs it again. Every verdict and summary line in the images comes
// from those runs. Frames are drawn from stage.html in a local Edge or Chrome
// (playwright-core, no browser download) and encoded as GIFs with ffmpeg.
//
//   node docs/media/make-media.mjs          needs ffmpeg on PATH, and Edge or Chrome
//   RECEIPTS_BROWSER=chrome node docs/media/make-media.mjs

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, "../../plugin/skills/prove-fix/scripts/cli.js");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "receipts-media-"));

const git = (...args) =>
  execFileSync("git", ["-c", "user.name=agent", "-c", "user.email=agent@example.com", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...args], {
    cwd: dir,
    encoding: "utf8",
  });
const write = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
};

const TEST_2024 = "from dates import is_leap\n\n\ndef test_2024_is_leap():\n    assert is_leap(2024)\n";
const TEST_2020 = "\n\ndef test_2020_is_leap():\n    assert is_leap(2020)\n";
const TEST_1900 = "\n\ndef test_1900_is_not_leap():\n    assert not is_leap(1900)\n";

git("init", "-q", "-b", "main");
write("pytest.ini", "[pytest]\n");
write("dates.py", "def is_leap(year):\n    return year % 4 == 0\n");
write("tests/test_dates.py", TEST_2024);
git("add", "-A");
git("commit", "-q", "-m", "initial");
git("checkout", "-q", "-b", "agent/fix-century-years");
write("dates.py", "def is_leap(year):\n    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)\n");
write("tests/test_dates.py", TEST_2024 + TEST_2020);
git("add", "-A");
git("commit", "-q", "-m", "fix: century years are not leap years");

function check() {
  const md = path.join(dir, ".git", "receipt.md");
  const r = spawnSync(process.execPath, [CLI, "check", "--markdown", md], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", GITHUB_EVENT_PATH: "", GITHUB_BASE_REF: "", RECEIPTS_MODE: "" },
  });
  if (r.status === 2) throw new Error(`receipts failed:\n${r.stdout}${r.stderr}`);
  return {
    out: r.stdout.replace(/\s+$/, "").split("\n"),
    err: r.stderr.trim().split("\n").filter((l) => l.startsWith("receipts: ")),
    md: fs.readFileSync(md, "utf8"),
  };
}

const theater = check();
write("tests/test_dates.py", TEST_2024 + TEST_2020 + TEST_1900);
const proven = check();
const log = git("log", "--oneline", "-1").trim();
fs.rmSync(dir, { recursive: true, force: true });
if (!theater.out.some((l) => l.includes("THEATER")) || !proven.out.some((l) => l.includes("PROVEN"))) {
  throw new Error("the demo runs did not give THEATER, then PROVEN");
}

// GitHub renders the PR comment; its own Markdown API gives the same HTML.
const res = await fetch("https://api.github.com/markdown", {
  method: "POST",
  headers: { Accept: "application/vnd.github+json", "User-Agent": "receipts-media" },
  body: JSON.stringify({ text: theater.md, mode: "gfm" }),
});
if (!res.ok) throw new Error(`GitHub Markdown API: ${res.status}`);
const DATA = { log, theater, proven, html: await res.text() };

const browser = await chromium.launch({ channel: process.env.RECEIPTS_BROWSER ?? (process.platform === "win32" ? "msedge" : "chrome") });
const STAGE = pathToFileURL(path.join(HERE, "stage.html")).href;

async function open(scene, width, height, scale) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  await page.goto(`${STAGE}#${scene}`);
  await page.evaluate(() => document.fonts.ready);
  const total = await page.evaluate((d) => window.setup(d), DATA);
  return { page, total };
}

async function gif(scene, file, { width, height, scale = 1.5, fps = 12 }) {
  const { page, total } = await open(scene, width, height, scale);
  const frames = fs.mkdtempSync(path.join(os.tmpdir(), `receipts-${scene}-`));
  const n = Math.ceil(total * fps);
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => window.render(t), i / fps);
    await page.screenshot({ path: path.join(frames, `${String(i).padStart(4, "0")}.png`) });
  }
  await page.close();
  const out = path.join(HERE, file);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-framerate", String(fps), "-i", path.join(frames, "%04d.png"),
    "-vf", "split[a][b];[a]palettegen=max_colors=96:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle",
    "-loop", "0", out,
  ]);
  fs.rmSync(frames, { recursive: true, force: true });
  console.log(`${file}: ${n} frames, ${(fs.statSync(out).size / 1e6).toFixed(2)} MB`);
}

async function png(scene, file, { width, height, scale = 2, selector }) {
  const { page } = await open(scene, width, height, scale);
  const target = selector ? page.locator(selector) : page;
  await target.screenshot({ path: path.join(HERE, file) });
  await page.close();
  console.log(`${file}: ${(fs.statSync(path.join(HERE, file)).size / 1e3).toFixed(0)} KB`);
}

try {
  await png("banner", "banner.png", { width: 1280, height: 640, scale: 1 });
  await png("comment", "pr-comment.png", { width: 860, height: 600, selector: "#comment .wrap" });
  await gif("how", "how-it-works.gif", { width: 1000, height: 500 });
  await gif("terminal", "demo.gif", { width: 1000, height: 548 });
  await gif("claude", "claude-code.gif", { width: 1000, height: 632 });
} finally {
  await browser.close();
}
