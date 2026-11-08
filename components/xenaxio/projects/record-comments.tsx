"use client";

// xenaxio step 119: comments on a record, where its type has them (the admin
// turns them on per type). Everyone who sees the record writes; the author
// edits and deletes their own, the record's owners and admins delete any.
// Step 134: pictures pasted and files dropped or chosen become the record's files
// (where its type has files) and the comment shows them.
// Step 142: the comments are a chat, live — answers, reactions, "… is typing", the
// "new" line and the unread mark, as in the chat of a task.
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { errorText } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";
import { sendTyping, useDebounced, useLive, useTyping } from "@/lib/xenaxio/live";
import { useXenaxioMe } from "@/lib/xenaxio/me-store";
import { type ObjectComment, type ObjectType, projectsApi } from "@/lib/xenaxio/projects";
import { useEventText, useRecordHistory } from "./record-history";
import { toast } from "@/stores/toast-store";
import { Chat, type ChatActions } from "./chat";
import type { FileTarget } from "./file-text";

/** `files`: where pictures and files of a new comment go (none: the type has no files or the person may not add). */
export function RecordComments({ objectId, archived, type, files, onRead }: { objectId: string; archived: boolean; type?: ObjectType; files?: FileTarget; onRead?: () => void }) {
  const t = useXT();
  const locale = useLocale();
  const me = useXenaxioMe()?.user.id ?? null;
  const [list, setList] = useState<ObjectComment[] | null>(null);
  const [lastRead, setLastRead] = useState<string | null | undefined>(undefined);
  // Step 127 D: one feed with the changes when asked (as Chatter).
  const [withChanges, setWithChanges] = useState(false);
  const events = useRecordHistory(objectId, withChanges, list?.length ?? 0);
  const eventText = useEventText(type);
  const typing = useTyping(objectId, null);

  const run = useCallback(
    async (fn: () => Promise<{ comments: ObjectComment[] }>) => {
      try {
        setList((await fn()).comments);
        return true;
      } catch (err) {
        toast.error(errorText(t, err));
        return false;
      }
    },
    [t],
  );
  const read = useCallback(() => {
    void projectsApi
      .readObject(objectId)
      .then(() => onRead?.())
      .catch(() => undefined);
  }, [objectId, onRead]);
  const load = useCallback(
    (first: boolean) =>
      projectsApi
        .comments(objectId)
        .then((r) => {
          if (first) setLastRead(r.lastRead ?? null);
          setList(r.comments);
          if (document.visibilityState === "visible") read();
        })
        .catch((err: unknown) => toast.error(errorText(t, err))),
    [objectId, read, t],
  );
  useEffect(() => {
    setList(null);
    setLastRead(undefined);
    void load(true);
  }, [load]);
  const refresh = useDebounced(() => void load(false));
  useLive((e) => {
    if (e.k === "reset" || (e.k === "message" && e.o === objectId && !e.task && e.by !== me)) refresh();
  });

  const actions: ChatActions = {
    send: (body, _mentions, replyTo) => run(() => projectsApi.addComment(objectId, body, replyTo)),
    edit: (id, body) => run(() => projectsApi.editComment(objectId, id, body)),
    remove: (id) => run(() => projectsApi.deleteComment(objectId, id)),
    react: (id, emoji) => run(() => projectsApi.reactComment(objectId, id, emoji)),
    typing: () => sendTyping(objectId),
  };

  if (!list || lastRead === undefined) return null;
  return (
    <div className="space-y-2 text-sm sm:col-span-2">
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">{t("projects.chat")}</span>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" className="h-3.5 w-3.5" checked={withChanges} onChange={(e) => setWithChanges(e.target.checked)} />
          {t("projects.history_with_comments")}
        </label>
      </div>
      <Chat
        key={objectId}
        messages={list}
        lastRead={lastRead}
        me={me}
        canWrite={!archived}
        objectId={objectId}
        files={archived ? undefined : files}
        typing={typing}
        actions={actions}
        extra={
          withChanges
            ? (events ?? []).map((e) => ({
                at: e.createdAt,
                key: e.id,
                node: (
                  <p className="py-0.5 pl-9 text-xs text-muted-foreground">
                    <span className="text-foreground">{e.author?.name ?? "—"}</span> {eventText(e)} · {new Date(e.createdAt).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" })}
                  </p>
                ),
              }))
            : undefined
        }
      />
    </div>
  );
}
