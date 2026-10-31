// Step 98, part A: code snippets, as in Slack. A snippet is an ordinary Matrix
// text message — a code block in `body` and `<pre><code class="language-…">`
// in the HTML, so every Matrix client shows it — plus our field with the title
// and the language. One too large for a message goes out as a text file with
// the same field; the card loads its text on demand.
import type { HLJSApi } from "highlight.js";

/** Same as format.ts's escapeHtml (format.ts imports this file). */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export const SNIPPET_FIELD = "com.xenaxio.snippet";

/** Languages we offer and highlight: id (as in ```id) → name and file extension. */
export const LANGUAGES: Record<string, { name: string; ext: string }> = {
  plaintext: { name: "Text", ext: "txt" },
  bash: { name: "Shell", ext: "sh" },
  c: { name: "C", ext: "c" },
  cpp: { name: "C++", ext: "cpp" },
  csharp: { name: "C#", ext: "cs" },
  css: { name: "CSS", ext: "css" },
  diff: { name: "Diff", ext: "diff" },
  dockerfile: { name: "Dockerfile", ext: "dockerfile" },
  go: { name: "Go", ext: "go" },
  ini: { name: "INI / TOML", ext: "ini" },
  java: { name: "Java", ext: "java" },
  javascript: { name: "JavaScript", ext: "js" },
  json: { name: "JSON", ext: "json" },
  kotlin: { name: "Kotlin", ext: "kt" },
  markdown: { name: "Markdown", ext: "md" },
  php: { name: "PHP", ext: "php" },
  powershell: { name: "PowerShell", ext: "ps1" },
  python: { name: "Python", ext: "py" },
  ruby: { name: "Ruby", ext: "rb" },
  rust: { name: "Rust", ext: "rs" },
  sql: { name: "SQL", ext: "sql" },
  swift: { name: "Swift", ext: "swift" },
  typescript: { name: "TypeScript", ext: "ts" },
  xml: { name: "HTML / XML", ext: "html" },
  yaml: { name: "YAML", ext: "yaml" },
};

/** What people write after ``` for these languages. */
const ALIASES: Record<string, string> = {
  text: "plaintext", txt: "plaintext", plain: "plaintext",
  sh: "bash", shell: "bash", zsh: "bash", console: "bash",
  "c++": "cpp", cc: "cpp", h: "c", hpp: "cpp", cs: "csharp", "c#": "csharp",
  docker: "dockerfile", toml: "ini", js: "javascript", jsx: "javascript", mjs: "javascript", node: "javascript",
  kt: "kotlin", md: "markdown", ps1: "powershell", ps: "powershell", py: "python", rb: "ruby", rs: "rust",
  ts: "typescript", tsx: "typescript", html: "xml", htm: "xml", svg: "xml", vue: "xml", yml: "yaml", golang: "go", patch: "diff",
};

/** A language id we know, from what was written after ``` (or null). */
export function languageOf(tag: string | null | undefined): string | null {
  const t = (tag ?? "").trim().toLowerCase();
  if (!t) return null;
  if (t in LANGUAGES) return t;
  return ALIASES[t] ?? null;
}

/** Inline up to this size; above it the snippet goes out as a file (a Matrix event is at most 64 KB). */
export const MAX_INLINE_BYTES = 24_000;
/** Pasting more than this into the box offers a snippet, as Slack does. */
export const LONG_PASTE_LINES = 30;
export const LONG_PASTE_CHARS = 4_000;
/** A card shows this many lines until "show all". */
export const PREVIEW_LINES = 10;

export interface Snippet {
  title: string;
  language: string;
  lines: number;
  /** The text, or null when it is in a file (`url`). */
  code: string | null;
  url: string | null;
}

export function isLongPaste(text: string): boolean {
  return text.length > LONG_PASTE_CHARS || text.split("\n").length > LONG_PASTE_LINES;
}

export function countLines(code: string): number {
  return code ? code.split("\n").length : 0;
}

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** The snippet of a message, if it is one. Fields come from other people: checked, never trusted. */
export function snippetOf(content: Record<string, unknown>): Snippet | null {
  const field = content[SNIPPET_FIELD] as Record<string, unknown> | undefined;
  if (!field || typeof field !== "object") return null;
  const title = clip(field.title, 200);
  const language = languageOf(clip(field.language, 30)) ?? "plaintext";
  if (content.msgtype === "m.file") {
    const url = typeof content.url === "string" && content.url.startsWith("mxc://") ? content.url : null;
    if (!url) return null;
    const lines = typeof field.lines === "number" && Number.isFinite(field.lines) ? Math.max(0, Math.floor(field.lines)) : 0;
    return { title, language, lines, code: null, url };
  }
  if (content.msgtype !== "m.text" || typeof content.body !== "string") return null;
  const code = codeOfBody(content.body);
  if (code === null) return null;
  return { title, language, lines: countLines(code), code, url: null };
}

/** The code between the first ``` line and the last one of a snippet's body. */
function codeOfBody(body: string): string | null {
  const lines = body.split("\n");
  const first = lines.findIndex((l) => l.startsWith("```"));
  let last = -1;
  for (let i = lines.length - 1; i > first; i--)
    if (lines[i]?.trim() === "```") {
      last = i;
      break;
    }
  if (first < 0 || last < 0) return null;
  return lines.slice(first + 1, last).join("\n");
}

