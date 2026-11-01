import { describe, expect, it } from "vitest";
import { buildFileNodePath, parseFilesPath } from "@/lib/deep-links";
import { fileLinkPath, fileLinkTarget, findLinkedNode, localNodeId } from "@/lib/xenaxio/file-link";
import type { FileNode } from "@/lib/jmap/types";

// Xenaxio step 116: links to files by id, which open for the owner and for
// colleagues the file is shared with.

function node(id: string, parentId: string | null, extra: Partial<FileNode> = {}): FileNode {
  return { id, name: id, parentId, type: "d", blobId: null, size: 0, created: "", modified: "", ...extra };
}

describe("file links (step 116)", () => {
  it("names an own node by id in the own account and a colleague's by its bare id in theirs", () => {
    expect(fileLinkTarget({ id: "n1" }, "acc-me")).toEqual({ id: "n1", account: "acc-me" });
    expect(fileLinkTarget({ id: "acc-anna:n7", ownerAccountId: "acc-anna", isShared: true }, "acc-me")).toEqual({ id: "n7", account: "acc-anna" });
    expect(fileLinkPath({ id: "n7", account: "acc-anna" })).toBe("/files?node=n7&account=acc-anna");
  });

  it("parses the link back and keeps path links working", () => {
    const link = parseFilesPath([], new URLSearchParams(buildFileNodePath("n 7", "acc-anna").split("?")[1]));
    expect(link).toEqual({ path: "/", node: { id: "n 7", account: "acc-anna" } });
    expect(parseFilesPath([], new URLSearchParams("node=n1"))?.node).toEqual({ id: "n1", account: undefined });
    expect(parseFilesPath(["Docs"], new URLSearchParams("preview=a.txt"))).toEqual({ path: "/Docs", preview: "a.txt" });
    expect(parseFilesPath([], new URLSearchParams(""))).toBeNull();
  });

  it("finds the node where the viewer's file store lists it", () => {
    // The owner opens their own link; a colleague opens it under "Shared with me".
    expect(localNodeId({ id: "n7", account: "acc-anna" }, "acc-anna")).toBe("n7");
    expect(localNodeId({ id: "n7", account: "acc-anna" }, "acc-me")).toBe("acc-anna:n7");
    expect(localNodeId({ id: "n7" }, "acc-me")).toBe("n7");
  });

  it("tells folders, files in a visible folder, files shared on their own and missing nodes apart", () => {
    const nodes = [
      node("d1", null),
      node("f1", "d1", { blobId: "b1", type: "text/plain" }),
      node("f0", null, { blobId: "b0", type: "text/plain" }),
      node("acc-anna:d", "acc-anna:hidden", { isShared: true, accountId: "acc-anna" }),
      node("acc-anna:x", "acc-anna:d", { blobId: "bx", type: "text/plain", isShared: true, accountId: "acc-anna" }),
      node("acc-anna:loose", "acc-anna:hidden", { blobId: "bl", type: "text/plain", isShared: true, accountId: "acc-anna" }),
    ];
    expect(findLinkedNode(nodes, "d1").kind).toBe("folder");
    expect(findLinkedNode(nodes, "f1").kind).toBe("file");
    expect(findLinkedNode(nodes, "f0").kind).toBe("file");
    expect(findLinkedNode(nodes, "acc-anna:d").kind).toBe("folder");
    expect(findLinkedNode(nodes, "acc-anna:x").kind).toBe("file");
    expect(findLinkedNode(nodes, "acc-anna:loose").kind).toBe("loose-file");
    expect(findLinkedNode(nodes, "gone").kind).toBe("missing");
  });
});
