"use client";

// Step 43, part B: the message box. Enter sends, Shift+Enter breaks the line;
// Markdown shortcuts and a small toolbar; "@" suggests people (and @channel),
// "#" channels; files by paperclip, paste or drop; the draft of each channel
// stays while switching. Step 62: files wait in the box (several, with text)
// and go out together on "send". Step 87: ":" and a word suggests emoji;
// typed emoticons (":)") go out as emoji. Step 99: code blocks, numbered
// lists, links and code snippets (a long paste offers one, as in Slack).
import { IconBold, IconChartBar, IconClockHour4, IconCode, IconFile, IconFileCode, IconItalic, IconLink, IconList, IconListNumbers, IconLoader2, IconMoodSmile, IconPaperclip, IconQuote, IconSend, IconSourceCode, IconStrikethrough, IconX } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { avoidAssistantButton } from "@/lib/xenaxio/assistant-lift";
import { setThreadFollow, uploadFile } from "@/lib/xenaxio/chat/api";
import { type ChatClient, isPlatformAccount, type Room } from "@/lib/xenaxio/chat/client";
import { searchEmoji } from "@/lib/xenaxio/chat/emoji";
import { type Mention, plainPreview, textContent } from "@/lib/xenaxio/chat/format";
import { useChatStore } from "@/lib/xenaxio/chat/store";
import { suggestionAt } from "@/lib/xenaxio/chat/view";
import { useXT } from "@/lib/xenaxio/i18n";
import { translate } from "@/lib/xenaxio/i18n";
import { toast } from "@/stores/toast-store";
import { cn, formatFileSize } from "@/lib/utils";
import { addPendingFiles, composerKey, MAX_FILE_BYTES, MAX_PENDING_FILES, removePendingFile, takePendingFiles, usePendingFiles } from "@/lib/xenaxio/chat/pending-files";
import { PersonAvatar } from "./common";
import { EmojiPicker } from "./emoji-picker";
import { useChatDialogs } from "./dialogs";
import { type SnippetInput, SnippetDialog } from "./snippet-dialog";
import { TimePicker } from "./later";
import { PollDialog } from "./poll";
import { useChatNotify } from "./notifications";
import { type Command, dndUntil, parseSlash, personArg, slashSuggestions } from "@/lib/xenaxio/chat/slash";
import { useChatLater } from "@/lib/xenaxio/chat/later";
import { isLongPaste, snippetContent, snippetFileFields, snippetFileName } from "@/lib/xenaxio/chat/snippet";


