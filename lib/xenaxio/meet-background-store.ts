// xenaxio step 93: one's own meeting background (a picture, a GIF or video, or
// a panorama) is kept in this browser's IndexedDB: a video does not fit into
// localStorage. Nothing of it goes to the server. Without IndexedDB (private
// windows in some browsers) the file works until the page closes.
import type { BackgroundKind } from "@/lib/xenaxio/meet-background";
import { LEGACY_OWN_KEY } from "@/lib/xenaxio/meet-background";

const DB = "xenaxio-meet";
const STORE = "background";
const KEY = "own";

export interface StoredBackground {
  blob: Blob;
  kind: BackgroundKind;
}

/** As kept: the bytes and their type (a Blob in IndexedDB has failed in some Safari versions). */
interface Kept {
  data: ArrayBuffer;
  type: string;
  kind: BackgroundKind;
}

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  try {
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(STORE, mode);
      const req = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result ?? null);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    });
  } finally {
    db.close();
  }
}

function isRecord(value: unknown): value is Kept {
  const v = value as Kept | null;
  return !!v && typeof v.data?.byteLength === "number" && typeof v.type === "string" && (v.kind === "image" || v.kind === "animation" || v.kind === "panorama");
}

/** A base64 data URL as a Blob, without fetch (CSP connect-src 'self' does not allow data:). */
function dataUrlBlob(dataUrl: string): Blob | null {
  const m = /^data:([^;,]+);base64,(.*)$/.exec(dataUrl);
  if (!m) return null;
  try {
    const bin = atob(m[2]!);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  } catch {
    return null;
  }
}

/** One's own background; step 92's picture in localStorage moves here the first time. */
export async function loadOwnBackground(): Promise<StoredBackground | null> {
  const stored = await run("readonly", (s) => s.get(KEY) as IDBRequest<unknown>);
  if (isRecord(stored)) return { blob: new Blob([stored.data], { type: stored.type }), kind: stored.kind };
  let legacy: string | null = null;
  try {
    legacy = localStorage.getItem(LEGACY_OWN_KEY);
  } catch {
    // No storage.
  }
  if (!legacy?.startsWith("data:image/")) return null;
  const blob = dataUrlBlob(legacy);
  if (!blob) return null;
  if (await saveOwnBackground({ blob, kind: "image" })) {
    try {
      localStorage.removeItem(LEGACY_OWN_KEY);
    } catch {
      // Stays; read again next time.
    }
  }
  return { blob, kind: "image" };
}

/** False when the browser has no room for it (it then works until the page closes). */
export async function saveOwnBackground(value: StoredBackground | null): Promise<boolean> {
  const record: Kept | null = value ? { data: await value.blob.arrayBuffer(), type: value.blob.type, kind: value.kind } : null;
  const done = await run("readwrite", (s) => (record ? s.put(record, KEY) : s.delete(KEY)) as IDBRequest<unknown>);
  if (!value) {
    try {
      localStorage.removeItem(LEGACY_OWN_KEY);
    } catch {
      // Nothing to remove.
    }
  }
  return done !== null || !value;
}
