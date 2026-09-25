#!/usr/bin/env node
import fs from "node:fs";
import { parseArgs } from "node:util";
import { DEFAULT_FAIL_ON, runCheck } from "./check.js";
import { gitDir, repoRoot } from "./git.js";
import { toJson, toMarkdown, toText } from "./report.js";
import { restoreSources } from "./swap.js";
import { VERSION } from "./version.js";
const HELP = `receipts: prove that a change's tests actually catch it.

Usage:
  receipts check [options]   Run changed tests with and without the change
  receipts restore           Undo a red run that was interrupted

Options for check:
  --base <ref>        Base to compare against (default: PR base, origin/HEAD, main, master)
  --mode <m>          fix | feat | refactor (default: from PR labels/title or commit messages)
  --fail-on <list>    Verdicts that fail the check (default: ${DEFAULT_FAIL_ON.join(",")})
                      Any of: broken,theater,changed,weak,flaky,skipped,no-tests
  --reruns <n>        Extra runs for failing tests to rule out flakes (default: 2)
  --python <path>     Python interpreter for pytest (default: python, then python3)
  --js-runner <r>     vitest | jest (default: from package.json)
  --committed         Check committed work only (HEAD vs base); needs a clean tree
  --timeout <sec>     Per test run (default: 300). A test still running then counts as
                      failed: on the old code, that is a hang the change fixed
  --json <file>       Write the receipt as JSON
  --markdown <file>   Write a Markdown report (also appended to $GITHUB_STEP_SUMMARY)
  -h, --help          Show this help
  -v, --version       Show the version

Exit codes: 0 pass, 1 a --fail-on verdict was found, 2 receipts itself failed.`;
function main(argv) {
    const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
            base: { type: "string" },
            mode: { type: "string" },
            "fail-on": { type: "string" },
            reruns: { type: "string" },
            python: { type: "string" },
            "js-runner": { type: "string" },
            committed: { type: "boolean" },
            timeout: { type: "string" },
            json: { type: "string" },
            markdown: { type: "string" },
            help: { type: "boolean", short: "h" },
            version: { type: "boolean", short: "v" },
        },
    });
    if (values.version) {
        console.log(VERSION);
        return 0;
    }
    const command = positionals[0];
    if (values.help || !command) {
        console.log(HELP);
        return command || values.help ? 0 : 2;
    }
    if (command === "restore") {
        const root = repoRoot(process.cwd());
        console.log(restoreSources(root, gitDir(root)) ? "Restored the files from the interrupted run." : "Nothing to restore.");
        return 0;
    }
    if (command !== "check") {
        console.error(`Unknown command "${command}".\n\n${HELP}`);
        return 2;
    }
    const timeout = values.timeout === undefined ? 300 : Number(values.timeout);
    if (!(timeout > 0))
        throw new Error("--timeout must be a positive number of seconds");
    const reruns = values.reruns === undefined ? 2 : Number(values.reruns);
    if (!Number.isInteger(reruns) || reruns < 0)
        throw new Error("--reruns must be a non-negative integer");
    const failOn = (values["fail-on"] ?? DEFAULT_FAIL_ON.join(","))
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    const receipt = runCheck({
        cwd: process.cwd(),
        base: values.base,
        mode: values.mode,
        failOn,
        reruns,
        python: values.python,
        jsRunner: values["js-runner"],
        committed: values.committed,
        timeoutMs: timeout * 1000,
        log: (msg) => console.error(`receipts: ${msg}`),
    });
    const force = process.env.FORCE_COLOR;
    const color = !process.env.NO_COLOR && (process.stdout.isTTY === true || (force !== undefined && force !== "0"));
    console.log(toText(receipt, color));
    if (values.json)
        fs.writeFileSync(values.json, toJson(receipt) + "\n");
    const md = toMarkdown(receipt);
    if (values.markdown)
        fs.writeFileSync(values.markdown, md + "\n");
    if (process.env.GITHUB_STEP_SUMMARY)
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
    return receipt.passed ? 0 : 1;
}
try {
    process.exitCode = main(process.argv.slice(2));
}
catch (err) {
    console.error(`receipts: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 2;
}