async function imageSize(file: File): Promise<{ w: number; h: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { w: bitmap.width, h: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/** Uploads files and sends each as a message (images show inline); returns those that failed. */
export async function sendFiles(client: ChatClient, roomId: string, files: File[], locale: string, threadRoot?: string): Promise<File[]> {
  const failed: File[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      toast.error(translate(locale, "chat.too_large", { name: file.name }));
      continue;
    }
    try {
      const url = await uploadFile(file, file.name);
      const kind = file.type.startsWith("image/") ? "m.image" : file.type.startsWith("video/") ? "m.video" : file.type.startsWith("audio/") ? "m.audio" : "m.file";
      const size = kind === "m.image" ? await imageSize(file) : null;
      await client.send(
        roomId,
        { msgtype: kind, body: file.name, filename: file.name, url, info: { mimetype: file.type || "application/octet-stream", size: file.size, ...(size ?? {}) } },
        threadRoot ? { threadRoot } : {},
      );
    } catch {
      failed.push(file);
      toast.error(translate(locale, "chat.upload_failed", { name: file.name }));
    }
  }
  return failed;
}

/**
 * Sends a code snippet: one message when it fits, else a text file with the
 * snippet's card. Returns whether it went out.
 */
export async function sendSnippet(client: ChatClient, roomId: string, input: SnippetInput, locale: string, threadRoot?: string): Promise<boolean> {
  const opts = threadRoot ? { threadRoot } : {};
  try {
    const content = snippetContent(input);
    if (content) {
      await client.send(roomId, content, opts);
      return true;
    }
    const name = snippetFileName(input.title, input.language);
    const blob = new Blob([input.code], { type: "text/plain;charset=utf-8" });
    if (blob.size > MAX_FILE_BYTES) {
      toast.error(translate(locale, "chat.too_large", { name }));
      return false;
    }
    const url = await uploadFile(blob, name);
    await client.send(roomId, { msgtype: "m.file", body: name, filename: name, url, info: { mimetype: "text/plain", size: blob.size }, ...snippetFileFields(input) }, opts);
    return true;
  } catch {
    toast.error(translate(locale, "chat.error"));
    return false;
  }
}

/** Puts files into a composer to send with the next message; says what does not fit. */
export function addToComposer(key: string, files: File[], locale: string): void {
  const { tooLarge, overLimit } = addPendingFiles(key, files);
  for (const f of tooLarge) toast.error(translate(locale, "chat.too_large", { name: f.name }));
  if (overLimit) toast.error(translate(locale, "chat.too_many_files", { max: MAX_PENDING_FILES }));
}

/**
 * Office apps put a picture of the copied text next to the text itself; then
 * the text is what the person wants. A screenshot or a copied image has no plain text.
 */
export function pastesAsText(types: readonly string[], files: File[]): boolean {
  return types.includes("text/plain") && types.includes("text/html") && files.every((f) => f.type.startsWith("image/"));
}

interface Suggestion {
  key: string;
  label: string;
  emoji?: string;
  insert: string;
  userId?: string;
  hint?: string;
}

export function Composer({
  room,
  client,
  threadRoot,
  placeholder,
  onEditLast,
  locale,
}: {
  room: Room;
  client: ChatClient;
  threadRoot?: string;
  placeholder: string;
  onEditLast?: () => void;
  locale: string;
}) {
  const t = useXT();
  const key = composerKey(room.id, threadRoot);
  const pending = usePendingFiles(key);
  const colleagues = useChatStore((s) => s.colleagues);
  // Step 99, part E: the draft of each channel and thread is kept on the server.
  const [text, setTextOnly] = useState(() => client.drafts[key]?.text ?? "");
  const keyNow = useRef(key);
  keyNow.current = key;
  /** Every change of the text is the draft of this channel or thread. */
  const setText = useCallback(
    (value: string) => {
      setTextOnly(value);
      client.setDraft(keyNow.current, value);
    },
    [client],
  );
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState(0);
  const [emoji, setEmoji] = useState(false);
  const [alsoChannel, setAlsoChannel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [snippet, setSnippet] = useState<{ code: string; fromBox: boolean } | null>(null);
  const [longPaste, setLongPaste] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [polling, setPolling] = useState(false);
  const [remindAbout, setRemindAbout] = useState<{ eventId: string; preview: string } | null>(null);
  const remind = useChatLater((s) => s.remind);
  const notify = useChatNotify();
  const setView = useChatStore((s) => s.setView);
  const { prompt, confirm } = useChatDialogs();
  const schedule = useChatLater((s) => s.schedule);
  const area = useRef<HTMLTextAreaElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const writable = client.can(room, "send");

  // Keep the floating assistant button off the send button.
  useEffect(() => (writable && box.current ? avoidAssistantButton(box.current) : undefined), [writable]);

  useEffect(() => {
    setTextOnly(client.drafts[key]?.text ?? "");
    area.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when switching the channel or thread
  }, [key]);
  // Grow with the text, up to a limit.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  const people = useMemo<Mention[]>(() => {
    const byId = new Map<string, Mention>();
    for (const c of colleagues.values()) byId.set(c.address, { userId: c.address, displayName: c.displayName });
    for (const m of room.members.values()) if (m.membership === "join" && !isPlatformAccount(m.userId) && !byId.has(m.userId)) byId.set(m.userId, { userId: m.userId, displayName: m.displayName });
    byId.delete(client.userId);
    return [...byId.values()];
  }, [colleagues, room.members, client.userId]);

  const suggestion = suggestionAt(text, cursor);
  const options = useMemo<Suggestion[]>(() => {
    // Step 99, part F: "/" at the start suggests the commands.
    if (!suggestion) return slashSuggestions(text).map((c) => ({ key: c, label: `/${c}`, insert: `/${c} `, hint: t(`chat.slash_${c}`) }));
    const q = suggestion.query.toLowerCase();
    if (suggestion.trigger === "@") {
      // Step 99: @channel / @here only for those the channel lets notify everyone.
      const special: Suggestion[] = (client.can(room, "mentionRoom") ? ["channel", "here"] : []).filter((s) => s.startsWith(q)).map((s) => ({ key: s, label: `@${s}`, insert: `@${s} ` }));
      const found = people
        .filter((p) => p.displayName.toLowerCase().includes(q) || p.userId.toLowerCase().includes(q))
        .slice(0, 8)
        .map((p) => ({ key: p.userId, label: p.displayName, insert: `@${p.displayName} `, userId: p.userId, hint: colleagues.get(p.userId)?.profile?.title ?? colleagues.get(p.userId)?.email }));
      return [...found, ...special];
    }
    if (suggestion.trigger === ":") return searchEmoji(q).map((e) => ({ key: e.emoji, label: `:${e.word}:`, insert: e.emoji, emoji: e.emoji }));
    return [...client.rooms.values()]
      .filter((r) => r.kind === "channel" && r.membership === "join" && client.roomName(r).toLowerCase().includes(q))
      .slice(0, 8)
      .map((r) => ({ key: r.id, label: `#${client.roomName(r)}`, insert: `#${client.roomName(r)} ` }));
  }, [suggestion, people, colleagues, client, room, text, t]);

  useEffect(() => setSelected(0), [suggestion?.query, suggestion?.trigger]);

  const apply = useCallback(
    (option: Suggestion) => {
      if (!suggestion) {
        // A command: the box holds it and waits for its argument.
        setText(option.insert);
        requestAnimationFrame(() => area.current?.setSelectionRange(option.insert.length, option.insert.length));
        return;
      }
      const next = text.slice(0, suggestion.start) + option.insert + text.slice(cursor);
      const pos = suggestion.start + option.insert.length;
      setText(next);
      requestAnimationFrame(() => {
        area.current?.setSelectionRange(pos, pos);
        setCursor(pos);
      });
    },
    [suggestion, text, cursor, setText],
  );

  /** Wraps the selection in Markdown markers (or starts each line with one). */
  const wrap = (before: string, after = before, line = false) => {
    const el = area.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const picked = text.slice(s, e);
    const inserted = line ? picked.split("\n").map((l) => `${before}${l}`).join("\n") || before : `${before}${picked}${after}`;
    const next = text.slice(0, s) + inserted + text.slice(e);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = line ? s + inserted.length : s + before.length + picked.length;
      el.setSelectionRange(pos, pos);
    });
  };

  /** Numbers the selected lines (or starts a numbered list). */
  const numbered = () => {
    const el = area.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const picked = text.slice(s, e);
    const inserted = picked ? picked.split("\n").map((l, i) => `${i + 1}. ${l}`).join("\n") : "1. ";
    setText(text.slice(0, s) + inserted + text.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + inserted.length, s + inserted.length);
    });
  };

  /** A code block around the selection, on lines of its own. */
  const codeBlock = () => {
    const el = area.current;
    if (!el) return;
    const s = el.selectionStart;
    wrap(`${s > 0 && text[s - 1] !== "\n" ? "\n" : ""}` + "```\n", "\n```");
  };

  /** The selected words become a link (Slack's link button). */
  const link = async () => {
    const el = area.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const picked = text.slice(s, e).trim();
    const url = (await prompt({ title: t("chat.format_link"), message: t("chat.link_prompt"), defaultValue: "https://", confirmText: t("chat.link_add") }))?.trim();
    if (!url || !/^https?:\/\/\S+$/i.test(url)) return;
    const inserted = picked ? `[${picked.replace(/[[\]]/g, "")}](${url})` : url;
    setText(text.slice(0, s) + inserted + text.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + inserted.length, s + inserted.length);
    });
  };

  const openSnippet = (code: string, fromBox: boolean) => {
    setLongPaste(null);
    setSnippet({ code, fromBox });
  };

  const submitSnippet = async (input: SnippetInput) => {
    const ok = await sendSnippet(client, room.id, input, locale, threadRoot);
    if (ok && snippet?.fromBox) {
      setText("");
    }
    return ok;
  };

  /** A long paste goes into the box; the snippet takes it out again. */
  const pasteAsSnippet = () => {
    if (longPaste === null) return;
    const at = text.lastIndexOf(longPaste);
    if (at >= 0) setText(text.slice(0, at) + text.slice(at + longPaste.length));
    openSnippet(longPaste, false);
  };

  /** Step 99, part F: runs a slash command; false when it needs the text to stay. */
  const runSlash = async (command: Command, arg: string): Promise<boolean> => {
    const canChange = client.can(room, "state");
    const denied = () => (toast.error(t("chat.no_permission")), false);
    switch (command) {
      case "rename":
        if (!arg) return false;
        if (!canChange) return denied();
        await client.rename(room.id, arg.toLowerCase().replace(/\s+/g, "-").slice(0, 80));
        return true;
      case "topic":
        if (!canChange) return denied();
        await client.setTopic(room.id, arg.slice(0, 500));
        return true;
      case "invite": {
        const found = personArg(arg, people);
        if (!found) return (toast.error(t("chat.slash_no_person")), false);
        await client.invite(room.id, found.person.userId);
        toast.success(t("chat.slash_invited", { name: found.person.displayName }));
        return true;
      }
      case "leave":
        if (room.kind !== "channel") return false;
        if (!(await confirm({ title: t("chat.leave"), message: t("chat.leave_confirm", { name: client.roomName(room) }), confirmText: t("chat.leave") }))) return false;
        await client.leave(room.id);
        setView({ kind: "home" });
        return true;
      case "mute":
        await client.setNotifications(room.id, "none");
        toast.success(t("chat.slash_muted"));
        return true;
      case "unmute":
        await client.setNotifications(room.id, client.defaultLevel === "none" ? "all" : client.defaultLevel);
        toast.success(t("chat.slash_unmuted"));
        return true;
      case "remind": {
        const last = [...room.timeline].reverse().find((m) => !m.id.startsWith("~") && m.type === "m.room.message");
        if (!last) return (toast.error(t("chat.slash_nothing_to_remind")), false);
        setRemindAbout({ eventId: last.id, preview: arg || plainPreview(last.content, 280) });
        return true;
      }
      case "status":
        await client.setStatus(arg || null);
        toast.success(arg ? t("chat.status_saved") : t("chat.status_cleared"));
        return true;
      case "dnd": {
        const until = dndUntil(arg);
        if (until === undefined) return (toast.error(t("chat.slash_dnd_usage")), false);
        const current = notify.settings ?? { dndUntil: null, dndFrom: null, dndTo: null, dndDays: [], emailDigest: true };
        await notify.save({ ...current, dndUntil: until ? until.toISOString() : null });
        toast.success(until ? t("chat.notify_paused") : t("chat.notify_resume"));
        return true;
      }
      case "msg": {
        const found = personArg(arg, people);
        if (!found || !found.rest) return (toast.error(t("chat.slash_no_person")), false);
        const dm = await client.openDirect([found.person.userId]);
        await client.send(dm, textContent(found.rest, people));
        setView({ kind: "room", roomId: dm });
        return true;
      }
      case "snippet":
        openSnippet(arg, false);
        return true;
      case "poll":
        if (threadRoot) return false;
        setPolling(true);
        return true;
      case "search":
        if (!arg) return false;
        setView({ kind: "search", query: arg });
        return true;
      case "shrug":
        // Plain text: the underscores of the shrug are no italics.
        await client.send(room.id, { msgtype: "m.text", body: `${arg} ¯\\_(ツ)_/¯`.trim() }, threadRoot ? { threadRoot } : {});
        return true;
      case "me":
        if (!arg) return false;
        await client.send(room.id, { msgtype: "m.emote", body: arg }, threadRoot ? { threadRoot } : {});
        return true;
    }
  };

  const send = async () => {
    const body = text.trim();
    if ((!body && !pending.length) || busy) return;
    const slash = pending.length ? null : parseSlash(body);
    if (slash && "unknown" in slash) {
      toast.error(t("chat.slash_unknown", { name: slash.unknown }));
      return;
    }
    if (slash) {
      try {
        if (await runSlash(slash.command, slash.arg)) setText("");
        else if (!slash.arg) toast.error(t("chat.slash_needs_arg", { name: slash.command }));
      } catch {
        toast.error(t("chat.error"));
      }
      return;
    }
    setText("");
    setLongPaste(null);
    void client.setTyping(room.id, false);
    // Files first, then the text under them; one that fails goes back into the box.
    const { files: list, done } = takePendingFiles(key);
    if (list.length) {
      setBusy(true);
      try {
        const failed = await sendFiles(client, room.id, list, locale, threadRoot);
        if (failed.length) addPendingFiles(key, failed);
      } finally {
        done();
        setBusy(false);
      }
    }
    if (!body) return;
    const content = textContent(body, people);
    try {
      await client.send(room.id, content, threadRoot ? { threadRoot } : {});
      // Step 99, part E2b: replying follows the thread, as in Slack.
      if (threadRoot) void setThreadFollow(room.id, threadRoot, true).catch(() => undefined);
      if (threadRoot && alsoChannel) await client.send(room.id, { ...content, "com.xenaxio.thread": threadRoot });
    } catch {
      toast.error(t("chat.error"));
    }
  };

  const attach = (list: File[]) => {
    if (!list.length) return;
    addToComposer(key, list, locale);
    requestAnimationFrame(() => area.current?.focus());
  };

  if (!writable) {
    return <div className="mx-5 mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{room.archived ? t("chat.read_only") : t("chat.no_permission")}</div>;
  }

  const tool = "flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground";
  return (
    <div ref={box} className={cn("relative mx-4 mb-4", threadRoot && "mx-3 mb-3")}>
      {options.length > 0 && (
        <div className="absolute bottom-full left-0 z-30 mb-1 w-72 overflow-hidden rounded-md border border-border bg-popover shadow-lg" role="listbox">
          {options.map((o, i) => (
            <button
              key={o.key}
              type="button"
              role="option"
              aria-selected={i === selected}
              onMouseDown={(e) => {
                e.preventDefault();
                apply(o);
              }}
              className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm", i === selected ? "bg-accent" : "hover:bg-accent/60")}
            >
              {o.userId && <PersonAvatar userId={o.userId} name={o.label} size="sm" />}
              {o.emoji && <span className="text-lg leading-none">{o.emoji}</span>}
              <span className="truncate font-medium">{o.label}</span>
              {o.hint && <span className="truncate text-xs text-muted-foreground">{o.hint}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="rounded-lg border border-input bg-background focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
        <div className="flex items-center gap-0.5 border-b border-border/60 px-1.5 py-1">
          <button type="button" className={tool} onClick={() => wrap("**")} title={t("chat.format_bold")} aria-label={t("chat.format_bold")}>
            <IconBold size={15} />
          </button>
          <button type="button" className={tool} onClick={() => wrap("_")} title={t("chat.format_italic")} aria-label={t("chat.format_italic")}>
            <IconItalic size={15} />
          </button>
          <button type="button" className={tool} onClick={() => wrap("~~")} title={t("chat.format_strike")} aria-label={t("chat.format_strike")}>
            <IconStrikethrough size={15} />
          </button>
          <button type="button" className={tool} onClick={() => wrap("`")} title={t("chat.format_code")} aria-label={t("chat.format_code")}>
            <IconCode size={15} />
          </button>
          <button type="button" className={tool} onClick={codeBlock} title={t("chat.format_code_block")} aria-label={t("chat.format_code_block")}>
            <IconSourceCode size={15} />
          </button>
          <button type="button" className={tool} onClick={() => void link()} title={t("chat.format_link")} aria-label={t("chat.format_link")}>
            <IconLink size={15} />
          </button>
          <button type="button" className={tool} onClick={() => wrap("- ", "", true)} title={t("chat.format_list")} aria-label={t("chat.format_list")}>
            <IconList size={15} />
          </button>
          <button type="button" className={tool} onClick={numbered} title={t("chat.format_numbered")} aria-label={t("chat.format_numbered")}>
            <IconListNumbers size={15} />
          </button>
          <button type="button" className={tool} onClick={() => wrap("> ", "", true)} title={t("chat.format_quote")} aria-label={t("chat.format_quote")}>
            <IconQuote size={15} />
          </button>
        </div>
        <textarea
          ref={area}
          value={text}
          rows={1}
          placeholder={placeholder}
          aria-label={placeholder}
          className="block max-h-60 w-full resize-none bg-transparent px-3 py-2 text-sm focus:outline-none"
          onChange={(e) => {
            setText(e.target.value);
            setCursor(e.target.selectionStart);
            void client.setTyping(room.id, e.target.value.trim().length > 0);
          }}
          onSelect={(e) => setCursor((e.target as HTMLTextAreaElement).selectionStart)}
          onBlur={() => void client.setTyping(room.id, false)}
          onPaste={(e) => {
            const pasted = [...e.clipboardData.files];
            if (pasted.length && !pastesAsText([...e.clipboardData.types], pasted)) {
              e.preventDefault();
              attach(pasted);
              return;
            }
            const plain = e.clipboardData.getData("text/plain");
            if (plain && isLongPaste(plain)) setLongPaste(plain);
          }}
          onKeyDown={(e) => {
            if (options.length) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelected((s) => (s + 1) % options.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelected((s) => (s - 1 + options.length) % options.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                apply(options[selected] as Suggestion);
                return;
              }
              if (e.key === "Escape") {
                setCursor(-1);
                return;
              }
            }
            // Slack: Ctrl+Shift+Enter makes a snippet of what is in the box.
            if (e.key === "Enter" && e.shiftKey && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              openSnippet(text, true);
              return;
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
              return;
            }
            if (e.key === "ArrowUp" && !text && onEditLast) {
              e.preventDefault();
              onEditLast();
              return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
              e.preventDefault();
              wrap("**");
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i") {
              e.preventDefault();
              wrap("_");
            }
            // Slack's shortcuts: Ctrl+Shift+X strike, Ctrl+Shift+C code, Ctrl+Alt+Shift+C code block.
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "KeyX") {
              e.preventDefault();
              wrap("~~");
            }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "KeyC") {
              e.preventDefault();
              if (e.altKey) codeBlock();
              else wrap("`");
            }
          }}
        />
        {longPaste !== null && (
          <div className="mx-2.5 mb-2 flex flex-wrap items-center gap-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs" role="status">
            <span className="text-muted-foreground">{t("chat.long_paste")}</span>
            <button type="button" onClick={pasteAsSnippet} className="h-6 rounded bg-primary px-2 text-primary-foreground">
              {t("chat.long_paste_snippet")}
            </button>
            <button type="button" onClick={() => setLongPaste(null)} className="h-6 rounded px-2 hover:bg-accent">
              {t("chat.long_paste_keep")}
            </button>
          </div>
        )}
        {pending.length > 0 && (
          <ul className="flex flex-wrap gap-2 px-2.5 pb-2" aria-label={t("chat.attached_files")}>
            {pending.map((p) => (
              <li key={p.id} className="group relative">
                {p.preview ? (
                  <img src={p.preview} alt={p.file.name} title={p.file.name} className="h-16 w-16 rounded-md border border-border object-cover" />
                ) : (
                  <div className="flex h-16 w-40 items-center gap-2 rounded-md border border-border bg-muted/40 px-2 text-xs" title={p.file.name}>
                    <IconFile size={18} className="shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.file.name}</span>
                      <span className="block text-muted-foreground">{formatFileSize(p.file.size)}</span>
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removePendingFile(key, p.id)}
                  disabled={busy}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-foreground"
                  title={t("chat.remove_file", { name: p.file.name })}
                  aria-label={t("chat.remove_file", { name: p.file.name })}
                >
                  <IconX size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
          <button type="button" className={tool} onClick={() => files.current?.click()} title={t("chat.attach")} aria-label={t("chat.attach")} disabled={busy || pending.length >= MAX_PENDING_FILES}>
            <IconPaperclip size={16} />
          </button>
          <input
            ref={files}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              attach([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          <span className="relative">
            <button type="button" className={tool} onClick={() => setEmoji(true)} title={t("chat.emoji")} aria-label={t("chat.emoji")}>
              <IconMoodSmile size={16} />
            </button>
            {emoji && (
              <EmojiPicker
                className="absolute bottom-9 left-0"
                onClose={() => setEmoji(false)}
                onPick={(e) => {
                  setEmoji(false);
                  const el = area.current;
                  const pos = el?.selectionStart ?? text.length;
                  setText(text.slice(0, pos) + e + text.slice(pos));
                  requestAnimationFrame(() => el?.focus());
                }}
              />
            )}
          </span>
          <button type="button" className={tool} onClick={() => openSnippet("", false)} title={t("chat.snippet_title")} aria-label={t("chat.snippet_title")}>
            <IconFileCode size={16} />
          </button>
          {/* Step 99, part E2b: a poll in the channel (not in threads). */}
          {!threadRoot && (
            <button type="button" className={tool} onClick={() => setPolling(true)} title={t("chat.poll_create")} aria-label={t("chat.poll_create")}>
              <IconChartBar size={16} />
            </button>
          )}
          {threadRoot && (
            <label className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={alsoChannel} onChange={(e) => setAlsoChannel(e.target.checked)} />
              {t("chat.also_channel")}
            </label>
          )}
          <span className="flex-1" />
          <span className="flex">
            <button
              type="button"
              onClick={() => void send()}
              disabled={(!text.trim() && !pending.length) || busy}
              className="flex h-7 items-center gap-1 rounded-l-md bg-primary px-2.5 text-xs text-primary-foreground disabled:opacity-40"
              aria-label={t("chat.send")}
            >
              {busy ? <IconLoader2 size={14} className="animate-spin" /> : <IconSend size={14} />}
            </button>
            {/* Step 99, part E2: Slack's "Schedule for later" (text only; files go now). */}
            <button
              type="button"
              onClick={() => setScheduling(true)}
              disabled={!text.trim() || pending.length > 0 || busy}
              className="flex h-7 items-center rounded-r-md border-l border-primary-foreground/30 bg-primary px-1 text-primary-foreground disabled:opacity-40"
              aria-label={t("chat.send_later")}
              title={t("chat.send_later")}
            >
              <IconClockHour4 size={14} />
            </button>
          </span>
        </div>
      </div>
      {remindAbout && (
        <TimePicker
          title={t("chat.remind")}
          choices={["20m", "1h", "3h", "tomorrow", "monday"]}
          confirm={t("chat.remind_set")}
          onClose={() => setRemindAbout(null)}
          onPick={async (at) => {
            await remind({ roomId: room.id, eventId: remindAbout.eventId, roomName: room.kind === "channel" ? client.roomName(room) : null, preview: remindAbout.preview, remindAt: at.toISOString() });
            toast.success(t("chat.remind_done"));
          }}
        />
      )}
      {polling && <PollDialog client={client} roomId={room.id} onClose={() => setPolling(false)} />}
      {scheduling && (
        <TimePicker
          title={t("chat.send_later")}
          choices={["1h", "tomorrow", "monday"]}
          confirm={t("chat.send_later_set")}
          onClose={() => setScheduling(false)}
          onPick={async (at) => {
            const body = text.trim();
            if (!body) return;
            await schedule({ roomId: room.id, roomName: room.kind === "channel" ? client.roomName(room) : null, threadRoot: threadRoot ?? null, content: textContent(body, people), sendAt: at.toISOString() });
            setText("");
            toast.success(t("chat.send_later_done", { time: at.toLocaleString(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) }));
          }}
        />
      )}
      {snippet && <SnippetDialog initial={{ code: snippet.code }} onClose={() => setSnippet(null)} onSubmit={submitSnippet} />}
    </div>
  );
}
