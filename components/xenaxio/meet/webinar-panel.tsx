"use client";

// xenaxio step 79, part C: questions, polls and chat of a webinar. Everything
// goes through the platform (viewers cannot send messages into the room); it
// tells the room on the topic "xen.webinar", and this panel follows. The
// state lives in the meeting (useWebinarLive), so nothing is missed while the
// panel is closed.
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDataChannel } from "@livekit/components-react";
import { cn } from "@/lib/utils";
import { XenaxioApiError } from "@/lib/xenaxio/api";
import { type ChatMode, type GuestKey, meet, type WebinarChatMessage, type WebinarLiveState, type WebinarPoll, type WebinarQuestion } from "@/lib/xenaxio/meet";
import { meetError, useMeetLang } from "./lang";

const LIVE_TOPIC = "xen.webinar";
const decoder = new TextDecoder();

type LiveEvent =
  | { type: "question"; question: WebinarQuestion }
  | { type: "poll"; poll: WebinarPoll }
  | { type: "chat"; message: WebinarChatMessage }
  | { type: "settings"; chatMode: ChatMode; anonymousQuestions: boolean };

const upsert = <T extends { id: string }>(list: T[], item: T): T[] => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]);

export function useWebinarLive(code: string, guest: GuestKey | null, enabled: boolean) {
  const [state, setState] = useState<WebinarLiveState | null>(null);
  const [unread, setUnread] = useState(0);
  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      setState(await meet.webinarState(code, guest));
    } catch {
      // The next event or reconnect loads again.
    }
  }, [code, guest, enabled]);
  useEffect(() => {
    void load();
  }, [load]);
  useDataChannel(LIVE_TOPIC, (msg) => {
    if (!enabled) return;
    const e = JSON.parse(decoder.decode(msg.payload)) as LiveEvent;
    setState((s) => {
      if (!s) return s;
      switch (e.type) {
        case "question":
          // A hidden question disappears for viewers; hosts keep it greyed out.
          if (e.question.hidden && !s.host) return { ...s, questions: s.questions.filter((q) => q.id !== e.question.id) };
          return { ...s, questions: upsert(s.questions, e.question) };
        case "poll": {
          const before = s.polls.find((p) => p.id === e.poll.id);
          // Counts sent to everyone must not wipe the ones hosts got.
          const poll = !e.poll.counts && before?.counts ? { ...e.poll, counts: before.counts } : e.poll;
          return { ...s, polls: upsert(s.polls, poll) };
        }
        case "chat":
          return s.chat.some((m) => m.id === e.message.id) ? s : { ...s, chat: [...s.chat.slice(-199), e.message] };
        case "settings":
          return { ...s, chatMode: e.chatMode, anonymousQuestions: e.anonymousQuestions };
      }
      return s;
    });
    if (e.type === "chat") setUnread((n) => n + 1);
  });
  return { state, setState, unread, read: () => setUnread(0), reload: load };
}

type Live = ReturnType<typeof useWebinarLive>;

/** The panel: questions, polls, chat; hosts also set who may chat and anonymous questions. */
export function WebinarPanel({ code, guest, live, me }: { code: string; guest: GuestKey | null; live: Live; me: string }) {
  const { t } = useMeetLang();
  const [tab, setTab] = useState<"questions" | "polls" | "chat">("questions");
  const [error, setError] = useState<string | null>(null);
  const { state, setState, read } = live;
  useEffect(() => {
    if (tab === "chat") read();
  }, [tab, read, state?.chat.length]);
  if (!state) return <p className="text-sm text-white/60">{t("loading")}</p>;
  const fail = (err: unknown) => setError(meetError(t, err instanceof XenaxioApiError ? err.code : "internal"));
  const tabs: ("questions" | "polls" | "chat")[] = state.chatMode === "off" && !state.host ? ["questions", "polls"] : ["questions", "polls", "chat"];
  return (
    <div className="flex h-full flex-col gap-3">
      <div role="tablist" className="flex gap-1 rounded-lg bg-white/5 p-1 text-sm">
        {tabs.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("flex-1 rounded-md px-2 py-1", tab === k ? "bg-white/15" : "text-white/70 hover:text-white")}>
            {t(`live_${k}`)}
          </button>
        ))}
      </div>
      {state.host && <HostSettings code={code} chatMode={state.chatMode} anonymous={state.anonymousQuestions} onError={fail} />}
      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "questions" && <Questions code={code} guest={guest} state={state} setState={setState} onError={fail} />}
        {tab === "polls" && <Polls code={code} guest={guest} state={state} setState={setState} onError={fail} />}
        {tab === "chat" && <Chat code={code} guest={guest} state={state} me={me} onError={fail} />}
      </div>
    </div>
  );
}

