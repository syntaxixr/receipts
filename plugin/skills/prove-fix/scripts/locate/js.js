/**
 * Finds describe/it/test blocks in JS/TS test files: a small scanner that skips
 * strings, comments, template literals and regex literals, then matches calls
 * such as `it("name", ...)`, `test.each(table)("name %s", ...)` or
 * `describe.skipIf(cond)("name", ...)` and records the lines each call spans.
 */
const SUITE = new Set(["describe", "suite", "context"]);
const TEST = new Set(["it", "test"]);
// Modifiers that take their own argument list before the real call.
const CALLED_MODIFIERS = new Set(["each", "for", "skipIf", "runIf"]);
class Scanner {
    src;
    constructor(src) {
        this.src = src;
    }
    /** Index just past the string starting at i (quote at i). */
    skipString(i) {
        const q = this.src[i];
        i++;
        while (i < this.src.length && this.src[i] !== q) {
            if (this.src[i] === "\\")
                i++;
            else if (this.src[i] === "\n")
                return i;
            i++;
        }
        return i + 1;
    }
    /** Index just past the template literal starting at i (backtick at i). */
    skipTemplate(i) {
        i++;
        while (i < this.src.length && this.src[i] !== "`") {
            if (this.src[i] === "\\")
                i += 2;
            else if (this.src[i] === "$" && this.src[i + 1] === "{")
                i = this.skipBalanced(i + 1, "{", "}");
            else
                i++;
        }
        return i + 1;
    }
    skipRegex(i) {
        i++;
        let inClass = false;
        while (i < this.src.length) {
            const ch = this.src[i];
            if (ch === "\\")
                i += 2;
            else if (ch === "\n")
                return i;
            else if (inClass) {
                if (ch === "]")
                    inClass = false;
                i++;
            }
            else if (ch === "[") {
                inClass = true;
                i++;
            }
            else if (ch === "/")
                return i + 1;
            else
                i++;
        }
        return i;
    }
    /** Skips a comment, string, template or regex at i; returns i unchanged if none starts there. */
    skipTrivia(i) {
        const ch = this.src[i];
        const next = this.src[i + 1];
        if (ch === "/" && next === "/") {
            const nl = this.src.indexOf("\n", i);
            return nl === -1 ? this.src.length : nl;
        }
        if (ch === "/" && next === "*") {
            const close = this.src.indexOf("*/", i + 2);
            return close === -1 ? this.src.length : close + 2;
        }
        if (ch === '"' || ch === "'")
            return this.skipString(i);
        if (ch === "`")
            return this.skipTemplate(i);
        if (ch === "/" && this.regexAllowed(i))
            return this.skipRegex(i);
        return i;
    }
    regexAllowed(i) {
        let j = i - 1;
        while (j >= 0 && /\s/.test(this.src[j]))
            j--;
        if (j < 0)
            return true;
        const prev = this.src[j];
        if ("(,=:[!&|?{};+-*%<>~^".includes(prev))
            return true;
        const word = /([A-Za-z_$][\w$]*)$/.exec(this.src.slice(Math.max(0, j - 10), j + 1));
        return word !== null && ["return", "typeof", "case", "in", "of", "void", "yield", "await"].includes(word[1]);
    }
    /** Index just past the bracket that closes the one at i. */
    skipBalanced(i, open, close) {
        let depth = 0;
        while (i < this.src.length) {
            const skipped = this.skipTrivia(i);
            if (skipped !== i) {
                i = skipped;
                continue;
            }
            const ch = this.src[i];
            if (ch === open)
                depth++;
            else if (ch === close) {
                depth--;
                if (depth === 0)
                    return i + 1;
            }
            i++;
        }
        return i;
    }
    skipSpace(i) {
        while (i < this.src.length) {
            if (/\s/.test(this.src[i]))
                i++;
            else {
                const skipped = this.src[i] === "/" && (this.src[i + 1] === "/" || this.src[i + 1] === "*") ? this.skipTrivia(i) : i;
                if (skipped === i)
                    return i;
                i = skipped;
            }
        }
        return i;
    }
    /** Reads the first call argument as a title; placeholders stay in for later matching. */
    readTitle(i) {
        i = this.skipSpace(i);
        const ch = this.src[i];
        if (ch === '"' || ch === "'") {
            const end = this.skipString(i);
            return unquote(this.src.slice(i + 1, end - 1));
        }
        if (ch === "`") {
            const end = this.skipTemplate(i);
            return unquote(this.src.slice(i + 1, end - 1));
        }
        // A variable or function reference: the runner decides the title.
        return "*";
    }
}
function unquote(s) {
    return s.replace(/\\(.)/g, "$1");
}
function lineOf(lineStarts, index) {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (lineStarts[mid] <= index)
            lo = mid;
        else
            hi = mid - 1;
    }
    return lo + 1;
}
function scan(source) {
    const sc = new Scanner(source);
    const blocks = [];
    const ident = /[A-Za-z_$][\w$]*/y;
    let i = 0;
    while (i < source.length) {
        const skipped = sc.skipTrivia(i);
        if (skipped !== i) {
            i = skipped;
            continue;
        }
        const prev = source[i - 1];
        if (!/[A-Za-z_$]/.test(source[i]) || (prev !== undefined && /[\w$.]/.test(prev))) {
            i++;
            continue;
        }
        ident.lastIndex = i;
        const head = ident.exec(source)[0];
        const start = i;
        i += head.length;
        const kind = SUITE.has(head) ? "suite" : TEST.has(head) ? "test" : undefined;
        if (!kind)
            continue;
        // Modifier chain: .only .skip .concurrent .each(table) .skipIf(cond) ...
        let j = i;
        let ok = true;
        for (;;) {
            j = sc.skipSpace(j);
            if (source[j] !== ".")
                break;
            ident.lastIndex = sc.skipSpace(j + 1);
            const mod = ident.exec(source);
            if (!mod) {
                ok = false;
                break;
            }
            j = mod.index + mod[0].length;
            if (CALLED_MODIFIERS.has(mod[0])) {
                const k = sc.skipSpace(j);
                if (source[k] === "(")
                    j = sc.skipBalanced(k, "(", ")");
                else if (source[k] === "`")
                    j = sc.skipTemplate(k);
                else
                    ok = false;
            }
        }
        j = sc.skipSpace(j);
        if (!ok || source[j] !== "(")
            continue;
        const title = sc.readTitle(j + 1);
        const end = sc.skipBalanced(j, "(", ")");
        blocks.push({ kind, title, start, end: end - 1 });
        // Continue inside the call so nested blocks are found too.
        i = j + 1;
    }
    const lineStarts = [0];
    for (let k = 0; k < source.length; k++)
        if (source[k] === "\n")
            lineStarts.push(k + 1);
    return { blocks, lineStarts };
}
export function locateJsSuites(source) {
    const { blocks, lineStarts } = scan(source);
    return blocks
        .filter((b) => b.kind === "suite")
        .map((b) => ({ startLine: lineOf(lineStarts, b.start), endLine: lineOf(lineStarts, b.end) }));
}
export function locateJsTests(file, source) {
    const { blocks, lineStarts } = scan(source);
    const suites = blocks.filter((b) => b.kind === "suite");
    const tests = [];
    for (const b of blocks) {
        if (b.kind !== "test")
            continue;
        // A test nested inside another test is not a test of its own.
        if (blocks.some((o) => o !== b && o.kind === "test" && o.start < b.start && o.end >= b.end))
            continue;
        const scope = suites
            .filter((s) => s.start < b.start && s.end >= b.end)
            .sort((x, y) => x.start - y.start)
            .map((s) => s.title);
        tests.push({
            file,
            scope,
            name: b.title,
            id: `${file}::${[...scope, b.title].join(" > ")}`,
            startLine: lineOf(lineStarts, b.start),
            endLine: lineOf(lineStarts, b.end),
        });
    }
    return tests;
}
