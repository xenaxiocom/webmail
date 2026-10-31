"use client";

// xenaxio step 78, part D: calls in Rooms, like huddles in Slack. "Call" in a
// channel or a direct message starts the room's call (or joins the running
// one); it runs in a small dock over the chat, so people keep writing, and
// opens to the whole screen. Its message in the chat is a card with the state;
// a call in a direct message rings in the partner's open app. The call lives in
// the app's frame (CallHost), so it goes on in mail, calendar and files too.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Video, X } from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { ChatClient, Room } from "@/lib/xenaxio/chat/client";
import { useChatStore } from "@/lib/xenaxio/chat/store";
import { XenaxioApiError } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";
import { type JoinGrant, meet, type MeetingInfo, meetingLink } from "@/lib/xenaxio/meet";
import { callMessage, callOf, useCallStore } from "@/lib/xenaxio/meet-call";
import { useMeetNavItem } from "@/lib/xenaxio/meet-nav";
import { cn } from "@/lib/utils";
import { useDisplayName } from "../chat/common";
import { MeetLangProvider } from "./lang";

// LiveKit loads only when a call starts, not with the chat.
const MeetingRoom = lazy(() => import("./room").then((m) => ({ default: m.MeetingRoom })));

/** A call in a direct message rings this long. */
const RING_MS = 45_000;
/** While it rings, how often to ask whether the caller has hung up. */
const RING_CHECK_MS = 5_000;

function errorOf(t: ReturnType<typeof useXT>, err: unknown): string {
  const code = err instanceof XenaxioApiError ? err.code : "internal";
  const text = t(`meet.errors.${code}`);
  return text === `meet.errors.${code}` ? t("meet.errors.internal") : text;
}

/** Step 99, part H: starts the room's call or joins the one going on (the call button, voice channels, Ctrl+Shift+H). */
export function useJoinRoomCall(client: ChatClient) {
  const t = useXT();
  const open = useCallStore((s) => s.open);
  return useCallback(
    async (room: Room) => {
      const call = await meet.roomCall(room.id, room.kind === "dm" ? "dm" : "channel");
      // A new call is announced in the room: the card for everyone, push for the partner.
      if (call.created) await client.send(room.id, callMessage(call.code, meetingLink(call.code), t("meet.call_started_text")));
      open({ code: call.code, title: call.title, roomId: room.id });
    },
    [client, open, t],
  );
}

/** "Call" in the header of a channel or a direct message. */
export function CallButton({ client, room, participants = 0 }: { client: ChatClient; room: Room; participants?: number }) {
  const t = useXT();
  const { visible } = useMeetNavItem();
  const join = useJoinRoomCall(client);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!visible || room.kind === "space") return null;
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      await join(room);
    } catch (err) {
      setError(errorOf(t, err));
      setTimeout(() => setError(null), 5000);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="relative">
      <button
        type="button"
        disabled={busy}
        onClick={() => void start()}
        className={cn("flex items-center gap-1 rounded p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-50", participants > 0 && "bg-emerald-500/15 px-2 text-emerald-700 dark:text-emerald-300")}
        title={participants > 0 ? t("meet.call_join_running", { count: participants }) : t("meet.call_button")}
        aria-label={participants > 0 ? t("meet.call_join_running", { count: participants }) : t("meet.call_button")}
      >
        <Phone size={16} />
        {participants > 0 && <span className="text-xs font-semibold tabular-nums">{participants}</span>}
      </button>
      {error && <span className="absolute right-0 top-9 z-30 w-64 rounded-md border border-border bg-popover p-2 text-xs shadow-md">{error}</span>}
    </span>
  );
}

/**
 * The call's card in the chat: running (with how many), or how long it took.
 * In a direct message a call nobody answered (never two people in it) is
 * "missed" for the one called and "not answered" for the caller.
 */
export function CallCard({ code, roomId, title, dm = false, mine = false }: { code: string; roomId: string; title: string; dm?: boolean; mine?: boolean }) {
  const t = useXT();
  const open = useCallStore((s) => s.open);
  const [info, setInfo] = useState<MeetingInfo | null>(null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const next = await meet.info(code);
        if (stop) return;
        setInfo(next);
        // Asked again while the call can still change.
        if (next.state === "open" && !next.finishedAt) timer = setTimeout(() => void load(), 15_000);
      } catch {
        if (!stop) setGone(true);
      }
    };
    void load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [code]);
  const over = gone || (info && (info.state !== "open" || !!info.finishedAt));
  const minutes = info?.startedAt && info.finishedAt ? Math.max(1, Math.round((Date.parse(info.finishedAt) - Date.parse(info.startedAt)) / 60_000)) : null;
  const missed = !!over && dm && !!info && (info.peakParticipants ?? 2) < 2;
  return (
    <div className="mt-1 flex max-w-sm items-center gap-3 rounded-lg border border-border bg-card p-3">
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", missed && !mine ? "bg-red-600 text-white" : over ? "bg-muted text-muted-foreground" : "bg-green-600 text-white")}>
        {over ? <PhoneOff size={18} /> : <Phone size={18} />}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">
          {missed
            ? t(mine ? "meet.call_no_answer" : "meet.call_missed")
            : over
            ? minutes
              ? t("meet.call_ended_after", { minutes })
              : t("meet.call_ended")
            : info?.running
              ? t("meet.call_running", { count: info.participants ?? 0 })
              : t("meet.call_started_text")}
        </p>
      </div>
      {!over && (
        <Button type="button" size="sm" onClick={() => open({ code, title: info?.title || title, roomId })}>
          {t("meet.call_join")}
        </Button>
      )}
    </div>
  );
}

