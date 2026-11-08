// Xenaxio step 115: Markdown shown the way GitHub shows it (headings, nested
// lists, task boxes, tables, links, code). A note may come from anyone who can
// write the file, so the HTML is sanitized with an allow-list; links open in a
// new tab, and pictures by address are not loaded (like remote images in
// mail) - they become links. Step 133: descriptions of tasks and records show
// their own attached files ("![name](file:<id>)") as pictures, by the address
// the caller gives; nothing else is ever loaded.
import DOMPurify, { type DOMPurify as Purifier } from "dompurify";
import { Marked } from "marked";

const ALLOWED_TAGS = [
  "a", "b", "strong", "i", "em", "u", "del", "s", "code", "pre", "blockquote", "p", "br", "hr",
  "ul", "ol", "li", "input", "h1", "h2", "h3", "h4", "h5", "h6", "table", "thead", "tbody", "tr", "th", "td",
  "sup", "sub", "span", "details", "summary", "kbd", "img",
];
const ALLOWED_ATTR = ["href", "title", "type", "checked", "disabled", "align", "start", "colspan", "rowspan", "open", "src", "alt", "loading"];

/** Where an attached file is shown (inline: a picture in the page) or downloaded. */
export type FileUrl = (fileId: string, inline: boolean) => string;

// Set only while one text is parsed and sanitized (both are synchronous).
let fileUrl: FileUrl | null = null;
const ours = new Set<string>();

const marked = new Marked({
  gfm: true,
  breaks: false,
  walkTokens(token) {
    if ((token.type === "link" || token.type === "image") && token.href.startsWith("file:")) {
      const id = token.href.slice(5);
      token.href = fileUrl && /^[0-9a-f-]{36}$/i.test(id) ? fileUrl(id, token.type === "image") : "";
      if (token.href) ours.add(token.href);
    }
  },
  renderer: {
    // No remote picture is fetched: the reader sees its name as a link.
    image({ href, text }) {
      if (href && ours.has(href)) return `<a href="${escapeAttr(href)}"><img src="${escapeAttr(href)}" alt="${escapeAttr(text)}" loading="lazy"></a>`;
      const label = text || href;
      return `<a href="${escapeAttr(href)}">${escapeText(label)}</a>`;
    },
  },
});

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, "&quot;");
}

// An instance of its own: hooks of other features (chat, mail) are global on
// the default DOMPurify and must not touch notes, nor ours theirs.
let purifier: Purifier | null = null;
function notePurifier(): Purifier {
  if (purifier) return purifier;
  purifier = DOMPurify(window);
  purifier.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      const href = node.getAttribute("href") ?? "";
      if (!/^(https?:|mailto:|#)/i.test(href) && !ours.has(href)) node.removeAttribute("href");
      if (!href.startsWith("#")) {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer nofollow");
      }
    }
    // Only pictures of the record's own files (step 133), never by address.
    if (node.tagName === "IMG" && !ours.has(node.getAttribute("src") ?? "")) node.remove();
    // Only task boxes, and they cannot be ticked in the preview.
    if (node.tagName === "INPUT") {
      if (node.getAttribute("type") !== "checkbox") node.remove();
      else node.setAttribute("disabled", "");
    }
  });
  return purifier;
}

/** Safe HTML for a Markdown text; with `files`, "file:<id>" points to attached files. */
export function renderMarkdown(source: string, files?: FileUrl): string {
  fileUrl = files ?? null;
  ours.clear();
  try {
    const html = marked.parse(source, { async: false }) as string;
    return notePurifier().sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ADD_ATTR: ["target", "rel"] }) as string;
  } finally {
    fileUrl = null;
    ours.clear();
  }
}
