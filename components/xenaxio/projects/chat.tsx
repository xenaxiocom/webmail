"use client";

// xenaxio step 142, part D: the chat of a task or a record — their comments, live.
// Messages oldest first with the input below (as in Rooms); an answer quotes the
// message it answers; reactions; the author corrects and deletes their own message
// (a deleted one keeps its place); a line marks what came since the person last read;
// "… is typing" under the list. One component for tasks and records: the caller passes
// the actions, the data and rights stay with each.
import { type FormEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { Pencil, Reply, Smile, Trash, X } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmojiGlyph, EmojiPicker, quickReactions } from "@/components/xenaxio/chat/emoji-picker";
import { useXT } from "@/lib/xenaxio/i18n";
import type { ChatMessage, PersonRef } from "@/lib/xenaxio/projects";
import { cn } from "@/lib/utils";
import { PersonBadge } from "./bits";
import { type FileTarget, FileText, useFileText } from "./file-text";
import { MentionInput } from "./task-extras";

/** What the platform takes as a reaction: one emoji, or the company's own (":name:"). */
export const REACTION = /^(?:(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️)+|:[a-z0-9_+-]{1,14}:)$/u;

export interface ChatActions {
  send: (body: string, mentions: string[], replyTo: string | null) => Promise<boolean>;
  edit: (id: string, body: string) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  react: (id: string, emoji: string) => Promise<boolean>;
  /** Called while the person types (the platform tells the others, at most every few seconds). */
  typing?: () => void;
}

/** The message from which the "new" line starts: the first one of someone else after `lastRead`. */
export function firstNew(messages: ChatMessage[], lastRead: string | null | undefined, me: string | null): string | null {
  if (!lastRead) return null;
  const m = messages.find((x) => x.createdAt > lastRead && x.author?.id !== me && !x.deleted);
  return m?.id ?? null;
}

