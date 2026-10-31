"use client";

// Step 43, part B: small pieces the chat components share.
import { format, isToday, isYesterday } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { useLocale } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { withBasePath } from "@/lib/browser-navigation";
import { assistantAvailable } from "@/lib/xenaxio/assistant";
import { XENAXIO_BFF } from "@/lib/xenaxio/bff";
import type { ChatClient, PersonInfo } from "@/lib/xenaxio/chat/client";
import { chatLinkTarget } from "@/lib/xenaxio/chat/format";
import { type Colleague, useChatStore } from "@/lib/xenaxio/chat/store";
import { toast } from "@/stores/toast-store";
import { useXT } from "@/lib/xenaxio/i18n";
import { cn } from "@/lib/utils";

export function useDateLocale() {
  return useLocale().startsWith("de") ? de : enUS;
}

/** "09:41", and labels for day dividers ("Heute", "Gestern", "Montag, 26. Oktober"). */
export function useChatTime() {
  const locale = useDateLocale();
  const t = useXT();
  const time = useCallback((ts: number) => format(ts, "HH:mm", { locale }), [locale]);
  const full = useCallback((ts: number) => format(ts, "PPPp", { locale }), [locale]);
  const day = useCallback(
    (ts: number) => (isToday(ts) ? t("chat.today") : isYesterday(ts) ? t("chat.yesterday") : format(ts, "EEEE, d. MMMM yyyy", { locale })),
    [locale, t],
  );
  const relative = useCallback((ts: number) => (isToday(ts) ? time(ts) : isYesterday(ts) ? `${t("chat.yesterday")} ${time(ts)}` : format(ts, "d. MMM HH:mm", { locale })), [locale, t, time]);
  return { time, full, day, relative };
}

export function useColleague(userId: string): Colleague | undefined {
  return useChatStore((s) => s.colleagues.get(userId));
}

/** Picture of a person: the company's profile picture (step 41) by e-mail, initials otherwise. */
export function PersonAvatar({ userId, name, size = "md", className, presence }: { userId: string; name: string; size?: "sm" | "md" | "lg"; className?: string; presence?: PersonInfo["presence"] }) {
  const colleague = useColleague(userId);
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <Avatar name={colleague?.displayName ?? name} email={colleague?.email} size={size} disableFavicon />
      {presence && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background",
            presence === "online" ? "bg-green-500" : presence === "unavailable" ? "bg-amber-400" : "bg-muted-foreground/40",
          )}
        />
      )}
    </span>
  );
}

export function displayNameOf(client: ChatClient, colleagues: Map<string, Colleague>, userId: string): string {
  return colleagues.get(userId)?.displayName ?? client.displayName(userId);
}

/** Name of a person in the chat, from the company directory first. */
export function useDisplayName() {
  const client = useChatStore((s) => s.client);
  const colleagues = useChatStore((s) => s.colleagues);
  return useCallback((userId: string) => (client ? displayNameOf(client, colleagues, userId) : userId), [client, colleagues]);
}

export function formatSize(bytes: number | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Presence dot colour for a person (online, away, offline). */
export function presenceOf(client: ChatClient | null, userId: string): PersonInfo["presence"] {
  return client?.people.get(userId)?.presence ?? "offline";
}

/** A link others can open: the chat page with the channel and message. */
export function messageLink(locale: string, roomId: string, eventId: string): string {
  const prefix = typeof window === "undefined" ? "" : window.location.origin;
  return `${prefix}${withBasePath(`/${locale}/chat/`)}?room=${encodeURIComponent(roomId)}&event=${encodeURIComponent(eventId)}`;
}

/** Step 99: a link others can open to the channel itself. */
export function channelLink(locale: string, roomId: string): string {
  const prefix = typeof window === "undefined" ? "" : window.location.origin;
  return `${prefix}${withBasePath(`/${locale}/chat/`)}?room=${encodeURIComponent(roomId)}`;
}

/**
 * Step 99: a click in a message on a channel ("#name") or on a link to this
 * chat opens the channel here, like in Slack. An open channel I am not in is
 * joined first; a closed one says it is not available.
 */
export function useChatLinkClick(): (e: React.MouseEvent) => void {
  const t = useXT();
  const client = useChatStore((s) => s.client);
  const setView = useChatStore((s) => s.setView);
  const setPanel = useChatStore((s) => s.setPanel);
  const setFocus = useChatStore((s) => s.setFocus);
  return useCallback(
    (e: React.MouseEvent) => {
      if (!client || e.defaultPrevented) return;
      const el = e.target as HTMLElement;
      let target: { roomId: string; eventId: string | null } | null = null;
      const channel = el.closest("[data-room]");
      if (channel) target = { roomId: channel.getAttribute("data-room") ?? "", eventId: null };
      else {
        const a = el.closest("a[href]") as HTMLAnchorElement | null;
        // Ctrl/Cmd/Shift-click keeps the browser's new tab.
        if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        target = chatLinkTarget(a.href, window.location.origin);
      }
      if (!target?.roomId) return;
      e.preventDefault();
      const { eventId } = target;
      const open = (roomId: string) => {
        setView({ kind: "room", roomId });
        setPanel(null);
        if (eventId) setFocus({ roomId, eventId });
      };
      if (client.rooms.get(target.roomId)?.membership === "join") {
        open(target.roomId);
        return;
      }
      void client.openChannel(target.roomId).then(
        (roomId) => (roomId ? open(roomId) : toast.error(t("chat.channel_unavailable"))),
        () => toast.error(t("chat.channel_unavailable")),
      );
    },
    [client, setView, setPanel, setFocus, t],
  );
}

/** Step 43, part D: whether the AI assistant is on for this person (its chat buttons show only then). */
export function useAssistant(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (XENAXIO_BFF) void assistantAvailable().then(setAvailable, () => setAvailable(false));
  }, []);
  return available;
}
