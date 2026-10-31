"use client";

// Step 99, part E2: "Later", as in Slack — the time picker for "remind me" and
// "send later", and the view with reminders and scheduled messages.
import { IconAlarm, IconClockHour4, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { ChatClient } from "@/lib/xenaxio/chat/client";
import { isDue, laterTime, localInput, type LaterChoice, useChatLater } from "@/lib/xenaxio/chat/later";
import { useChatStore } from "@/lib/xenaxio/chat/store";
import { useXT } from "@/lib/xenaxio/i18n";
import { toast } from "@/stores/toast-store";
import { cn } from "@/lib/utils";
import { useChatTime } from "./common";
import { Modal } from "./dialogs";

/** Quick times and an own one; returns the chosen moment. */
export function TimePicker({ title, choices, confirm, onPick, onClose }: { title: string; choices: LaterChoice[]; confirm: string; onPick: (at: Date) => Promise<void>; onClose: () => void }) {
  const t = useXT();
  const { full } = useChatTime();
  const [custom, setCustom] = useState(() => localInput(laterTime("tomorrow")));
  const [busy, setBusy] = useState(false);
  const pick = async (at: Date) => {
    if (busy) return;
    if (Number.isNaN(at.getTime()) || at.getTime() < Date.now() - 60_000) {
      toast.error(t("chat.later_past"));
      return;
    }
    setBusy(true);
    try {
      await onPick(at);
      onClose();
    } catch {
      toast.error(t("chat.error"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <ul className="space-y-1">
        {choices.map((c) => {
          const at = laterTime(c);
          return (
            <li key={c}>
              <button type="button" disabled={busy} onClick={() => void pick(at)} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent">
                <span>{t(`chat.later_${c}`)}</span>
                <span className="text-xs text-muted-foreground">{full(at.getTime())}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 border-t border-border pt-3">
        <label className="text-sm font-medium" htmlFor="chat-later-custom">
          {t("chat.later_custom")}
        </label>
        <div className="mt-1 flex gap-2">
          <input id="chat-later-custom" type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm" />
          <button type="button" disabled={busy || !custom} onClick={() => void pick(new Date(custom))} className="h-9 shrink-0 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50">
            {confirm}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Loads "Later" with the chat and looks again every minute (due reminders show up). */
export function useLaterLoader(ready: boolean) {
  const load = useChatLater((s) => s.load);
  useEffect(() => {
    if (!ready) return;
    void load().catch(() => undefined);
    const id = setInterval(() => void load().catch(() => undefined), 60_000);
    return () => clearInterval(id);
  }, [ready, load]);
}

export function LaterView({ client }: { client: ChatClient }) {
  const t = useXT();
  const { full } = useChatTime();
  const { reminders, scheduled, loaded } = useChatLater();
  const later = useChatLater();
  const setFocus = useChatStore((s) => s.setFocus);
  const setView = useChatStore((s) => s.setView);
  const [snooze, setSnooze] = useState<string | null>(null);
  const [move, setMove] = useState<string | null>(null);
  const run = (job: () => Promise<void>) => void job().catch(() => toast.error(t("chat.error")));
  const now = Date.now();
  const due = reminders.filter((r) => isDue(r, now));
  const upcoming = reminders.filter((r) => !isDue(r, now));
  const where = (roomId: string, roomName: string | null) => (roomName ? `#${roomName}` : client.rooms.get(roomId) ? client.roomName(client.rooms.get(roomId)!) : t("chat.direct"));
  const row = "group flex items-start gap-3 border-b border-border px-5 py-3 hover:bg-muted/40";
  const action = "rounded px-2 py-1 text-xs hover:bg-accent";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center border-b border-border px-5 text-base font-bold">{t("chat.later")}</header>
      <div className="flex-1 overflow-y-auto">
        {loaded && reminders.length === 0 && scheduled.length === 0 && <p className="p-5 text-sm text-muted-foreground">{t("chat.later_empty")}</p>}
        {[
          { title: t("chat.later_due"), list: due },
          { title: t("chat.later_upcoming"), list: upcoming },
        ].map(
          (group) =>
            group.list.length > 0 && (
              <section key={group.title}>
                <h3 className="bg-muted/40 px-5 py-1.5 text-xs font-semibold uppercase text-muted-foreground">{group.title}</h3>
                <ul>
                  {group.list.map((r) => (
                    <li key={r.id} className={row}>
                      <IconAlarm size={18} className={cn("mt-0.5 shrink-0", isDue(r, now) ? "text-amber-500" : "text-muted-foreground")} />
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => (setView({ kind: "room", roomId: r.roomId }), setFocus({ roomId: r.roomId, eventId: r.eventId }))}>
                        <span className="block text-xs text-muted-foreground">
                          {where(r.roomId, r.roomName)} · {full(Date.parse(r.remindAt))}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-sm">{r.preview || t("chat.later_message")}</span>
                      </button>
                      <span className="flex shrink-0 gap-1">
                        <button type="button" className={action} onClick={() => run(() => later.changeReminder(r.id, { done: true }))}>
                          {t("chat.later_done")}
                        </button>
                        <button type="button" className={action} onClick={() => setSnooze(r.id)}>
                          {t("chat.later_snooze")}
                        </button>
                        <button type="button" className={action} aria-label={t("chat.delete")} onClick={() => run(() => later.deleteReminder(r.id))}>
                          <IconTrash size={14} />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ),
        )}
        {scheduled.length > 0 && (
          <section>
            <h3 className="bg-muted/40 px-5 py-1.5 text-xs font-semibold uppercase text-muted-foreground">{t("chat.later_scheduled")}</h3>
            <ul>
              {scheduled.map((m) => (
                <li key={m.id} className={row}>
                  <IconClockHour4 size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setView({ kind: "room", roomId: m.roomId })}>
                    <span className="block text-xs text-muted-foreground">
                      {where(m.roomId, m.roomName)}
                      {m.threadRoot && ` · ${t("chat.thread")}`} · {full(Date.parse(m.sendAt))}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block whitespace-pre-wrap text-sm">{m.preview}</span>
                    {m.error && <span className="mt-0.5 block text-xs text-destructive">{t(`chat.later_error_${m.error === "not_in_room" ? "room" : "other"}`)}</span>}
                  </button>
                  <span className="flex shrink-0 gap-1">
                    <button type="button" className={action} onClick={() => run(() => later.changeScheduled(m.id, { sendAt: new Date().toISOString() }))}>
                      {t("chat.later_send_now")}
                    </button>
                    <button type="button" className={action} onClick={() => setMove(m.id)}>
                      {t("chat.later_reschedule")}
                    </button>
                    <button type="button" className={action} aria-label={t("chat.delete")} onClick={() => run(() => later.deleteScheduled(m.id))}>
                      <IconTrash size={14} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {snooze && (
        <TimePicker title={t("chat.later_snooze")} choices={["20m", "1h", "3h", "tomorrow", "monday"]} confirm={t("chat.save_edit")} onClose={() => setSnooze(null)} onPick={(at) => later.changeReminder(snooze, { remindAt: at.toISOString() })} />
      )}
      {move && <TimePicker title={t("chat.later_reschedule")} choices={["1h", "tomorrow", "monday"]} confirm={t("chat.save_edit")} onClose={() => setMove(null)} onPick={(at) => later.changeScheduled(move, { sendAt: at.toISOString() })} />}
    </div>
  );
}