export function Chat({
  messages,
  lastRead,
  me,
  people,
  canWrite,
  objectId,
  files,
  typing,
  actions,
  body,
  extra,
}: {
  messages: ChatMessage[];
  lastRead?: string | null;
  /** The person's own user id (for "new" and own messages). */
  me: string | null;
  /** People who can be mentioned with @ (tasks); none: a plain input. */
  people?: PersonRef[];
  canWrite: boolean;
  objectId: string;
  files?: FileTarget;
  typing: string[];
  actions: ChatActions;
  /** How a message's text is shown (mentions stressed); plain text by default. */
  body?: (text: string) => ReactNode;
  /** More lines between the messages (the history of a record), by time. */
  extra?: { at: string; node: ReactNode; key: string }[];
}) {
  const t = useXT();
  const locale = useLocale();
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [picker, setPicker] = useState<string | null>(null);
  // On a phone there is no hover: a tap on a message shows its actions.
  const [tapped, setTapped] = useState<string | null>(null);
  // The "new" line stays where it was when the chat opened, also after the person reads.
  const [newFrom] = useState(() => firstNew(messages, lastRead, me));
  const list = useRef<HTMLUListElement>(null);
  const atBottom = useRef(true);
  const count = messages.length;

  // New messages scroll into view when the person was at the end of the list.
  useLayoutEffect(() => {
    const el = list.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [count]);
  useEffect(() => {
    if (newFrom) document.getElementById(`chat-msg-${newFrom}`)?.scrollIntoView?.({ block: "center" });
  }, [newFrom]);

  const time = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
  const show = (text: string) => (body ? body(text) : text);
  const quote = (id: string) => document.getElementById(`chat-msg-${id}`)?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  const send = async (text: string, mentions: string[]) => {
    const ok = await actions.send(text, mentions, replyTo?.id ?? null);
    if (ok) {
      setReplyTo(null);
      atBottom.current = true;
    }
    return ok;
  };
  const react = (id: string, emoji: string) => {
    setPicker(null);
    setTapped(null);
    if (REACTION.test(emoji)) void actions.react(id, emoji);
  };

  const rows: { at: string; key: string; node: ReactNode }[] = messages.map((m) => ({ at: m.createdAt, key: m.id, node: null }));
  for (const e of extra ?? []) rows.push({ at: e.at, key: `x-${e.key}`, node: e.node });
  rows.sort((a, b) => a.at.localeCompare(b.at));
  const byId = new Map(messages.map((m) => [m.id, m]));

  return (
    <div className="space-y-2 text-sm">
      {messages.length === 0 && !(extra?.length) && <p className="text-muted-foreground">{t("projects.chat_empty")}</p>}
      <ul
        ref={list}
        className="max-h-[28rem] space-y-1 overflow-y-auto overscroll-contain pr-1"
        aria-label={t("projects.chat")}
        aria-live="polite"
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {rows.map((r) => {
          if (r.node) return <li key={r.key}>{r.node}</li>;
          const m = byId.get(r.key)!;
          const mine = !!me && m.author?.id === me;
          return (
            <li key={m.id} id={`chat-msg-${m.id}`}>
              {newFrom === m.id && (
                <div className="my-2 flex items-center gap-2 text-[11px] font-medium text-primary" role="separator">
                  <span className="h-px flex-1 bg-primary/40" />
                  {t("projects.chat_new")}
                  <span className="h-px flex-1 bg-primary/40" />
                </div>
              )}
              <div className="group relative flex gap-2 py-1">
                <PersonBadge name={m.author?.name ?? "?"} email={m.author?.email} />
                <div
                  className={cn("min-w-0 flex-1 rounded-md px-2.5 py-1.5", mine ? "bg-primary/10" : "bg-muted/60")}
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest("a, button, input, form")) setTapped((cur) => (cur === m.id ? null : m.id));
                  }}
                >
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{m.author?.name ?? "—"}</span> · {time(m.createdAt)}
                    {m.editedAt && !m.deleted ? ` · ${t("objects.comment_edited")}` : ""}
                  </p>
                  {m.replyTo && (
                    <button
                      type="button"
                      onClick={() => quote(m.replyTo!.id)}
                      className="mt-1 block w-full truncate border-l-2 border-primary/50 pl-2 text-left text-xs text-muted-foreground hover:text-foreground"
                    >
                      <span className="font-medium">{m.replyTo.author ?? "—"}</span>: {m.replyTo.deleted ? <em>{t("projects.chat_deleted")}</em> : m.replyTo.text}
                    </button>
                  )}
                  {m.deleted ? (
                    <p className="italic text-muted-foreground">{t("projects.chat_deleted")}</p>
                  ) : editing?.id === m.id ? (
                    <form
                      className="mt-1 flex gap-2"
                      onSubmit={async (e: FormEvent) => {
                        e.preventDefault();
                        if (editing.body.trim() && (await actions.edit(m.id, editing.body.trim()))) setEditing(null);
                      }}
                    >
                      <Input value={editing.body} onChange={(e) => setEditing({ id: m.id, body: e.target.value })} maxLength={4000} aria-label={t("projects.edit")} autoFocus />
                      <Button type="submit" size="sm" disabled={!editing.body.trim()}>
                        {t("common.save")}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        {t("common.cancel")}
                      </Button>
                    </form>
                  ) : (
                    <div className="whitespace-pre-wrap break-words">
                      <FileText body={m.body} objectId={objectId} text={show} />
                    </div>
                  )}
                  {!m.deleted && (m.reactions?.length ?? 0) > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {m.reactions!.map((r) => (
                        <button
                          key={r.emoji}
                          type="button"
                          disabled={!canWrite}
                          onClick={() => react(m.id, r.emoji)}
                          title={r.people.join(", ")}
                          aria-pressed={r.mine}
                          aria-label={t("projects.chat_reaction", { emoji: r.emoji, count: r.count })}
                          className={cn("flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs", r.mine ? "border-primary/60 bg-primary/10 text-primary" : "border-border bg-background hover:bg-muted")}
                        >
                          <EmojiGlyph emoji={r.emoji} size={14} /> <span className="tabular-nums">{r.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {canWrite && !m.deleted && editing?.id !== m.id && (
                  <div className={cn("absolute -top-2 right-1 z-10 hidden items-center rounded-md border border-border bg-background shadow-sm group-hover:flex group-focus-within:flex", (picker === m.id || tapped === m.id) && "flex")}>
                    {quickReactions().map((e) => (
                      <button key={e} type="button" className="h-7 w-7 rounded hover:bg-accent" onClick={() => react(m.id, e)} aria-label={t("projects.chat_react_with", { emoji: e })}>
                        <EmojiGlyph emoji={e} size={16} />
                      </button>
                    ))}
                    <span className="relative">
                      <button type="button" className="flex h-7 w-7 items-center justify-center rounded hover:bg-accent" onClick={() => setPicker(m.id)} aria-label={t("projects.chat_react")} title={t("projects.chat_react")}>
                        <Smile className="h-4 w-4" />
                      </button>
                      {picker === m.id && <EmojiPicker className="absolute right-0 top-8" onClose={() => setPicker(null)} onPick={(e) => react(m.id, e)} />}
                    </span>
                    <button type="button" className="flex h-7 w-7 items-center justify-center rounded hover:bg-accent" onClick={() => (setReplyTo(m), setTapped(null))} aria-label={t("projects.chat_reply")} title={t("projects.chat_reply")}>
                      <Reply className="h-4 w-4" />
                    </button>
                    {m.can?.edit && (
                      <button type="button" className="flex h-7 w-7 items-center justify-center rounded hover:bg-accent" onClick={() => setEditing({ id: m.id, body: m.body })} aria-label={t("projects.edit")} title={t("projects.edit")}>
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    {m.can?.delete && (
                      <button type="button" className="flex h-7 w-7 items-center justify-center rounded text-destructive hover:bg-accent" onClick={() => void actions.remove(m.id)} aria-label={t("projects.chat_delete")} title={t("projects.chat_delete")}>
                        <Trash className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
        {typing.length === 1 ? t("projects.chat_typing_one", { name: typing[0]! }) : typing.length > 1 ? t("projects.chat_typing_many", { names: typing.join(", ") }) : ""}
      </p>
      {canWrite && (
        <div className="space-y-1">
          {replyTo && (
            <div className="flex items-center gap-2 rounded-md border-l-2 border-primary bg-muted/60 px-2 py-1 text-xs">
              <span className="min-w-0 flex-1 truncate">
                {t("projects.chat_replying", { name: replyTo.author?.name ?? "—" })}: <span className="text-muted-foreground">{replyTo.body}</span>
              </span>
              <button type="button" onClick={() => setReplyTo(null)} aria-label={t("projects.chat_reply_cancel")} className="rounded p-0.5 hover:bg-accent">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {people ? (
            <MentionInput people={people} onSend={send} files={files} enterSends onTyping={actions.typing} />
          ) : (
            <PlainInput onSend={(text) => send(text, [])} files={files} onTyping={actions.typing} />
          )}
        </div>
      )}
    </div>
  );
}

/** For records: no mentions, pictures and files as in step 134. */
function PlainInput({ onSend, files, onTyping }: { onSend: (body: string) => Promise<boolean>; files?: FileTarget; onTyping?: () => void }) {
  const t = useXT();
  const [text, setText] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const attachments = useFileText({ field, files, value: text, onChange: setText });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (text.trim() && (await onSend(text.trim()))) setText("");
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Input
        ref={field}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value) onTyping?.();
        }}
        placeholder={t("projects.comment_add")}
        aria-label={t("projects.comment_add")}
        maxLength={4000}
        {...attachments.fieldProps}
      />
      {attachments.attach}
      <Button type="submit" size="sm" disabled={!text.trim() || attachments.busy !== null}>
        {t("projects.comment_send")}
      </Button>
    </form>
  );
}
