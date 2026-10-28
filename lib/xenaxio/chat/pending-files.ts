// xenaxio, step 62: files waiting in the chat composer until "send" (pasted,
// picked with the paperclip or dropped on the channel), per channel and thread,
// for this page load, like the text drafts.
import { useSyncExternalStore } from "react";

export const MAX_PENDING_FILES = 10;
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

export interface PendingFile {
  id: string;
  file: File;
  /** Local preview of a picture (object URL). */
  preview?: string;
}

/** The composer's key: the channel, and the thread if it is the thread's composer. */
export function composerKey(roomId: string, threadRoot?: string): string {
  return `${roomId}|${threadRoot ?? ""}`;
}

const EMPTY: PendingFile[] = [];
const byKey = new Map<string, PendingFile[]>();
const listeners = new Set<() => void>();
let counter = 0;

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function pendingFiles(key: string): PendingFile[] {
  return byKey.get(key) ?? EMPTY;
}

export function usePendingFiles(key: string): PendingFile[] {
  return useSyncExternalStore(
    subscribe,
    () => pendingFiles(key),
    () => EMPTY,
  );
}

/** A pasted screenshot comes as "image.png"; give it a name worth keeping. */
function named(file: File): File {
  if (file.name && file.name !== "image.png") return file;
  const ext = (file.type.split("/")[1] ?? "png").replace(/[^a-z0-9]/gi, "") || "png";
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  return new File([file], `screenshot-${stamp}.${ext}`, { type: file.type, lastModified: file.lastModified });
}

/**
 * Adds files to a composer. Returns what was refused: files over 100 MB, and
 * those beyond the limit of files in one message.
 */
export function addPendingFiles(key: string, files: File[]): { tooLarge: File[]; overLimit: number } {
  const current = pendingFiles(key);
  const tooLarge: File[] = [];
  const added: PendingFile[] = [];
  let overLimit = 0;
  for (const raw of files) {
    if (raw.size > MAX_FILE_BYTES) {
      tooLarge.push(raw);
      continue;
    }
    if (current.length + added.length >= MAX_PENDING_FILES) {
      overLimit++;
      continue;
    }
    const file = named(raw);
    const preview = file.type.startsWith("image/") && typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : undefined;
    added.push({ id: `f${++counter}`, file, ...(preview ? { preview } : {}) });
  }
  if (added.length) {
    byKey.set(key, [...current, ...added]);
    emit();
  }
  return { tooLarge, overLimit };
}

function release(list: PendingFile[]) {
  for (const p of list) if (p.preview) URL.revokeObjectURL(p.preview);
}

export function removePendingFile(key: string, id: string): void {
  const current = pendingFiles(key);
  const gone = current.filter((p) => p.id === id);
  if (!gone.length) return;
  release(gone);
  const rest = current.filter((p) => p.id !== id);
  if (rest.length) byKey.set(key, rest);
  else byKey.delete(key);
  emit();
}

/** Takes all files out of the composer to send them (previews stay valid until `release`). */
export function takePendingFiles(key: string): { files: File[]; done: () => void } {
  const list = pendingFiles(key);
  byKey.delete(key);
  if (list.length) emit();
  return { files: list.map((p) => p.file), done: () => release(list) };
}
