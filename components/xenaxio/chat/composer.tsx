"use client";

// Step 43, part B: the message box. Enter sends, Shift+Enter breaks the line;
// Markdown shortcuts and a small toolbar; "@" suggests people (and @channel),
// "#" channels; files by paperclip, paste or drop; the draft of each channel
// stays while switching. Step 62: files wait in the box (several, with text)
// and go out together on "send".
import { IconBold, IconCode, IconFile, IconItalic, IconList, IconLoader2, IconMoodSmile, IconPaperclip, IconQuote, IconSend, IconStrikethrough, IconX } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { avoidAssistantButton } from "@/lib/xenaxio/assistant-lift";
import { uploadFile } from "@/lib/xenaxio/chat/api";
import type { ChatClient, Room } from "@/lib/xenaxio/chat/client";
import { type Mention, textContent } from "@/lib/xenaxio/chat/format";
import { useChatStore } from "@/lib/xenaxio/chat/store";
import { suggestionAt } from "@/lib/xenaxio/chat/view";
import { useXT } from "@/lib/xenaxio/i18n";
import { translate } from "@/lib/xenaxio/i18n";
import { toast } from "@/stores/toast-store";
import { cn, formatFileSize } from "@/lib/utils";
import { addPendingFiles, composerKey, MAX_FILE_BYTES, MAX_PENDING_FILES, removePendingFile, takePendingFiles, usePendingFiles } from "@/lib/xenaxio/chat/pending-files";
import { PersonAvatar } from "./common";
import { EmojiPicker } from "./emoji-picker";

/** Drafts per channel and thread, for this page load. */
const drafts = new Map<string, string>();

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
  const [text, setText] = useState(() => drafts.get(key) ?? "");
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState(0);
  const [emoji, setEmoji] = useState(false);
  const [alsoChannel, setAlsoChannel] = useState(false);
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const writable = client.can(room, "send");

  // Keep the floating assistant button off the send button.
  useEffect(() => (writable && box.current ? avoidAssistantButton(box.current) : undefined), [writable]);

  useEffect(() => {
    setText(drafts.get(key) ?? "");
    area.current?.focus();
  }, [key]);
  useEffect(() => {
    drafts.set(key, text);
  }, [key, text]);
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
    for (const m of room.members.values()) if (m.membership === "join" && !byId.has(m.userId)) byId.set(m.userId, { userId: m.userId, displayName: m.displayName });
    byId.delete(client.userId);
    return [...byId.values()];
  }, [colleagues, room.members, client.userId]);

  const suggestion = suggestionAt(text, cursor);
  const options = useMemo<Suggestion[]>(() => {
    if (!suggestion) return [];
    const q = suggestion.query.toLowerCase();
    if (suggestion.trigger === "@") {
      const special: Suggestion[] = ["channel", "here"].filter((s) => s.startsWith(q)).map((s) => ({ key: s, label: `@${s}`, insert: `@${s} ` }));
      const found = people
        .filter((p) => p.displayName.toLowerCase().includes(q) || p.userId.toLowerCase().includes(q))
        .slice(0, 8)
        .map((p) => ({ key: p.userId, label: p.displayName, insert: `@${p.displayName} `, userId: p.userId, hint: colleagues.get(p.userId)?.email }));
      return [...found, ...special];
    }
    return [...client.rooms.values()]
      .filter((r) => r.kind === "channel" && r.membership === "join" && client.roomName(r).toLowerCase().includes(q))
      .slice(0, 8)
      .map((r) => ({ key: r.id, label: `#${client.roomName(r)}`, insert: `#${client.roomName(r)} ` }));
  }, [suggestion, people, colleagues, client]);

  useEffect(() => setSelected(0), [suggestion?.query, suggestion?.trigger]);

  const apply = useCallback(
    (option: Suggestion) => {
      if (!suggestion) return;
      const next = text.slice(0, suggestion.start) + option.insert + text.slice(cursor);
      const pos = suggestion.start + option.insert.length;
      setText(next);
      requestAnimationFrame(() => {
        area.current?.setSelectionRange(pos, pos);
        setCursor(pos);
      });
    },
    [suggestion, text, cursor],
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

  const send = async () => {
    const body = text.trim();
    if ((!body && !pending.length) || busy) return;
    setText("");
    drafts.delete(key);
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
          <button type="button" className={tool} onClick={() => wrap("- ", "", true)} title={t("chat.format_list")} aria-label={t("chat.format_list")}>
            <IconList size={15} />
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
            }
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
          }}
        />
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
          {threadRoot && (
            <label className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={alsoChannel} onChange={(e) => setAlsoChannel(e.target.checked)} />
              {t("chat.also_channel")}
            </label>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => void send()}
            disabled={(!text.trim() && !pending.length) || busy}
            className="flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-xs text-primary-foreground disabled:opacity-40"
            aria-label={t("chat.send")}
          >
            {busy ? <IconLoader2 size={14} className="animate-spin" /> : <IconSend size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
