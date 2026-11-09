import type { FileNode } from './types';

/**
 * Xenaxio step 149: Stalwart 1.x implements JMAP File Storage draft 18 and
 * later, which names a node's kind `@type` ("File", "Directory", "SymLink")
 * and its media type `mediaType`. 0.16 calls them `nodeType` and `type`. Each
 * server leaves the other's names out of FileNode/get but refuses them in a
 * create. Same approach as Bulwark upstream (lib/jmap/filenode-kind.ts).
 */
export type FileNodeKind = 'file' | 'directory' | 'symlink';

const DRAFT_NODE_TYPES: Record<string, FileNodeKind> = { File: 'file', Directory: 'directory', SymLink: 'symlink' };

type DraftFileNode = { '@type'?: unknown; mediaType?: unknown };

/** A node of either draft, with the kind in `nodeType` and the media type in `type`. */
export function fromDraftFileNode<T extends Partial<FileNode>>(node: T & DraftFileNode): T {
  const kind = typeof node['@type'] === 'string' ? DRAFT_NODE_TYPES[node['@type']] : undefined;
  const mediaType = typeof node.mediaType === 'string' ? node.mediaType : undefined;
  if (!kind && mediaType === undefined) return node;
  return {
    ...node,
    ...(kind && !node.nodeType ? { nodeType: kind } : {}),
    ...(mediaType !== undefined && node.type == null ? { type: mediaType } : {}),
  };
}

/** The properties of a FileNode/set create in the newer draft, from 0.16 ones (no blob: a folder). */
export function toDraftFileNodeCreate(props: Record<string, unknown>): Record<string, unknown> {
  const { type, nodeType: _kind, ...rest } = props;
  return rest.blobId == null
    ? { '@type': 'Directory', ...rest }
    : { '@type': 'File', ...rest, ...(typeof type === 'string' ? { mediaType: type } : {}) };
}