/** Bytes of a message's JSON, as the server counts them. */
function bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/** The message of a snippet that fits into one message, or null when it needs a file. */
export function snippetContent(input: { title: string; language: string; code: string }): Record<string, unknown> | null {
  const title = input.title.trim().slice(0, 200);
  const language = languageOf(input.language) ?? "plaintext";
  const code = input.code.replace(/\r\n/g, "\n").replace(/\s+$/, "");
  const tag = language === "plaintext" ? "" : language;
  const body = `${title ? `${title}\n` : ""}\`\`\`${tag}\n${code}\n\`\`\``;
  const html = `${title ? `<p><strong>${escapeHtml(title)}</strong></p>` : ""}<pre><code${tag ? ` class="language-${tag}"` : ""}>${escapeHtml(code)}</code></pre>`;
  const content = { msgtype: "m.text", body, format: "org.matrix.custom.html", formatted_body: html, [SNIPPET_FIELD]: { title, language, lines: countLines(code) } };
  return bytes(content) > MAX_INLINE_BYTES ? null : content;
}

/** The file name a snippet downloads (or is uploaded) as. */
export function snippetFileName(title: string, language: string): string {
  const ext = LANGUAGES[languageOf(language) ?? "plaintext"]?.ext ?? "txt";
  const base = [...title.trim()]
    .map((ch) => (ch.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(ch) ? " " : ch))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "snippet";
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`;
}

/** The fields a file snippet carries next to the usual file fields. */
export function snippetFileFields(input: { title: string; language: string; code: string }): Record<string, unknown> {
  return { [SNIPPET_FIELD]: { title: input.title.trim().slice(0, 200), language: languageOf(input.language) ?? "plaintext", lines: countLines(input.code) } };
}

// --- Highlighting: highlight.js with our languages only, loaded on first use.

let loading: Promise<HLJSApi> | null = null;

export function loadHighlighter(): Promise<HLJSApi> {
  loading ??= (async () => {
    const hljs = (await import("highlight.js/lib/core")).default;
    const langs = await Promise.all([
      import("highlight.js/lib/languages/bash"),
      import("highlight.js/lib/languages/c"),
      import("highlight.js/lib/languages/cpp"),
      import("highlight.js/lib/languages/csharp"),
      import("highlight.js/lib/languages/css"),
      import("highlight.js/lib/languages/diff"),
      import("highlight.js/lib/languages/dockerfile"),
      import("highlight.js/lib/languages/go"),
      import("highlight.js/lib/languages/ini"),
      import("highlight.js/lib/languages/java"),
      import("highlight.js/lib/languages/javascript"),
      import("highlight.js/lib/languages/json"),
      import("highlight.js/lib/languages/kotlin"),
      import("highlight.js/lib/languages/markdown"),
      import("highlight.js/lib/languages/php"),
      import("highlight.js/lib/languages/powershell"),
      import("highlight.js/lib/languages/python"),
      import("highlight.js/lib/languages/ruby"),
      import("highlight.js/lib/languages/rust"),
      import("highlight.js/lib/languages/sql"),
      import("highlight.js/lib/languages/swift"),
      import("highlight.js/lib/languages/typescript"),
      import("highlight.js/lib/languages/xml"),
      import("highlight.js/lib/languages/yaml"),
      import("highlight.js/lib/languages/plaintext"),
    ]);
    const names = ["bash", "c", "cpp", "csharp", "css", "diff", "dockerfile", "go", "ini", "java", "javascript", "json", "kotlin", "markdown", "php", "powershell", "python", "ruby", "rust", "sql", "swift", "typescript", "xml", "yaml", "plaintext"];
    langs.forEach((m, i) => hljs.registerLanguage(names[i] as string, m.default));
    return hljs;
  })();
  return loading;
}

/** Highlighted HTML of code (highlight.js escapes the text itself). */
export function highlight(hljs: HLJSApi, code: string, language: string | null): string {
  const lang = languageOf(language);
  if (!lang || lang === "plaintext") return escapeHtml(code);
  try {
    return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(code);
  }
}

/** The likely language of code, for the snippet dialog's "automatic". */
export function guessLanguage(hljs: HLJSApi, code: string): string {
  const text = code.trim();
  if (!text) return "plaintext";
  if (/^[[{]/.test(text)) {
    try {
      JSON.parse(text);
      return "json";
    } catch {
      // not JSON
    }
  }
  // Prose and logs have hardly any of the signs code is made of; highlight.js would still name a language.
  const visible = text.replace(/\s+/g, "");
  const signs = (visible.match(/[{}()[\];=<>:#$"'`|&]/g) ?? []).length;
  if (signs / visible.length < 0.03) return "plaintext";
  const subset = Object.keys(LANGUAGES).filter((l) => l !== "plaintext");
  const found = hljs.highlightAuto(text.slice(0, 5_000), subset);
  return found.relevance >= 3 && found.language ? (languageOf(found.language) ?? "plaintext") : "plaintext";
}
