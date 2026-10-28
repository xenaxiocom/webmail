"use client";

// xenaxio, step 63: every channel of the company for its admin (also closed
// ones the admin is not in): rename, topic, archive and restore. The admin
// does not see the messages; the platform makes the change and notes who asked.
import { IconArchive, IconHash, IconLock, IconWorld } from "@tabler/icons-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice, Spinner } from "@/components/xenaxio/ui";
import { type ChatChannelAdmin, type ChatChannelChange, errorText, xenaxio } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";
import { cn } from "@/lib/utils";

type Editing = { roomId: string; field: "name" | "topic"; value: string };

export function ChannelsAdmin() {
  const t = useXT();
  const [channels, setChannels] = useState<ChatChannelAdmin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    try {
      setChannels((await xenaxio.chatChannels()).channels);
      setError(null);
    } catch (err) {
      setError(errorText(t, err));
    }
  }, [t]);
  useEffect(() => {
    void load();
  }, [load]);

  const change = async (channel: ChatChannelAdmin, update: ChatChannelChange) => {
    setBusy(channel.roomId);
    setError(null);
    try {
      const next = await xenaxio.changeChatChannel(channel.roomId, update);
      setChannels((list) => list?.map((c) => (c.roomId === next.roomId ? next : c)) ?? null);
      setEditing(null);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(null);
    }
  };

  const save = (channel: ChatChannelAdmin) => (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const value = editing.value.trim();
    if (editing.field === "name" && !value) return;
    void change(channel, editing.field === "name" ? { name: value } : { topic: value });
  };

  const visible = channels?.filter((c) => showArchived || !c.archived) ?? [];
  const archivedCount = channels?.filter((c) => c.archived).length ?? 0;

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-labelledby="chat-channels-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="chat-channels-title" className="text-base font-semibold">
          {t("chatadmin.channels_title")}
        </h2>
        {archivedCount > 0 && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            {t("chatadmin.channels_show_archived", { count: archivedCount })}
          </label>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{t("chatadmin.channels_intro")}</p>
      {error && <Notice kind="error">{error}</Notice>}
      {!channels && !error && <Spinner label={t("common.loading")} />}
      {channels && visible.length === 0 && <p className="text-sm text-muted-foreground">{t("chatadmin.channels_none")}</p>}
      <ul className="divide-y divide-border">
        {visible.map((c) => {
          const editingThis = editing?.roomId === c.roomId ? editing : null;
          const working = busy === c.roomId;
          return (
            <li key={c.roomId} className={cn("space-y-2 py-3", c.archived && "opacity-70")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    {c.external ? <IconWorld size={15} className="shrink-0 text-primary" /> : c.isPublic ? <IconHash size={15} className="shrink-0 text-muted-foreground" /> : <IconLock size={15} className="shrink-0 text-muted-foreground" />}
                    <span className="truncate">{c.name ?? t("chatadmin.channels_unnamed")}</span>
                    {c.archived && (
                      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                        <IconArchive size={12} />
                        {t("chatadmin.channels_archived")}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[c.isPublic ? t("chatadmin.channels_open") : t("chatadmin.channels_closed"), t("chatadmin.channels_members", { count: c.members }), ...(c.general ? [t("chatadmin.channels_general")] : [])].join(" · ")}
                  </p>
                  {c.topic && <p className="mt-0.5 text-xs text-muted-foreground">{c.topic}</p>}
                  {!c.managed && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{t("chatadmin.channels_unmanaged")}</p>}
                </div>
                {c.managed && !editingThis && (
                  <div className="flex flex-wrap gap-1">
                    <Button variant="ghost" size="sm" disabled={working} onClick={() => setEditing({ roomId: c.roomId, field: "name", value: c.name ?? "" })}>
                      {t("chat.rename")}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={working} onClick={() => setEditing({ roomId: c.roomId, field: "topic", value: c.topic ?? "" })}>
                      {t("chat.set_topic")}
                    </Button>
                    {c.archived ? (
                      <Button variant="ghost" size="sm" disabled={working} onClick={() => void change(c, { archived: false })}>
                        {t("chatadmin.channels_restore")}
                      </Button>
                    ) : (
                      !c.general && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          disabled={working}
                          onClick={() => {
                            if (window.confirm(t("chat.archive_confirm", { name: c.name ?? "" }))) void change(c, { archived: true });
                          }}
                        >
                          {t("chat.archive")}
                        </Button>
                      )
                    )}
                  </div>
                )}
              </div>
              {editingThis && (
                <form onSubmit={save(c)} className="flex flex-wrap items-center gap-2">
                  <input
                    autoFocus
                    aria-label={editingThis.field === "name" ? t("chat.rename") : t("chat.set_topic")}
                    value={editingThis.value}
                    maxLength={editingThis.field === "name" ? 80 : 500}
                    onChange={(e) => setEditing({ ...editingThis, value: e.target.value })}
                    onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                    className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                  />
                  <Button type="submit" size="sm" disabled={working || (editingThis.field === "name" && !editingThis.value.trim())}>
                    {t("chat.save_edit")}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>
                    {t("common.cancel")}
                  </Button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
