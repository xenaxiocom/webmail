// xenaxio (step 114): the Details panel's width changes with a divider and is kept in the settings (on the server).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { FileBrowser } from '../file-browser';
import { useFileStore, type FileResource } from '@/stores/file-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { IJMAPClient } from '@/lib/jmap/client-interface';
import type { FileNode } from '@/lib/jmap/types';

vi.mock('@/lib/debug', () => ({ debug: { log: () => {}, warn: () => {}, error: () => {} } }));
vi.mock('@/components/settings/share-collection-dialog', () => ({ ShareCollectionDialog: () => null }));

let wide = true;

function node(id: string, name: string, parentId: string | null, extra: Partial<FileNode> = {}): FileNode {
  return {
    id,
    name,
    parentId,
    type: 'd',
    blobId: null,
    size: 0,
    created: '2026-10-01T00:00:00Z',
    modified: '2026-10-01T00:00:00Z',
    ...extra,
  };
}

function resource(n: FileNode): FileResource {
  return {
    id: n.id,
    name: n.name,
    serverName: n.name,
    isDirectory: n.blobId == null,
    contentType: n.blobId == null ? '' : n.type,
    contentLength: n.size,
    lastModified: n.modified ?? '',
    blobId: n.blobId,
    parentId: n.parentId,
    shareWith: n.shareWith,
    isShared: n.isShared,
    ownerName: n.accountName,
  } as FileResource;
}

const OWN: FileNode[] = [
  node('f-docs', 'Documents', null),
  node('f-notes', 'notes.txt', null, { blobId: 'b-notes', type: 'text/plain', size: 10 }),
];
const SHARED = node('e:f-team', 'Team', null, { isShared: true, accountId: 'e', accountName: 'userb@example.org' });

type Overrides = Partial<React.ComponentProps<typeof FileBrowser>>;

function renderBrowser(opts: { resources?: FileResource[]; allFolders?: FileResource[]; props?: Overrides; hasListed?: boolean } = {}) {
  const client = {
    listAllFileNodesAcrossAccounts: vi.fn(async () => [...OWN, SHARED]),
  } as unknown as IJMAPClient;
  act(() => {
    useFileStore.setState({
      client,
      sharedRoots: [],
      allFolders: opts.allFolders ?? OWN.filter((n) => n.blobId == null).map(resource),
      currentParentId: null,
      pathStack: [{ id: null, name: '' }],
      hasListed: opts.hasListed ?? true,
    });
  });
  const handlers = {
    onNavigate: vi.fn(),
    onSetSelection: vi.fn(),
    onToggleSelect: vi.fn(),
    onPreviewFile: vi.fn(),
    onDownload: vi.fn(async () => {}),
    onRenameNode: vi.fn(async () => {}),
    onDeleteNode: vi.fn(async () => {}),
    onDownloadNode: vi.fn(async () => {}),
    onRevealNode: vi.fn(async () => {}),
    onRemoveRecent: vi.fn(),
  };
  const noop = vi.fn(async () => {});
  render(
    <FileBrowser
      currentPath="/"
      resources={opts.resources ?? OWN.map(resource)}
      isLoading={false}
      error={null}
      selectedResources={new Set()}
      uploadProgress={null}
      clipboard={null}
      onCreateFolder={noop}
      onUploadFiles={noop}
      onUploadFolder={noop}
      onCancelUpload={vi.fn()}
      onDelete={noop}
      onBatchDelete={noop}
      onRename={noop}
      onBatchDownload={noop}
      onRefresh={noop}
      onClearSelection={vi.fn()}
      onCut={vi.fn()}
      onCopy={vi.fn()}
      onPaste={noop}
      onMoveTo={noop}
      onPreviewImage={vi.fn()}
      onCreateTextFile={noop}
      onDuplicate={noop}
      getImageUrl={async () => ''}
      favorites={[]}
      recentFiles={[]}
      onToggleFavorite={vi.fn()}
      onOpenRecent={vi.fn()}
      client={client}
      ownAccountId="a"
      sharingEnabled
      onShare={noop}
      {...handlers}
      {...opts.props}
    />,
  );
  return handlers;
}

describe('Files: width of the Details panel (step 114)', () => {
  beforeEach(() => {
    wide = true;
    localStorage.setItem('files-show-details', '1');
    act(() => useSettingsStore.setState({ filesDetailsWidth: null }));
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({ matches: /min-width/.test(query) ? wide : false, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false }) as MediaQueryList);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1000, height: 800, x: 0, y: 0, top: 0, left: 0, right: 1000, bottom: 800, toJSON: () => ({}) } as DOMRect);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('opens half and half, or at the saved width; the divider saves it in the settings', () => {
    renderBrowser();
    const panel = () => document.querySelector('[data-details-width]') as HTMLElement;
    expect(panel().style.width).toBe('50%');
    const divider = screen.getByTestId('files-details-resize');
    // The divider to the left: the panel gets wider.
    fireEvent.pointerDown(divider, { button: 0, pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 300, buttons: 1 });
    expect(panel().getAttribute('data-details-width')).toBe('70');
    fireEvent.pointerUp(document, { pointerId: 1, clientX: 300 });
    expect(useSettingsStore.getState().filesDetailsWidth).toBe(70);
    expect(panel().style.width).toBe('70%');
    fireEvent.doubleClick(divider);
    expect(useSettingsStore.getState().filesDetailsWidth).toBeNull();
    expect(panel().style.width).toBe('50%');
  });

  it('keeps an imported width only within 20–80 %', () => {
    const { importSettings } = useSettingsStore.getState();
    importSettings(JSON.stringify({ filesDetailsWidth: 35 }));
    expect(useSettingsStore.getState().filesDetailsWidth).toBe(35);
    importSettings(JSON.stringify({ filesDetailsWidth: 95 }));
    expect(useSettingsStore.getState().filesDetailsWidth).toBe(35);
    importSettings(JSON.stringify({ filesDetailsWidth: 'wide' }));
    expect(useSettingsStore.getState().filesDetailsWidth).toBe(35);
    expect(JSON.parse(useSettingsStore.getState().exportSettings()).filesDetailsWidth).toBe(35);
  });

  it('below 1024 px the panel lies over the files as before, without a divider', () => {
    wide = false;
    renderBrowser();
    expect(screen.queryByTestId('files-details-resize')).toBeNull();
    expect(document.querySelector('[data-details-width]')).toBeNull();
  });
});
