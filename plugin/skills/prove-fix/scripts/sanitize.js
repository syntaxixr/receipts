/**
 * Test names and failure messages come from the repository under test, which
 * may be hostile. Everything receipts prints or posts from them goes through
 * here first.
 */
// C0/C1 controls (ESC starts terminal escape sequences), line/paragraph
// separators, and bidirectional overrides that can make text read differently
// from what it is ("Trojan Source").
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069\u200e\u200f]+/g;
/** One line of plain text, safe to print to a terminal. */
export function plain(text, max = 300) {
    const flat = text.replace(UNSAFE_CHARS, " ").replace(/\s+/g, " ").trim();
    return flat.length > max ? `${flat.slice(0, max - 3)}...` : flat;
}
/**
 * Content for a Markdown code span inside a table cell: no backtick can end the
 * span early, no pipe can end the cell. Inside a code span GitHub renders no
 * HTML, links or @mentions.
 */
export function codeSpan(text, max = 300) {
    return "`" + plain(text, max).replace(/`/g, "'").replace(/\|/g, "\\|") + "`";
}
const TOKEN_PATTERNS = [
    /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, // GitHub tokens
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
    /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/g, // Anthropic / OpenAI style keys
    /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
    /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, // Slack
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JWT
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
];
const SECRET_ENV_NAME = /TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|PRIVATE|CREDENTIAL|AUTH/i;
/**
 * Hides secrets a failing test may have printed. PR comments are not masked
 * the way GitHub masks secrets in logs, so a leaked value there would be public.
 */
export function redact(text, env = process.env) {
    let out = text;
    for (const [name, value] of Object.entries(env)) {
        if (value && value.length >= 8 && SECRET_ENV_NAME.test(name))
            out = out.split(value).join("***");
    }
    for (const re of TOKEN_PATTERNS)
        out = out.replace(re, "***");
    return out;
}
