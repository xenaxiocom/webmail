// Xenaxio step 116: a link to a file or folder in Files that opens for its
// owner and for colleagues it is shared with.
//
// A path link (`/files/<folder>?preview=<name>`) names a place in the viewer's
// own drive, so a colleague opening it lands in their own folder. This link
// names the node by id in its owner's account instead; whoever opens it finds
// the node in their own files or under "Shared with me".
import type { FileNode } from "@/lib/jmap/types";
import { buildFileNodePath } from "@/lib/deep-links";

/** What a link names: a node id in its owner's account. */
export interface FileLinkTarget {
  id: string;
  account?: string;
}

/**
 * The link target of a listed resource. A colleague's node is listed as
 * "<account>:<id>"; an own node by its bare id, in the viewer's files account.
 */
export function fileLinkTarget(
  resource: { id: string; ownerAccountId?: string; isShared?: boolean },
  filesAccountId: string | null | undefined,
): FileLinkTarget {
  const owner = resource.ownerAccountId;
  if (resource.isShared && owner && resource.id.startsWith(`${owner}:`)) {
    return { id: resource.id.slice(owner.length + 1), account: owner };
  }
  return { id: resource.id, account: filesAccountId || undefined };
}

/** The app-relative link "Copy link" puts on the clipboard. */
export function fileLinkPath(target: FileLinkTarget): string {
  return buildFileNodePath(target.id, target.account);
}

/**
 * The id the file store uses for a linked node: the bare id in the viewer's
 * own account, "<account>:<id>" in a colleague's.
 */
export function localNodeId(target: FileLinkTarget, filesAccountId: string | null | undefined): string {
  if (!target.account || target.account === filesAccountId) return target.id;
  return `${target.account}:${target.id}`;
}

export type LinkedNode =
  | { kind: "missing" }
  | { kind: "folder"; node: FileNode }
  /** A file in a folder the viewer can open: it opens there. */
  | { kind: "file"; node: FileNode }
  /** A file shared on its own, without its folder: it opens by itself. */
  | { kind: "loose-file"; node: FileNode };

/**
 * Finds the linked node among everything the viewer can see (own files and
 * colleagues' shared ones, as listAllFileNodesAcrossAccounts lists them).
 * "missing" covers a deleted node and one the viewer has no access to: the
 * server does not tell them apart.
 */
export function findLinkedNode(nodes: FileNode[], localId: string): LinkedNode {
  const node = nodes.find((n) => n.id === localId);
  if (!node) return { kind: "missing" };
  // Folders have no blob (as the file store tells them apart).
  if (node.blobId == null) return { kind: "folder", node };
  // A colleague's file whose folder the viewer cannot see was shared on its own.
  if (node.isShared && (node.parentId == null || !nodes.some((n) => n.id === node.parentId))) {
    return { kind: "loose-file", node };
  }
  return { kind: "file", node };
}
