import { describe, expect, it } from "vitest";
import { addPendingFiles, composerKey, MAX_PENDING_FILES, pendingFiles, removePendingFile, takePendingFiles } from "../pending-files";

const file = (name: string, type = "image/png", size = 10) => new File([new Uint8Array(size)], name, { type });

describe("files waiting in the chat composer", () => {
  it("keeps files per channel and thread until they are taken", () => {
    const main = composerKey("!a:x");
    const thread = composerKey("!a:x", "$root");
    addPendingFiles(main, [file("a.png"), file("b.pdf", "application/pdf")]);
    addPendingFiles(thread, [file("c.png")]);
    expect(pendingFiles(main).map((p) => p.file.name)).toEqual(["a.png", "b.pdf"]);
    expect(pendingFiles(thread).map((p) => p.file.name)).toEqual(["c.png"]);

    const first = pendingFiles(main)[0]!;
    removePendingFile(main, first.id);
    expect(pendingFiles(main).map((p) => p.file.name)).toEqual(["b.pdf"]);

    const { files, done } = takePendingFiles(main);
    done();
    expect(files.map((f) => f.name)).toEqual(["b.pdf"]);
    expect(pendingFiles(main)).toEqual([]);
    takePendingFiles(thread).done();
  });

  it("gives a pasted screenshot its own name", () => {
    const key = composerKey("!b:x");
    addPendingFiles(key, [file("image.png")]);
    expect(pendingFiles(key)[0]!.file.name).toMatch(/^screenshot-\d{8}-\d{6}\.png$/);
    takePendingFiles(key).done();
  });

  it("refuses files over 100 MB and beyond the limit per message", () => {
    const key = composerKey("!c:x");
    const big = { name: "big.mov", type: "video/quicktime", size: 101 * 1024 * 1024 } as File;
    const many = Array.from({ length: MAX_PENDING_FILES + 2 }, (_, i) => file(`p${i}.png`));
    const result = addPendingFiles(key, [big, ...many]);
    expect(result.tooLarge.map((f) => f.name)).toEqual(["big.mov"]);
    expect(result.overLimit).toBe(2);
    expect(pendingFiles(key)).toHaveLength(MAX_PENDING_FILES);
    takePendingFiles(key).done();
  });
});

describe("pasting", () => {
  it("keeps the text when an office app adds a picture of it", async () => {
    const { pastesAsText } = await import("@/components/xenaxio/chat/composer");
    const png = file("image.png");
    expect(pastesAsText(["text/plain", "text/html", "Files"], [png])).toBe(true);
    expect(pastesAsText(["Files"], [png])).toBe(false);
    expect(pastesAsText(["text/html", "Files"], [png])).toBe(false);
    expect(pastesAsText(["text/plain", "text/html", "Files"], [file("a.pdf", "application/pdf")])).toBe(false);
  });
});
