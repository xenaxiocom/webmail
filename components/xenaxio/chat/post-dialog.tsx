"use client";

// Step 99, part H: a forum post (title, text, tags); step 105: the same dialog edits a post.
import { useState } from "react";
import type { ChatClient, Message, Room } from "@/lib/xenaxio/chat/client";
import { postContent, postOf, postText } from "@/lib/xenaxio/chat/extras";
import { useChatStore } from "@/lib/xenaxio/chat/store";
import { useXT } from "@/lib/xenaxio/i18n";
import { toast } from "@/stores/toast-store";
import { cn } from "@/lib/utils";
import { Modal } from "./dialogs";

/**
 * A new forum post, or (step 105) an edit of one: the title and the text in
 * separate fields, the tags as chips. The title is plain text, never markdown
 * (`postContent`).
 */
export function PostDialog({ client, room, message, onClose }: { client: ChatClient; room: Room; message?: Message; onClose: () => void }) {
  const t = useXT();
  const colleagues = useChatStore((s) => s.colleagues);
  const current = message ? postOf(message.content) : null;
  const [title, setTitle] = useState(current?.title ?? "");
  const [text, setText] = useState(message ? postText(message.content) : "");
  const [tags, setTags] = useState<string[]>(current?.tags ?? []);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const people = [...colleagues.values()].map((c) => ({ userId: c.address, displayName: c.displayName }));
      const content = postContent(title, text, tags, people, client.channelRefs());
      if (message) await client.edit(room.id, message.id, content);
      else await client.send(room.id, content);
      onClose();
    } catch {
      toast.error(t("chat.error"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={t(message ? "chat.forum_edit" : "chat.forum_new")} onClose={onClose} wide>
      <label className="block text-sm font-medium">
        {t("chat.forum_title")}
        <input autoFocus value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring" />
      </label>
      <label className="mt-3 block text-sm font-medium">
        {t("chat.forum_text")}
        <textarea value={text} rows={6} onChange={(e) => setText(e.target.value)} className="mt-1 w-full resize-y rounded-md border border-input bg-transparent p-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring" />
      </label>
      {(room.forum?.tags.length ?? 0) > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={t("chat.forum_tags")}>
          {room.forum!.tags.map((x) => (
            <button
              key={x}
              type="button"
              aria-pressed={tags.includes(x)}
              onClick={() => setTags(tags.includes(x) ? tags.filter((y) => y !== x) : [...tags, x].slice(0, 5))}
              className={cn("rounded-full px-2.5 py-0.5 text-xs", tags.includes(x) ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent")}
            >
              {x}
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-9 rounded-md px-3 text-sm hover:bg-accent">
          {t("chat.cancel")}
        </button>
        <button type="button" disabled={!title.trim() || busy} onClick={() => void send()} className="h-9 rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">
          {t(message ? "chat.save_edit" : "chat.forum_post")}
        </button>
      </div>
    </Modal>
  );
}
