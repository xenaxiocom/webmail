// Step 99, part H: what Rooms took from Slack and Discord around channels —
// calls going on (the sidebar's sign, voice channels), groups to mention
// (@vertrieb), the company's own emoji, canvas, bookmarks and forums.
import { useEffect } from "react";
import { create } from "zustand";
import { apiFetch, withBasePath } from "@/lib/browser-navigation";
import { setCompanyEmoji } from "./format";

/** Our room state: a voice channel (Discord), a forum (Discord), a canvas and bookmarks (Slack). */
export const VOICE_TYPE = "com.xenaxio.voice";
export const FORUM_TYPE = "com.xenaxio.forum";
export const CANVAS_TYPE = "com.xenaxio.canvas";
export const BOOKMARKS_TYPE = "com.xenaxio.bookmarks";
/** A forum post: a message with a title and tags; its replies are the thread. */
export const POST_FIELD = "com.xenaxio.post";

export interface Bookmark {
  title: string;
  url: string;
}

export interface ChatGroupInfo {
  handle: string;
  name: string;
  addresses: string[];
}

export interface ForumPost {
  title: string;
  tags: string[];
}

/** A forum post of a message; other people's fields are checked. */
export function postOf(content: Record<string, unknown>): ForumPost | null {
  const p = content[POST_FIELD] as { title?: unknown; tags?: unknown } | undefined;
  if (!p || typeof p !== "object" || typeof p.title !== "string" || !p.title.trim()) return null;
  return { title: p.title.trim().slice(0, 200), tags: (Array.isArray(p.tags) ? p.tags : []).filter((t): t is string => typeof t === "string").map((t) => t.slice(0, 40)).slice(0, 5) };
}

/** The body of a post: the title in bold on the first line, then the text (readable in any Matrix client). */
export function postBody(title: string, text: string): string {
  return `**${title.trim()}**${text.trim() ? `\n${text.trim()}` : ""}`;
}

/** Step 105: the text of a post without its bold title line, for the forum list and the edit dialog. */
export function postText(content: Record<string, unknown>): string {
  const body = typeof content.body === "string" ? content.body : "";
  return /^\*\*[^\n]*\*\*(\n|$)/.test(body) ? body.replace(/^\*\*[^\n]*\*\*\n?/, "") : body;
}

/**
 * Step 105: an edit keeps the post's title and tags when the new content has
 * none (an edit from an older client or another Matrix app); before, the post
 * vanished from the forum after an edit.
 */
export function keepPost(next: Record<string, unknown>, previous: Record<string, unknown>): Record<string, unknown> {
  return next[POST_FIELD] === undefined && previous[POST_FIELD] !== undefined ? { ...next, [POST_FIELD]: previous[POST_FIELD] } : next;
}

/** Bookmarks from room state: https links only. */
export function bookmarksOf(content: Record<string, unknown> | undefined): Bookmark[] {
  const items = (content?.items ?? []) as unknown;
  if (!Array.isArray(items)) return [];
  return items
    .filter((b): b is { title?: unknown; url?: unknown } => !!b && typeof b === "object")
    .map((b) => ({ title: typeof b.title === "string" ? b.title.trim().slice(0, 80) : "", url: typeof b.url === "string" ? b.url.trim() : "" }))
    .filter((b) => /^https:\/\/[^\s<>"']+$/.test(b.url))
    .map((b) => ({ ...b, title: b.title || b.url.replace(/^https:\/\//, "").slice(0, 80) }))
    .slice(0, 20);
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  const res = await apiFetch(path, { credentials: "same-origin", headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json", "x-xenaxio-csrf": "1" } : {}) }, ...init });
  return res.ok ? ((await res.json()) as T) : null;
}

interface ExtrasStore {
  /** Room → how many are in its call now. */
  calls: Map<string, number>;
  groups: ChatGroupInfo[];
  emoji: { name: string; updated: number }[];
  loadCalls: (roomIds: string[]) => Promise<void>;
  loadDirectory: () => Promise<void>;
}

export const useChatExtras = create<ExtrasStore>((set) => ({
  calls: new Map(),
  groups: [],
  emoji: [],
  loadCalls: async (roomIds) => {
    if (!roomIds.length) return set({ calls: new Map() });
    const res = await getJson<{ calls: { roomId: string; participants: number }[] }>("/api/chat/rooms/calls", { method: "POST", body: JSON.stringify({ roomIds: roomIds.slice(0, 500) }) });
    if (res) set({ calls: new Map(res.calls.map((c) => [c.roomId, c.participants])) });
  },
  loadDirectory: async () => {
    const [groups, emoji] = await Promise.all([getJson<{ groups: ChatGroupInfo[] }>("/api/chat/groups"), getJson<{ emoji: { name: string; updated: number }[] }>("/api/chat/emoji")]);
    const list = emoji?.emoji ?? [];
    setCompanyEmoji(list.map((e) => ({ name: e.name, url: emojiUrl(e.name, e.updated) })));
    set({ groups: groups?.groups ?? [], emoji: list });
  },
}));

/** Loads groups and emoji with the chat; looks for calls every 30 seconds. */
export function useExtrasLoader(ready: boolean, roomIds: () => string[]) {
  const loadCalls = useChatExtras((s) => s.loadCalls);
  const loadDirectory = useChatExtras((s) => s.loadDirectory);
  useEffect(() => {
    if (!ready) return;
    void loadDirectory().catch(() => undefined);
    const tick = () => void loadCalls(roomIds()).catch(() => undefined);
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roomIds is read on each tick
  }, [ready, loadCalls, loadDirectory]);
}

/** Where a company emoji's picture comes from. */
export function emojiUrl(name: string, updated?: number): string {
  return withBasePath(`/api/chat/emoji/${encodeURIComponent(name)}${updated ? `?v=${updated}` : ""}`);
}
