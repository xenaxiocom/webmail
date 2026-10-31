"use client";

// Step 99, part E2b: a poll in a channel — vote with one click, the results
// after one's own vote (or only after the end, if the poll says so), the
// author ends it. Matrix polls, so Element votes in the same poll.
import { IconChartBar, IconPlus, IconX } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { ChatClient, Message } from "@/lib/xenaxio/chat/client";
import { endContent, MAX_ANSWERS, POLL_END, POLL_RESPONSE, POLL_START, pollContent, pollOf, responseContent, tally } from "@/lib/xenaxio/chat/poll";
import { useXT } from "@/lib/xenaxio/i18n";
import { toast } from "@/stores/toast-store";
import { cn } from "@/lib/utils";
import { Modal } from "./dialogs";

export function PollCard({ client, message }: { client: ChatClient; message: Message }) {
  const t = useXT();
  const poll = pollOf(message.content);
  const [busy, setBusy] = useState(false);
  const real = !message.id.startsWith("~");
  useEffect(() => {
    if (real) void client.loadPoll(message.roomId, message.id).catch(() => undefined);
  }, [client, message.roomId, message.id, real]);
  if (!poll) return <div className="text-sm italic text-muted-foreground">{t("chat.poll_broken")}</div>;
  const state = message.pollState;
  const mine = state?.votes.get(client.userId)?.answers ?? [];
  const ended = state?.endedTs != null;
  const { counts, voters } = tally(poll, state);
  const showResults = ended || (!poll.hidden && mine.length > 0);
  const vote = async (id: string) => {
    if (ended || busy || !real) return;
    let next: string[];
    if (poll.maxSelections === 1) next = mine.includes(id) ? [] : [id];
    else next = mine.includes(id) ? mine.filter((a) => a !== id) : [...mine, id].slice(-poll.maxSelections);
    setBusy(true);
    try {
      await client.sendEvent(message.roomId, POLL_RESPONSE, responseContent(message.id, next));
    } catch {
      toast.error(t("chat.error"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-1 max-w-md rounded-md border border-border p-3" data-testid="chat-poll">
      <div className="flex items-start gap-2">
        <IconChartBar size={18} className="mt-0.5 shrink-0 text-primary" />
        <div className="min-w-0">
          <div className="font-semibold">{poll.question}</div>
          <div className="text-xs text-muted-foreground">
            {poll.maxSelections > 1 ? t("chat.poll_multiple") : t("chat.poll_single")}
            {poll.hidden && !ended && ` · ${t("chat.poll_hidden_hint")}`}
          </div>
        </div>
      </div>
      <ul className="mt-2 space-y-1.5">
        {poll.answers.map((a) => {
          const n = counts.get(a.id) ?? 0;
          const pct = voters ? Math.round((n / voters) * 100) : 0;
          const chosen = mine.includes(a.id);
          return (
            <li key={a.id}>
              <button
                type="button"
                role={poll.maxSelections > 1 ? "checkbox" : "radio"}
                aria-checked={chosen}
                disabled={ended || busy || !real}
                onClick={() => void vote(a.id)}
                className={cn("relative block w-full overflow-hidden rounded-md border px-3 py-1.5 text-left text-sm", chosen ? "border-primary" : "border-border", !ended && "hover:bg-accent")}
              >
                {showResults && <span aria-hidden className={cn("absolute inset-y-0 left-0", chosen ? "bg-primary/20" : "bg-muted")} style={{ width: `${pct}%` }} />}
                <span className="relative flex items-center justify-between gap-2">
                  <span>
                    {chosen && "✓ "}
                    {a.text}
                  </span>
                  {showResults && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{t("chat.poll_votes", { count: n })}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {ended ? `${t("chat.poll_ended")} · ` : ""}
          {t("chat.poll_voters", { count: voters })}
        </span>
        {message.sender === client.userId && !ended && real && (
          <button
            type="button"
            className="rounded px-2 py-1 hover:bg-accent"
            onClick={() => void client.sendEvent(message.roomId, POLL_END, endContent(message.id, t("chat.poll_ended"))).catch(() => toast.error(t("chat.error")))}
          >
            {t("chat.poll_end")}
          </button>
        )}
      </div>
    </div>
  );
}

export function PollDialog({ client, roomId, onClose }: { client: ChatClient; roomId: string; onClose: () => void }) {
  const t = useXT();
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const filled = answers.filter((a) => a.trim()).length;
  const send = async () => {
    if (!question.trim() || filled < 2 || busy) return;
    setBusy(true);
    try {
      await client.sendEvent(roomId, POLL_START, pollContent({ question, answers, multiple, hidden }));
      onClose();
    } catch {
      toast.error(t("chat.error"));
    } finally {
      setBusy(false);
    }
  };
  const field = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
  return (
    <Modal title={t("chat.poll_create")} onClose={onClose} wide>
      <label className="block text-sm font-medium" htmlFor="chat-poll-q">
        {t("chat.poll_question")}
      </label>
      <input id="chat-poll-q" autoFocus value={question} maxLength={500} onChange={(e) => setQuestion(e.target.value)} className={cn(field, "mt-1")} />
      <div className="mt-3 text-sm font-medium">{t("chat.poll_answers")}</div>
      <ul className="mt-1 space-y-1.5">
        {answers.map((a, i) => (
          <li key={i} className="flex gap-1.5">
            <input
              value={a}
              maxLength={300}
              aria-label={t("chat.poll_answer", { n: i + 1 })}
              onChange={(e) => setAnswers(answers.map((x, j) => (j === i ? e.target.value : x)))}
              className={field}
            />
            {answers.length > 2 && (
              <button type="button" onClick={() => setAnswers(answers.filter((_, j) => j !== i))} className="rounded p-2 text-muted-foreground hover:bg-accent" aria-label={t("chat.poll_remove")}>
                <IconX size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {answers.length < MAX_ANSWERS && (
        <button type="button" onClick={() => setAnswers([...answers, ""])} className="mt-1.5 flex items-center gap-1 rounded px-2 py-1 text-sm text-primary hover:bg-accent">
          <IconPlus size={14} />
          {t("chat.poll_add")}
        </button>
      )}
      <div className="mt-3 space-y-1 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} />
          {t("chat.poll_allow_multiple")}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          {t("chat.poll_hide_results")}
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-9 rounded-md px-3 text-sm hover:bg-accent">
          {t("chat.cancel")}
        </button>
        <button type="button" disabled={!question.trim() || filled < 2 || busy} onClick={() => void send()} className="h-9 rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">
          {t("chat.poll_send")}
        </button>
      </div>
    </Modal>
  );
}