type PartProps = { code: string; guest: GuestKey | null; state: WebinarLiveState; setState: Live["setState"]; onError: (err: unknown) => void };

function HostSettings({ code, chatMode, anonymous, onError }: { code: string; chatMode: ChatMode; anonymous: boolean; onError: (err: unknown) => void }) {
  const { t } = useMeetLang();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white/5 px-3 py-2 text-xs">
      <label className="flex items-center gap-1">
        {t("live_chat_mode")}
        <select value={chatMode} onChange={(e) => void meet.liveSettings(code, { chatMode: e.target.value as ChatMode }).catch(onError)} className="rounded bg-white/10 px-1 py-0.5">
          {(["all", "hosts", "off"] as ChatMode[]).map((m) => (
            <option key={m} value={m} className="text-black">
              {t(`live_chat_${m}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={anonymous} onChange={(e) => void meet.liveSettings(code, { anonymousQuestions: e.target.checked }).catch(onError)} />
        {t("live_anonymous_allowed")}
      </label>
    </div>
  );
}

function Questions({ code, guest, state, setState, onError }: PartProps) {
  const { t } = useMeetLang();
  const [text, setText] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const voted = useMemo(() => new Set(state.myVotes.questions), [state.myVotes.questions]);
  // Open questions first, most votes first; answered ones below.
  const list = useMemo(() => [...state.questions].sort((a, b) => Number(a.answered) - Number(b.answered) || b.votes - a.votes || a.createdAt.localeCompare(b.createdAt)), [state.questions]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await meet.ask(code, text.trim(), anonymous && state.anonymousQuestions, guest);
      setText("");
    } catch (err) {
      onError(err);
    }
  };
  const vote = async (q: WebinarQuestion) => {
    const up = !voted.has(q.id);
    try {
      await meet.voteQuestion(code, q.id, up, guest);
      setState((s) => (s ? { ...s, myVotes: { ...s.myVotes, questions: up ? [...s.myVotes.questions, q.id] : s.myVotes.questions.filter((id) => id !== q.id) } } : s));
    } catch (err) {
      onError(err);
    }
  };
  return (
    <div className="space-y-3">
      <form onSubmit={(e) => void submit(e)} className="space-y-2">
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={2} placeholder={t("live_ask_placeholder")} aria-label={t("live_ask_placeholder")} className="w-full rounded-md bg-white/10 px-2 py-1.5 text-sm text-white placeholder:text-white/40" />
        <div className="flex items-center gap-2">
          {state.anonymousQuestions && (
            <label className="flex flex-1 items-center gap-1 text-xs text-white/70">
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
              {t("live_anonymous")}
            </label>
          )}
          <button type="submit" disabled={!text.trim()} className="ml-auto rounded-md bg-[var(--meet-accent,#2563eb)] px-3 py-1 text-sm text-[var(--meet-accent-text,#fff)] disabled:opacity-50">
            {t("live_ask")}
          </button>
        </div>
      </form>
      {list.length === 0 && <p className="text-sm text-white/60">{t("live_no_questions")}</p>}
      <ul className="space-y-2">
        {list.map((q) => (
          <li key={q.id} className={cn("rounded-lg bg-white/5 p-2 text-sm", (q.answered || q.hidden) && "opacity-60")}>
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => void vote(q)}
                aria-pressed={voted.has(q.id)}
                aria-label={t("live_upvote")}
                className={cn("flex shrink-0 flex-col items-center rounded-md px-2 py-1 text-xs", voted.has(q.id) ? "bg-[var(--meet-accent,#2563eb)]" : "bg-white/10 hover:bg-white/20")}
              >
                ▲<span>{q.votes}</span>
              </button>
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap break-words">{q.text}</p>
                <p className="mt-0.5 text-xs text-white/50">
                  {q.name ?? t("live_anonymous_name")}
                  {q.answered && ` · ${t("live_answered")}`}
                  {q.hidden && ` · ${t("live_hidden")}`}
                </p>
              </div>
            </div>
            {state.host && (
              <div className="mt-1 flex gap-1">
                <button type="button" onClick={() => void meet.moderateQuestion(code, q.id, { answered: !q.answered }).catch(onError)} className="rounded bg-white/10 px-2 py-0.5 text-xs hover:bg-white/20">
                  {q.answered ? t("live_unanswer") : t("live_mark_answered")}
                </button>
                <button type="button" onClick={() => void meet.moderateQuestion(code, q.id, { hidden: !q.hidden }).catch(onError)} className="rounded bg-white/10 px-2 py-0.5 text-xs hover:bg-white/20">
                  {q.hidden ? t("live_unhide") : t("live_hide")}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Polls({ code, guest, state, setState, onError }: PartProps) {
  const { t } = useMeetLang();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [hostsOnly, setHostsOnly] = useState(false);
  const create = async (e: FormEvent) => {
    e.preventDefault();
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || opts.length < 2) return;
    try {
      await meet.createPoll(code, question.trim(), opts, hostsOnly ? "hosts" : "all");
      setQuestion("");
      setOptions(["", ""]);
    } catch (err) {
      onError(err);
    }
  };
  const vote = async (p: WebinarPoll, option: number) => {
    try {
      await meet.votePoll(code, p.id, option, guest);
      setState((s) => (s ? { ...s, myVotes: { ...s.myVotes, polls: { ...s.myVotes.polls, [p.id]: option } } } : s));
    } catch (err) {
      onError(err);
    }
  };
  return (
    <div className="space-y-3">
      {state.host && (
        <form onSubmit={(e) => void create(e)} className="space-y-2 rounded-lg bg-white/5 p-2">
          <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} placeholder={t("live_poll_question")} aria-label={t("live_poll_question")} className="w-full rounded-md bg-white/10 px-2 py-1 text-sm text-white placeholder:text-white/40" />
          {options.map((o, i) => (
            <input
              key={i}
              value={o}
              onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
              maxLength={120}
              placeholder={t("live_poll_option", { n: i + 1 })}
              aria-label={t("live_poll_option", { n: i + 1 })}
              className="w-full rounded-md bg-white/10 px-2 py-1 text-sm text-white placeholder:text-white/40"
            />
          ))}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {options.length < 6 && (
              <button type="button" onClick={() => setOptions([...options, ""])} className="rounded bg-white/10 px-2 py-0.5 hover:bg-white/20">
                {t("live_poll_add_option")}
              </button>
            )}
            <label className="flex items-center gap-1 text-white/70">
              <input type="checkbox" checked={hostsOnly} onChange={(e) => setHostsOnly(e.target.checked)} />
              {t("live_poll_hosts_only")}
            </label>
            <button type="submit" disabled={!question.trim() || options.filter((o) => o.trim()).length < 2} className="ml-auto rounded-md bg-[var(--meet-accent,#2563eb)] px-3 py-1 text-sm text-[var(--meet-accent-text,#fff)] disabled:opacity-50">
              {t("live_poll_start")}
            </button>
          </div>
        </form>
      )}
      {state.polls.length === 0 && <p className="text-sm text-white/60">{t("live_no_polls")}</p>}
      {[...state.polls].reverse().map((p) => {
        const mine = state.myVotes.polls[p.id];
        const total = p.counts?.reduce((a, b) => a + b, 0) ?? 0;
        const showResults = !!p.counts && (mine !== undefined || p.closed || state.host);
        return (
          <div key={p.id} className="space-y-1.5 rounded-lg bg-white/5 p-2 text-sm">
            <p className="font-medium">
              {p.question}
              {p.closed && <span className="ml-1 text-xs font-normal text-white/50">· {t("live_poll_closed")}</span>}
            </p>
            {p.options.map((o, i) =>
              showResults ? (
                <div key={i} className="relative overflow-hidden rounded-md bg-white/10 px-2 py-1">
                  <div className="absolute inset-y-0 left-0 bg-[var(--meet-accent,#2563eb)]/50" style={{ width: `${total ? Math.round(((p.counts?.[i] ?? 0) / total) * 100) : 0}%` }} />
                  <span className="relative flex justify-between gap-2">
                    <span>
                      {o}
                      {mine === i && " ✓"}
                    </span>
                    <span>{total ? Math.round(((p.counts?.[i] ?? 0) / total) * 100) : 0} %</span>
                  </span>
                </div>
              ) : (
                <button
                  key={i}
                  type="button"
                  disabled={mine !== undefined || p.closed}
                  onClick={() => void vote(p, i)}
                  className={cn("block w-full rounded-md px-2 py-1 text-left", mine === i ? "bg-[var(--meet-accent,#2563eb)]" : "bg-white/10 hover:bg-white/20 disabled:hover:bg-white/10")}
                >
                  {o}
                </button>
              ),
            )}
            {mine !== undefined && !showResults && <p className="text-xs text-white/60">{t("live_poll_thanks")}</p>}
            {state.host && (
              <p className="flex items-center justify-between text-xs text-white/60">
                <span>{t("live_poll_votes", { count: total })}</span>
                {!p.closed && (
                  <button type="button" onClick={() => void meet.closePoll(code, p.id).catch(onError)} className="rounded bg-white/10 px-2 py-0.5 hover:bg-white/20">
                    {t("live_poll_close")}
                  </button>
                )}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Chat({ code, guest, state, me, onError }: { code: string; guest: GuestKey | null; state: WebinarLiveState; me: string; onError: (err: unknown) => void }) {
  const { t } = useMeetLang();
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  // Newer browsers return a promise from scrollIntoView: never hand it to React as a cleanup.
  useEffect(() => {
    void end.current?.scrollIntoView({ block: "end" });
  }, [state.chat.length]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await meet.sendChat(code, text.trim(), guest);
      setText("");
    } catch (err) {
      onError(err);
    }
  };
  const off = state.chatMode === "off";
  return (
    <div className="flex h-full flex-col">
      {state.chatMode === "hosts" && !state.host && <p className="mb-2 text-xs text-white/60">{t("live_chat_to_hosts_hint")}</p>}
      <div className="flex-1 space-y-2">
        {state.chat.length === 0 && <p className="text-sm text-white/60">{t("chat_empty")}</p>}
        {state.chat.map((m) => (
          <div key={m.id} className="text-sm">
            <span className="font-medium">{m.name}</span>
            {m.identity === me && <span className="text-white/60"> {t("you")}</span>}
            {m.toHosts && <span className="ml-1 text-xs text-amber-300">· {t("live_to_hosts")}</span>}{" "}
            <span className="text-xs text-white/50">{new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            <p className="whitespace-pre-wrap break-words text-white/90">{m.text}</p>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => void submit(e)} className="mt-2 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          disabled={off}
          placeholder={off ? t("live_chat_off") : t("chat_placeholder")}
          aria-label={t("chat_placeholder")}
          className="min-w-0 flex-1 rounded-md bg-white/10 px-2 py-1.5 text-sm text-white placeholder:text-white/40"
        />
        <button type="submit" disabled={off || !text.trim()} className="rounded-md bg-[var(--meet-accent,#2563eb)] px-3 text-sm text-[var(--meet-accent-text,#fff)] disabled:opacity-50">
          {t("chat_send")}
        </button>
      </form>
    </div>
  );
}
