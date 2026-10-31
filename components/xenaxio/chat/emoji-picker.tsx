"use client";

// Step 43, part B: a small emoji picker for reactions and the composer. A
// curated set with German and English search words; recently used first.
import { useEffect, useMemo, useRef, useState } from "react";
import { EMOJI_CATEGORIES as CATEGORIES } from "@/lib/xenaxio/chat/emoji";
import { useXT } from "@/lib/xenaxio/i18n";
import { cn } from "@/lib/utils";
import { useChatExtras } from "@/lib/xenaxio/chat/extras";
import { companyEmojiUrl } from "@/lib/xenaxio/chat/format";

const RECENT_KEY = "xenaxio.chat.recent-emoji";

function recentEmoji(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]).slice(0, 16) : ["👍", "❤️", "😂", "🎉", "👀", "🙏", "✅", "🔥"];
  } catch {
    return ["👍", "❤️", "😂", "🎉", "👀", "🙏", "✅", "🔥"];
  }
}

function remember(emoji: string): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([emoji, ...recentEmoji().filter((e) => e !== emoji)].slice(0, 16)));
  } catch {
    // Private window: no memory, nothing breaks.
  }
}

/** The quick reactions shown directly in a message's hover bar. */
export function quickReactions(): string[] {
  return recentEmoji().slice(0, 3);
}

export function EmojiPicker({ onPick, onClose, className }: { onPick: (emoji: string) => void; onClose: () => void; className?: string }) {
  const t = useXT();
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    const outside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, [onClose]);

  // Step 99, part H: the company's own emoji, as ":name:".
  const company = useChatExtras((s) => s.emoji);
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const own = company.map((e) => `:${e.name}:`);
    if (q) {
      const hits = CATEGORIES.flatMap((c) => c.items).filter(([, words]) => words.includes(q)).map(([e]) => e);
      return [{ key: "search", label: t("chat.emoji_search"), items: [...own.filter((e) => e.includes(q)), ...hits] }];
    }
    return [
      { key: "recent", label: t("chat.emoji_recent"), items: recentEmoji() },
      ...(own.length ? [{ key: "company", label: t("chat.emoji_company"), items: own }] : []),
      ...CATEGORIES.map((c) => ({ key: c.key, label: t(`chat.emoji_${c.key}`), items: c.items.map(([e]) => e) })),
    ];
  }, [query, t, company]);

  const pick = (emoji: string) => {
    remember(emoji);
    onPick(emoji);
  };

  return (
    <div ref={ref} role="dialog" aria-label={t("chat.emoji")} className={cn("z-50 w-72 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg", className)}>
      <div className="p-2 border-b border-border">
        <input
          ref={input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("chat.emoji_search")}
          className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const first = sections[0]?.items[0];
              if (first) pick(first);
            }
          }}
        />
      </div>
      <div className="max-h-64 overflow-y-auto p-2 space-y-2">
        {sections.map((s) =>
          s.items.length ? (
            <div key={s.key}>
              <div className="text-[11px] font-medium text-muted-foreground px-1 mb-1">{s.label}</div>
              <div className="grid grid-cols-8 gap-0.5">
                {s.items.map((e) => (
                  <button key={`${s.key}-${e}`} type="button" onClick={() => pick(e)} className="flex h-8 w-8 items-center justify-center rounded hover:bg-accent text-lg leading-none" aria-label={e} title={companyEmojiUrl(e) ? e : undefined}>
                    <EmojiGlyph emoji={e} />
                  </button>
                ))}
              </div>
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

/** A Unicode emoji, or the company's own (":name:") as its picture. */
export function EmojiGlyph({ emoji, size = 20 }: { emoji: string; size?: number }) {
  const url = companyEmojiUrl(emoji);
  return url ? <img src={url} alt={emoji} width={size} height={size} className="inline-block object-contain" /> : <>{emoji}</>;
}
