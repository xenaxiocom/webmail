// Xenaxio step 134: pictures and files in comments and descriptions of tasks and
// records. A pasted, dropped or chosen file goes into the task's or record's files
// (step 127 A) and the text keeps a reference to it, the way GitHub writes it:
// "![name](file:<id>)" for a picture, "[name](file:<id>)" for any other file.
// The assistant reads such files with read_object_file.

export const PICTURE = /^image\/(png|jpeg|gif|webp)$/;

export type TextPart = { kind: "text"; text: string } | { kind: "file"; id: string; name: string; picture: boolean };

const REF = /(!?)\[([^\]\n]{0,255})\]\(file:([0-9a-fA-F-]{36})\)/g;

/** The reference a text keeps for an attached file. */
export function fileRef(file: { id: string; name: string; type: string }): string {
  const name = file.name.replace(/[[\]\r\n]/g, "").trim() || "file";
  return `${PICTURE.test(file.type) ? "!" : ""}[${name}](file:${file.id})`;
}

/** A comment's text cut into plain text and the files it points to. */
export function splitFileRefs(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(REF)) {
    if (m.index > last) parts.push({ kind: "text", text: text.slice(last, m.index) });
    parts.push({ kind: "file", id: m[3]!.toLowerCase(), name: m[2]!, picture: m[1] === "!" });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

/**
 * The text with `snippet` put where the caret is (or replacing the selection),
 * on a line of its own for pictures; and where the caret goes after it.
 */
export function insertSnippet(text: string, start: number, end: number, snippet: string): { text: string; caret: number } {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const picture = snippet.startsWith("!");
  const lead = !before ? "" : picture ? (before.endsWith("\n") ? "" : "\n") : /\s$/.test(before) ? "" : " ";
  const tail = !after ? "" : picture ? (after.startsWith("\n") ? "" : "\n") : /^\s/.test(after) ? "" : " ";
  const next = `${before}${lead}${snippet}${tail}${after}`;
  return { text: next, caret: before.length + lead.length + snippet.length + tail.length };
}