/** A call in a direct message from someone else, a moment ago: ring. */
export function IncomingCall({ client, nameOf }: { client: ChatClient; nameOf: (userId: string) => string }) {
  const t = useXT();
  const active = useCallStore((s) => s.active);
  const open = useCallStore((s) => s.open);
  const seen = useRef(new Set<string>());
  const [ringing, setRinging] = useState<{ id: string; code: string; roomId: string; from: string; title: string } | null>(null);

  const scan = useCallback(() => {
    const now = Date.now();
    for (const room of client.rooms.values()) {
      if (room.kind !== "dm" || room.membership !== "join") continue;
      for (const m of room.timeline.slice(-5)) {
        const call = callOf(m.content);
        if (!call || m.sender === client.userId || seen.current.has(m.id) || now - m.ts > RING_MS) continue;
        seen.current.add(m.id);
        setRinging({ id: m.id, code: call.code, roomId: room.id, from: nameOf(m.sender), title: nameOf(m.sender) });
      }
    }
  }, [client, nameOf]);
  useEffect(() => {
    scan();
    return client.subscribe(scan);
  }, [client, scan]);
  useEffect(() => {
    if (!ringing) return;
    const timer = setTimeout(() => setRinging(null), RING_MS);
    // The caller hung up (or the call ended): stop ringing.
    const check = setInterval(() => {
      meet
        .info(ringing.code)
        .then((info) => {
          if (info.state !== "open" || info.finishedAt) setRinging((r) => (r?.id === ringing.id ? null : r));
        })
        .catch(() => undefined);
    }, RING_CHECK_MS);
    return () => {
      clearTimeout(timer);
      clearInterval(check);
    };
  }, [ringing]);

  if (!ringing || active?.code === ringing.code) return null;
  return (
    <div role="alertdialog" aria-label={t("meet.call_incoming", { name: ringing.from })} className="fixed right-4 top-4 z-50 w-80 rounded-xl border border-border bg-popover p-4 shadow-2xl">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 animate-pulse items-center justify-center rounded-full bg-green-600 text-white">
          <Phone size={20} />
        </span>
        <p className="min-w-0 flex-1 font-medium">{t("meet.call_incoming", { name: ringing.from })}</p>
        <button type="button" onClick={() => setRinging(null)} aria-label={t("meet.close")} className="rounded p-1 hover:bg-accent">
          <X size={16} />
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <Button type="button" className="flex-1" onClick={() => {
          open({ code: ringing.code, title: ringing.title, roomId: ringing.roomId });
          setRinging(null);
        }}>
          <Phone size={16} className="mr-1" />
          {t("meet.call_accept")}
        </Button>
        <Button type="button" variant="outline" className="flex-1" onClick={() => setRinging(null)}>
          {t("meet.call_decline")}
        </Button>
      </div>
    </div>
  );
}

/** The call this browser is in: a dock over the chat, or the whole screen. */
export function CallDock() {
  const t = useXT();
  const active = useCallStore((s) => s.active);
  const expanded = useCallStore((s) => s.expanded);
  const setExpanded = useCallStore((s) => s.setExpanded);
  const close = useCallStore((s) => s.close);
  const [grant, setGrant] = useState<JoinGrant | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let stop = false;
    setGrant(null);
    setError(null);
    meet
      .join(active.code)
      .then((g) => !stop && setGrant(g))
      .catch((err: unknown) => !stop && setError(errorOf(t, err)));
    return () => {
      stop = true;
    };
  }, [active, t]);

  if (!active) return null;
  if (error || !grant) {
    return (
      <div className="fixed inset-x-2 bottom-20 z-50 flex items-center gap-3 rounded-xl border border-border bg-popover p-3 shadow-2xl sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[400px]">
        <Video size={18} className="text-muted-foreground" />
        <p className="min-w-0 flex-1 text-sm">{error ?? t("meet.loading")}</p>
        <button type="button" onClick={close} aria-label={t("meet.close")} className="rounded p-1 hover:bg-accent">
          <X size={16} />
        </button>
      </div>
    );
  }
  return (
    <MeetLangProvider>
      <Suspense fallback={null}>
      <MeetingRoom
        key={active.code}
        code={active.code}
        token={grant.token}
        signalPath={grant.signalPath}
        title={active.title}
        member
        // A call starts with sound only, like a huddle; the camera comes on by button.
        choices={{ name: "", video: false, audio: true, videoDeviceId: "", audioDeviceId: "" }}
        variant={expanded ? "full" : "dock"}
        onResize={setExpanded}
        onLeave={close}
      />
      </Suspense>
    </MeetLangProvider>
  );
}

/**
 * In the app's frame (next to the assistant): the call this browser is in and
 * a call ringing in a direct message, on every page of the app. The chat
 * connection is the one the navigation opens for the unread badge.
 */
export function CallHost() {
  const client = useChatStore((s) => s.client);
  useChatStore((s) => s.version);
  const nameOf = useDisplayName();
  return (
    <>
      <CallDock />
      {client?.ready && !client.signedOut && <IncomingCall client={client} nameOf={nameOf} />}
    </>
  );
}
