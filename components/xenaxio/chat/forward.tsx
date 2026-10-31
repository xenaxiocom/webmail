"use client";

// Step 99, part E: forward a message to another channel or direct message,
// with a note, as Slack's "Share message". Text goes as a card with the quote
// and a link to the original; a file or picture goes along itself.
import { IconCornerUpRight, IconHash, IconLock, IconMessages, IconSearch } from "@tabler/icons-react";
import { useLocale } from "next-intl";
import { useState } from "react";
import type { ChatClient, Message, Room } from "@/lib/xenaxio/chat/client";
import { forwardContent, type Forwarded } from "@/lib/xenaxio/chat/format";
import { useChatStore } from "@/lib/xenaxio/chat/store";
import { useXT } from "@/lib/xenaxio/i18n";
import { toast } from "@/stores/toast-store";
import { cn } from "@/lib/utils";
import { messageLink, useChatTime, useDisplayName } from "./common";
import { Modal } from "./dialogs";

export function ForwardDialog({ client, room, message, onClose }: { client: ChatClient; room: Room; message: Message; onClose: () => void }) {
  const t = useXT();
  const locale = useLocale();
  const nameOf = useDisplayName();
  const setView = useChatStore((s) => s.setView);
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const q = query.trim().toLowerCase();
  const rooms = [...client.rooms.values()]
    .filter((r) => r.membership === "join" && r.kind !== "space" && !r.archived && client.can(r, "send"))
    .filter((r) => !q || client.roomName(r).toLowerCase().includes(q))
    .sort((a, b) => b.lastTs - a.lastTs)
    .slice(0, 50);
  const send = async () => {
    if (!target || busy) return;
    setBusy(true);
    try {
      const source: Forwarded = {
        roomId: room.id,
        eventId: message.id,
        sender: message.sender,
        senderName: nameOf(message.sender),
        roomName: room.kind === "channel" ? client.roomName(room) : null,
        ts: message.ts,
        link: messageLink(locale, room.id, message.id),
      };
      await client.send(target, forwardContent(message.content, source, note, t("chat.forwarded")));
      toast.success(t("chat.forward_sent"));
      onClose();
      setView({ kind: "room", roomId: target });
    } catch {
      toast.error(t("chat.error"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={t("chat.forward_title")} onClose={onClose} wide>
      <label className="flex h-9 items-center gap-1.5 rounded-md border border-input px-2 focus-within:ring-2 focus-within:ring-ring">
        <IconSearch size={15} className="text-muted-foreground" />
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("chat.forward_search")} aria-label={t("chat.forward_search")} className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none" />
      </label>
      <ul role="listbox" aria-label={t("chat.forward_where")} className="mt-2 max-h-56 overflow-y-auto">
        {rooms.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              role="option"
              aria-selected={target === r.id}
              onClick={() => setTarget(r.id)}
              className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm", target === r.id ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
            >
              {r.kind === "dm" ? <IconMessages size={15} /> : r.joinRule === "public" ? <IconHash size={15} /> : <IconLock size={15} />}
              <span className="truncate">{client.roomName(r)}</span>
            </button>
          </li>
        ))}
      </ul>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={4000} placeholder={t("chat.forward_note")} aria-label={t("chat.forward_note")} className="mt-3 w-full resize-none rounded-md border border-input bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-9 rounded-md px-3 text-sm hover:bg-accent">
          {t("chat.cancel")}
        </button>
        <button type="button" disabled={!target || busy} onClick={() => void send()} className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">
          <IconCornerUpRight size={15} />
          {t("chat.forward_send")}
        </button>
      </div>
    </Modal>
  );
}

/** The card above a forwarded message: who wrote it, where and when, and a link to the original. */
export function ForwardedFrom({ source }: { source: Forwarded }) {
  const t = useXT();
  const { full } = useChatTime();
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground" data-testid="chat-forwarded">
      <IconCornerUpRight size={13} />
      <span>{t("chat.forwarded_from", { name: source.senderName })}</span>
      {source.roomName && <span>· #{source.roomName}</span>}
      <span>· {full(source.ts)}</span>
      <a href={source.link} className="text-primary hover:underline">
        {t("chat.forward_open")}
      </a>
    </div>
  );
}
