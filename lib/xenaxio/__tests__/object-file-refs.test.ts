import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../markdown";
import { fileRef, insertSnippet, splitFileRefs } from "../object-file-refs";
import { pastedFiles, pastedName } from "../paste";

// Step 132: pictures and files in comments and descriptions of tasks and records.
const ID = "0f8a3c2e-1b2c-4d5e-8f90-123456789abc";

describe("file references in texts", () => {
  it("writes a picture as ![name] and any other file as [name], without brackets in the name", () => {
    expect(fileRef({ id: ID, name: "Bild.png", type: "image/png" })).toBe(`![Bild.png](file:${ID})`);
    expect(fileRef({ id: ID, name: "Angebot [v2].pdf", type: "application/pdf" })).toBe(`[Angebot v2.pdf](file:${ID})`);
  });

  it("cuts a comment into text and files", () => {
    expect(splitFileRefs(`Siehe:\n![Bild.png](file:${ID})\nund [Vertrag.pdf](file:${ID.toUpperCase()}) bitte`)).toEqual([
      { kind: "text", text: "Siehe:\n" },
      { kind: "file", id: ID, name: "Bild.png", picture: true },
      { kind: "text", text: "\nund " },
      { kind: "file", id: ID, name: "Vertrag.pdf", picture: false },
      { kind: "text", text: " bitte" },
    ]);
    expect(splitFileRefs("[x](https://example.com)")).toEqual([{ kind: "text", text: "[x](https://example.com)" }]);
  });

  it("puts a picture on a line of its own at the caret and a file between words", () => {
    expect(insertSnippet("Hallo Welt", 5, 5, "![a](file:x)")).toEqual({ text: "Hallo\n![a](file:x)\n Welt", caret: 19 });
    expect(insertSnippet("Hallo ", 6, 6, "[a](file:x)")).toEqual({ text: "Hallo [a](file:x)", caret: 17 });
    expect(insertSnippet("", 0, 0, "![a](file:x)")).toEqual({ text: "![a](file:x)", caret: 12 });
    expect(insertSnippet("ab", 0, 2, "[a](file:x)").text).toBe("[a](file:x)");
  });
});

describe("pasting files", () => {
  const data = (files: File[], types: string[]) => ({ files, types }) as unknown as DataTransfer;

  it("takes a screenshot but not the picture office apps put next to copied text", () => {
    const shot = new File(["x"], "image.png", { type: "image/png" });
    expect(pastedFiles(data([shot], ["Files"]))).toEqual([shot]);
    expect(pastedFiles(data([shot], ["text/plain", "text/html", "Files"]))).toEqual([]);
    expect(pastedFiles(null)).toEqual([]);
  });

  it("names a screenshot by its time and keeps a name of its own", () => {
    const at = new Date(2026, 10, 8, 14, 5, 9);
    expect(pastedName(new File(["x"], "image.png", { type: "image/png" }), at)).toBe("image-2026-11-08-140509.png");
    expect(pastedName(new File(["x"], "", { type: "image/jpeg" }), at)).toBe("image-2026-11-08-140509.jpg");
    expect(pastedName(new File(["x"], "Plan.pdf", { type: "application/pdf" }), at)).toBe("Plan.pdf");
  });
});

describe("descriptions with attached pictures", () => {
  const url = (id: string, inline: boolean) => `/api/objects/o1/files/${id}${inline ? "?inline=1" : ""}`;

  it("shows the record's own pictures and links its files", () => {
    const html = renderMarkdown(`![Skizze](file:${ID})\n\n[Vertrag](file:${ID})`, url);
    expect(html).toContain(`<img src="/api/objects/o1/files/${ID}?inline=1" alt="Skizze" loading="lazy">`);
    expect(html).toContain(`href="/api/objects/o1/files/${ID}"`);
  });

  it("still loads no picture by address, and no file: without a record", () => {
    const html = renderMarkdown(`![x](https://evil.example/p.png)\n\n<img src="/api/objects/o2/files/${ID}?inline=1">\n\n![y](file:${ID})`, url);
    expect(html.match(/<img/g)).toHaveLength(1);
    expect(html).not.toContain('src="https://evil.example');
    const plain = renderMarkdown(`![y](file:${ID})`);
    expect(plain).not.toContain("<img");
    expect(plain).not.toContain("file:");
  });
});
