const COMMENT = { python: /^#/, js: /^(\/\/|\/\*|\*)/ };
const DEFINITION = {
    python: /^(?:async\s+def|def|class)\s+([A-Za-z_]\w*)|^([A-Za-z_]\w*)\s*(?::[^=]*)?=/,
    js: /^(?:export\s+)?(?:default\s+)?(?:const|let|var|function\*?|async\s+function|class)\s+([A-Za-z_$][\w$]*)/,
};
export function expandChangedTests(input) {
    const lines = input.source.split(/\r?\n/);
    const text = (n) => lines[n - 1] ?? "";
    const hit = new Set();
    for (const n of input.lines) {
        const t = text(n).trim();
        if (t === "" || COMMENT[input.language].test(t))
            continue;
        const suite = input.suites
            .filter((s) => s.startLine <= n && n <= s.endLine)
            .sort((a, b) => b.startLine - a.startLine)[0];
        if (suite) {
            for (const test of input.tests) {
                if (test.startLine >= suite.startLine && test.endLine <= suite.endLine)
                    hit.add(test);
            }
            continue;
        }
        // The top-level statement this line belongs to: the nearest line above it
        // (or itself) that starts at column 0 and is not a closing bracket.
        let k = n;
        while (k > 1 && (/^\s/.test(text(k)) || /^[)\]}]/.test(text(k)) || text(k).trim() === ""))
            k--;
        const def = DEFINITION[input.language].exec(text(k));
        const name = def?.[1] ?? def?.[2];
        if (!name)
            continue;
        const mention = new RegExp(`(^|[^\\w$])${name.replace(/\$/g, "\\$")}([^\\w$]|$)`);
        for (const test of input.tests) {
            const body = lines.slice(test.startLine - 1, test.endLine).join("\n");
            if (mention.test(body))
                hit.add(test);
        }
    }
    return [...hit];
}
