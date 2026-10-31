"use client";

// Step 99, part H: what Rooms took from Slack and Discord around a channel —
// bookmarks under the name, the canvas (a page of notes), the voice channel's
// bar, forums (posts with a title and tags; replies are the thread) and
// "Catch up" (unread channels one after another).
import { IconBookmark, IconHeadphones, IconNotes, IconPlus, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { BOOKMARKS_TYPE, CANVAS_TYPE, POST_FIELD, postOf, postText, useChatExtras } from "@/lib/xenaxio/chat/extras";
import type { ChatClient, Message, Room } from "@/lib/xenaxio/chat/client";
import { messageHtml, plainPreview, toHtml } from "@/lib/xenaxio/chat/format";
import { useChatStore } from "@/lib/xenaxio/chat/store";
import { useXT } from "@/lib/xenaxio/i18n";
import { toast } from "@/stores/toast-store";
import { cn } from "@/lib/utils";
import { useJoinRoomCall } from "@/components/xenaxio/meet/call";
import { useChatTime, useDisplayName } from "./common";
import { RichHtml } from "./code";
import { useChatDialogs } from "./dialogs";
import { PanelFrame } from "./side-panels";
import { PostDialog } from "./post-dialog";
import { SidebarExpandButton } from "./sidebar-toggle";

/** Links under the channel's name; whoever may edit adds and removes them. */
export function BookmarksBar({ client, room }: { client: ChatClient; room: Room }) {
  const t = useXT();
  const { prompt } = useChatDialogs();
  const can = client.canSetState(room, BOOKMARKS_TYPE) && !room.archived;
  if (!room.bookmarks.length && !can) return null;
  const add = async () => {
    const url = (await prompt({ title: t("chat.bookmark_add"), message: t("chat.bookmark_url"), defaultValue: "https://", confirmText: t("chat.bookmark_next") }))?.trim();
    if (!url || !/^https:\/\/[^\s<>"']+$/.test(url)) return;
    const title = (await prompt({ title: t("chat.bookmark_add"), message: t("chat.bookmark_title"), defaultValue: "", confirmText: t("chat.bookmark_add") }))?.trim() ?? "";
    await client.setBookmarks(room.id, [...room.bookmarks, { title: title || url.replace(/^https:\/\//, ""), url }]).catch(() => toast.error(t("chat.error")));
  };
  return (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-4 py-1 text-xs" aria-label={t("chat.bookmarks")}>
      <IconBookmark size={13} className="shrink-0 text-muted-foreground" />
      {room.bookmarks.map((b, i) => (
        <span key={`${b.url}-${i}`} className="group/bm flex shrink-0 items-center rounded hover:bg-accent">
          <a href={b.url} target="_blank" rel="noopener noreferrer nofollow" className="max-w-48 truncate px-1.5 py-0.5">
            {b.title}
          </a>
          {can && (
            <button
              type="button"
              aria-label={t("chat.bookmark_remove", { name: b.title })}
              onClick={() => void client.setBookmarks(room.id, room.bookmarks.filter((_, j) => j !== i)).catch(() => toast.error(t("chat.error")))}
              className="hidden rounded p-0.5 text-muted-foreground hover:text-foreground group-hover/bm:block"
            >
              <IconX size={11} />
            </button>
          )}
        </span>
      ))}
      {can && room.bookmarks.length < 20 && (
        <button type="button" onClick={() => void add()} className="flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent">
          <IconPlus size={12} />
          {t("chat.bookmark_add")}
        </button>
      )}
    </div>
  );
}

/** The channel's canvas in the side panel: read, and edit for those who may. */
export function CanvasPanel({ client, roomId }: { client: ChatClient; roomId: string }) {
  const t = useXT();
  const name = useDisplayName();
  const { relative } = useChatTime();
  const room = client.rooms.get(roomId);
  const [draft, setDraft] = useState<string | null>(null);
  if (!room) return null;
  const can = client.canSetState(room, CANVAS_TYPE) && !room.archived;
  const save = async () => {
    try {
      await client.setCanvas(room.id, draft ?? "");
      setDraft(null);
    } catch {
      toast.error(t("chat.error"));
    }
  };
  const html = room.canvas ? (toHtml(room.canvas.text) ?? messageHtml({ body: room.canvas.text })) : "";
  return (
    <PanelFrame
      title={t("chat.canvas")}
      subtitle={client.roomName(room)}
      actions={
        can && draft === null ? (
          <button type="button" onClick={() => setDraft(room.canvas?.text ?? "")} className="h-8 rounded-md px-2 text-xs font-medium hover:bg-accent">
            {t("chat.details_edit")}
          </button>
        ) : null
      }
    >
      <div className="flex-1 overflow-y-auto p-4">
        {draft !== null ? (
          <>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={18} maxLength={50_000} aria-label={t("chat.canvas")} className="w-full resize-y rounded-md border border-input bg-transparent p-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <p className="mt-1 text-xs text-muted-foreground">{t("chat.canvas_hint")}</p>
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setDraft(null)} className="h-8 rounded-md px-3 text-sm hover:bg-accent">
                {t("chat.cancel")}
              </button>
              <button type="button" onClick={() => void save()} className="h-8 rounded-md bg-primary px-3 text-sm text-primary-foreground">
                {t("chat.save_edit")}
              </button>
            </div>
          </>
        ) : room.canvas ? (
          <>
            <div className="text-sm leading-relaxed [&_blockquote]:border-l-4 [&_blockquote]:pl-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
              <RichHtml html={messageHtml({ body: room.canvas.text, format: "org.matrix.custom.html", formatted_body: html })} />
            </div>
            <p className="mt-4 text-xs text-muted-foreground">{t("chat.canvas_by", { name: name(room.canvas.by), time: relative(room.canvas.ts) })}</p>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">
            <IconNotes size={28} className="mb-2" />
            <p>{t("chat.canvas_empty")}</p>
          </div>
        )}
      </div>
    </PanelFrame>
  );
}

/** A voice channel: who is in it and "join", as in Discord. */
export function VoiceBar({ client, room }: { client: ChatClient; room: Room }) {
  const t = useXT();
  const count = useChatExtras((s) => s.calls.get(room.id) ?? 0);
  const join = useJoinRoomCall(client);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border bg-emerald-500/5 px-4 py-2 text-sm">
      <IconHeadphones size={18} className="text-emerald-600" />
      <span className="flex-1">{count > 0 ? t("chat.voice_in", { count }) : t("chat.voice_empty")}</span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await join(room);
          } catch {
            toast.error(t("chat.error"));
          } finally {
            setBusy(false);
          }
        }}
        className="h-8 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {t("chat.voice_join")}
      </button>
    </div>
  );
}

/** A forum: posts with a title and tags, newest activity first; a click opens the thread. */
export function ForumView({ client, room }: { client: ChatClient; room: Room }) {
  const t = useXT();
  const name = useDisplayName();
  const { relative } = useChatTime();
  const setPanel = useChatStore((s) => s.setPanel);
  const [tag, setTag] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const posts = room.timeline
    .map((m) => ({ m, post: postOf(m.content) }))
    .filter((x): x is { m: Message; post: NonNullable<ReturnType<typeof postOf>> } => !!x.post && !x.m.redacted)
    .filter((x) => !tag || x.post.tags.includes(tag))
    .sort((a, b) => Math.max(b.m.ts, b.m.thread?.latestTs ?? 0) - Math.max(a.m.ts, a.m.thread?.latestTs ?? 0));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-4 py-2">
        <button type="button" onClick={() => setTag(null)} className={cn("rounded-full px-2.5 py-0.5 text-xs", !tag ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent")}>
          {t("chat.forum_all")}
        </button>
        {(room.forum?.tags ?? []).map((x) => (
          <button key={x} type="button" onClick={() => setTag(x)} className={cn("rounded-full px-2.5 py-0.5 text-xs", tag === x ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent")}>
            {x}
          </button>
        ))}
        <span className="flex-1" />
        {client.can(room, "send") && (
          <button type="button" onClick={() => setWriting(true)} className="flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-sm text-primary-foreground">
            <IconPlus size={14} />
            {t("chat.forum_new")}
          </button>
        )}
      </div>
      <ul className="flex-1 overflow-y-auto">
        {posts.length === 0 && <li className="p-5 text-sm text-muted-foreground">{t("chat.forum_empty")}</li>}
        {posts.map(({ m, post }) => (
          <li key={m.id}>
            <button type="button" onClick={() => setPanel({ kind: "thread", roomId: room.id, rootId: m.id })} className="block w-full border-b border-border px-5 py-3 text-left hover:bg-muted/40">
              <span className="block font-semibold">{post.title}</span>
              <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{plainPreview({ ...m.content, body: postText(m.content), [POST_FIELD]: undefined }, 200)}</span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {post.tags.map((x) => (
                  <span key={x} className="rounded-full bg-muted px-2 py-0.5">
                    {x}
                  </span>
                ))}
                <span>
                  {name(m.sender)} · {t("chat.forum_replies", { count: m.thread?.count ?? 0 })} · {relative(Math.max(m.ts, m.thread?.latestTs ?? 0))}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {writing && <PostDialog client={client} room={room} onClose={() => setWriting(false)} />}
    </div>
  );
}

/** "Catch up" (Slack): unread channels one after another — read and next, open, or skip. */
export function CatchUpView({ client }: { client: ChatClient }) {
  const t = useXT();
  const name = useDisplayName();
  const setView = useChatStore((s) => s.setView);
  const [skipped, setSkipped] = useState<string[]>([]);
  const queue = [...client.rooms.values()].filter((r) => r.membership === "join" && r.kind !== "space" && client.isUnread(r) && !skipped.includes(r.id)).sort((a, b) => b.highlights - a.highlights || b.lastTs - a.lastTs);
  const room = queue[0];
  if (!room)
    return (
      <div className="relative flex flex-1 flex-col items-center justify-center p-6 text-center">
        <SidebarExpandButton className="absolute left-3 top-3" />
        <p className="text-lg font-semibold">{t("chat.catchup_done")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("chat.catchup_done_text")}</p>
      </div>
    );
  const readIdx = room.readUpTo ? room.timeline.findIndex((m) => m.id === room.readUpTo) : -1;
  const unread = room.timeline.slice(readIdx + 1).filter((m) => m.type === "m.room.message" && !m.redacted && m.sender !== client.userId).slice(-8);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-5">
        <SidebarExpandButton className="-ml-2" />
        <span className="text-base font-bold">{t("chat.catchup")}</span>
        <span className="text-sm text-muted-foreground">{t("chat.catchup_left", { count: queue.length })}</span>
      </header>
      <div className="flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-2xl rounded-lg border border-border">
          <div className="border-b border-border px-4 py-2 font-semibold">
            {room.kind === "dm" ? "" : "#"}
            {client.roomName(room)}
          </div>
          <ul className="divide-y divide-border">
            {unread.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">{t("chat.catchup_marked")}</li>}
            {unread.map((m) => (
              <li key={m.id} className="px-4 py-2 text-sm">
                <span className="font-semibold">{name(m.sender)}</span>
                <div className="break-words">
                  <RichHtml html={messageHtml(m.content)} />
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap justify-end gap-2 border-t border-border p-3">
            <button type="button" onClick={() => setSkipped([...skipped, room.id])} className="h-9 rounded-md px-3 text-sm hover:bg-accent">
              {t("chat.catchup_skip")}
            </button>
            <button type="button" onClick={() => setView({ kind: "room", roomId: room.id })} className="h-9 rounded-md border border-border px-3 text-sm hover:bg-accent">
              {t("chat.catchup_open")}
            </button>
            <button
              type="button"
              onClick={() => {
                room.keepUnread = false;
                void client.markRead(room.id).catch(() => toast.error(t("chat.error")));
              }}
              className="h-9 rounded-md bg-primary px-4 text-sm text-primary-foreground"
            >
              {t("chat.catchup_next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
