import { describe, expect, it } from 'vitest';
import { fromDraftFileNode, toDraftFileNodeCreate } from '../filenode-kind';

describe('FileNode in both File Storage drafts (Xenaxio step 149)', () => {
  it('reads Stalwart 1.x nodes with the 0.16 names', () => {
    expect(fromDraftFileNode({ id: 'd', name: 'A', '@type': 'Directory', blobId: null } as never)).toMatchObject({ nodeType: 'directory' });
    expect(fromDraftFileNode({ id: 'f', name: 'a.txt', '@type': 'File', mediaType: 'text/plain', blobId: 'b' } as never)).toMatchObject({ nodeType: 'file', type: 'text/plain' });
    const old = { id: 'o', name: 'x', type: 'image/png', blobId: 'b' };
    expect(fromDraftFileNode(old as never)).toBe(old);
  });

  it('writes creates in the newer draft', () => {
    expect(toDraftFileNodeCreate({ name: 'A', parentId: 'p' })).toEqual({ '@type': 'Directory', name: 'A', parentId: 'p' });
    expect(toDraftFileNodeCreate({ name: 'a.txt', blobId: 'b', type: 'text/plain', size: 3 })).toEqual({ '@type': 'File', name: 'a.txt', blobId: 'b', size: 3, mediaType: 'text/plain' });
  });
});
