// Xenaxio step 115: Markdown shown the way GitHub shows it (headings, nested
// lists, task boxes, tables, links, code). A note may come from anyone who can
// write the file, so the HTML is sanitized with an allow-list; links open in a
// new tab, and pictures by address are not loaded (like remote images in
// mail) - they become links.
import DOMPurify, { type DOMPurify as Purifier } from "dompurify";
import { Marked } from "marked";

const ALLOWED_TAGS = [
  "a", "b", "strong", "i", "em", "u", "del", "s", "code", "pre", "blockquote", "p", "br", "hr",
  "ul", "ol", "li", "input", "h1", "h2", "h3", "h4", "h5", "h6", "table", "thead", "tbody", "tr", "th", "td",
  "sup", "sub", "span", "details", "summary", "kbd",
];
const ALLOWED_ATTR = ["href", "title", "type", "checked", "disabled", "align", "start", "colspan", "rowspan", "open"];

const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    // No remote picture is fetched: the reader sees its name as a link.
    image({ href, text }) {
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
      if (!/^(https?:|mailto:|#)/i.test(href)) node.removeAttribute("href");
      if (!href.startsWith("#")) {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer nofollow");
      }
    }
    // Only task boxes, and they cannot be ticked in the preview.
    if (node.tagName === "INPUT") {
      if (node.getAttribute("type") !== "checkbox") node.remove();
      else node.setAttribute("disabled", "");
    }
  });
  return purifier;
}

/** Safe HTML for a Markdown text. */
export function renderMarkdown(source: string): string {
  const html = marked.parse(source, { async: false }) as string;
  return notePurifier().sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ADD_ATTR: ["target", "rel"] }) as string;
}
