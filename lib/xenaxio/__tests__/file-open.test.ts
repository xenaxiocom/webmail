import { describe, expect, it, vi } from "vitest";
import { fileOpenKind, linkedFileState, revealRecentFile, type RevealRecentDeps } from "../file-open";

const office = (name: string) => /\.(docx|xlsx|pptx)$/.test(name);

describe("fileOpenKind", () => {
  it("opens an Office document in the editor when the editor can take it", () => {
    expect(fileOpenKind("Bericht.docx", office)).toBe("edit");
  });

  it("selects an Office document when no editor is set up", () => {
    expect(fileOpenKind("Bericht.docx", () => false)).toBe("select");
  });

  it("opens images, PDFs and text in the preview", () => {
    expect(fileOpenKind("photo.png", office)).toBe("image");
    expect(fileOpenKind("Vertrag.pdf", office)).toBe("preview");
    expect(fileOpenKind("notes.txt", office)).toBe("preview");
  });

  it("only selects a file the app cannot show", () => {
    expect(fileOpenKind("archive.zip", office)).toBe("select");
  });
});

describe("linkedFileState", () => {
  it("waits while the listing has the file", () => {
    expect(linkedFileState("a.zip", { resources: [{ name: "a.zip" }], error: null })).toBe("wait");
  });

  it("reports a file the listed folder lacks", () => {
    expect(linkedFileState("a.zip", { resources: [{ name: "b.zip" }], error: null })).toBe("missing");
  });

  it("drops the link quietly when the listing failed", () => {
    expect(linkedFileState("a.zip", { resources: [], error: "Failed to list directory" })).toBe("drop");
  });
});

describe("revealRecentFile", () => {
  function deps(revealNode: RevealRecentDeps["revealNode"]) {
    return {
      revealNode,
      recentFiles: [{ id: "n1", name: "Angebot.docx" }],
      removeRecentFile: vi.fn(),
      showError: vi.fn(),
      notFoundTitle: "This file is no longer available.",
      loadFailedTitle: "Couldn't load files.",
    };
  }

  it("returns the name of a file that is still there", async () => {
    const d = deps(async () => "Angebot.docx");
    expect(await revealRecentFile("n1", d)).toBe("Angebot.docx");
    expect(d.showError).not.toHaveBeenCalled();
    expect(d.removeRecentFile).not.toHaveBeenCalled();
  });

  it("names a file that is gone and drops it from the recent list", async () => {
    const d = deps(async () => null);
    expect(await revealRecentFile("n1", d)).toBeNull();
    expect(d.showError).toHaveBeenCalledWith("This file is no longer available.", "Angebot.docx");
    expect(d.removeRecentFile).toHaveBeenCalledWith("n1");
  });

  it("says the files could not be loaded when the listing fails, and keeps the entry", async () => {
    const d = deps(async () => { throw new Error("network"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await revealRecentFile("n1", d)).toBeNull();
    expect(d.showError).toHaveBeenCalledWith("Couldn't load files.");
    expect(d.removeRecentFile).not.toHaveBeenCalled();
  });
});
