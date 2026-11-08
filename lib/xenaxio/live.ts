// xenaxio step 142, part B: the platform's live channel. One EventSource per tab
// (`/api/live`), shared by every part of the page that listens: boards, the task panel,
// chats and the bell. An event carries ids only; whoever listens reads the changed thing
// again through the API. After a lost connection the browser reconnects with the last
// event id; when the platform cannot catch up it says "reset" and everyone reads again.
import { useEffect, useRef, useState } from "react";
import { apiFetch, withBasePath } from "@/lib/browser-navigation";

// Whole paths, so the Lite build check (scripts/lite/lib.mjs) sees each one.
const LIVE = "/api/live";
const LIVE_TYPING = "/api/live/typing";
const LIVE_VIEWING = "/api/live/viewing";

export type LiveKind = "object" | "columns" | "task" | "message" | "typing" | "notice" | "read";

export interface LiveEvent {
  k: LiveKind | "reset";
  o?: string;
  task?: string;
  a?: string;
  by?: string;
  name?: string;
}

type Listener = (e: LiveEvent) => void;

const listeners = new Set<Listener>();
let source: EventSource | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let delay = 2000;
let open = false;
const openWatchers = new Set<(open: boolean) => void>();

function setOpen(next: boolean) {
  if (open === next) return;
  open = next;
  for (const w of openWatchers) w(next);
}

function emit(e: LiveEvent) {
  for (const l of [...listeners]) {
    try {
      l(e);
    } catch {
      // one listener's mistake does not stop the others
    }
  }
}

function connect() {
  if (source || typeof window === "undefined" || typeof EventSource === "undefined") return;
  const es = new EventSource(withBasePath(LIVE), { withCredentials: true });
  source = es;
  let wasOpen = false;
  es.addEventListener("hello", () => {
    // A reconnect after a gap: what happened meanwhile may be missing without a usable id.
    if (wasOpen) emit({ k: "reset" });
    wasOpen = true;
    delay = 2000;
    setOpen(true);
  });
  es.addEventListener("live", (m) => {
    try {
      emit(JSON.parse((m as MessageEvent<string>).data) as LiveEvent);
    } catch {
      // not ours
    }
  });
  es.addEventListener("reset", () => emit({ k: "reset" }));
  es.onerror = () => {
    setOpen(false);
    // The browser retries by itself unless the stream was refused (signed out, too many tabs).
    if (es.readyState !== EventSource.CLOSED) return;
    es.close();
    if (source === es) source = null;
    if (listeners.size > 0 && !retry) {
      retry = setTimeout(() => {
        retry = null;
        if (listeners.size > 0) connect();
      }, delay);
      delay = Math.min(delay * 2, 60_000);
    }
  };
}

function disconnect() {
  if (retry) clearTimeout(retry);
  retry = null;
  source?.close();
  source = null;
  setOpen(false);
}

/** Listens to every live event of the person; returns the function that stops. */
export function subscribeLive(listener: Listener): () => void {
  listeners.add(listener);
  connect();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) disconnect();
  };
}

/** Whether the channel is open now (the bell asks the server itself only when it is not). */
export function liveOpen(): boolean {
  return open;
}

export function onLiveOpen(watch: (open: boolean) => void): () => void {
  openWatchers.add(watch);
  return () => openWatchers.delete(watch);
}

/** Calls `handler` for matching events; the latest handler is used without subscribing again. */
export function useLive(handler: Listener, enabled = true): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    return subscribeLive((e) => ref.current(e));
  }, [enabled]);
}

/**
 * Calls `fn` once shortly after a burst of events (several colleagues, one move sends a
 * few) — and not while a card is being dragged (`busy`), so it does not jump from the hand.
 */
export function useDebounced(fn: () => void, busy: () => boolean = () => false, ms = 300): () => void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const run = useRef(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(function tick() {
      if (busyRef.current()) {
        timer.current = setTimeout(tick, ms);
        return;
      }
      timer.current = null;
      fnRef.current();
    }, ms);
  });
  return run.current;
}

async function post(path: string, body: unknown): Promise<void> {
  await apiFetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json", "x-xenaxio-csrf": "1" },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

const lastTyping = new Map<string, number>();

/** "… is typing" for the others; at most every 3 seconds per chat. */
export function sendTyping(objectId: string, taskId?: string | null): void {
  const key = `${objectId}|${taskId ?? ""}`;
  const now = Date.now();
  if ((lastTyping.get(key) ?? 0) + 3000 > now) return;
  lastTyping.set(key, now);
  void post(LIVE_TYPING, { objectId, ...(taskId ? { taskId } : {}) });
}

/** While the task is open: no push to the phone for its new messages (every minute again). */
export function useViewing(objectId: string, taskId: string | null): void {
  useEffect(() => {
    if (!taskId) return;
    const send = () => document.visibilityState === "visible" && void post(LIVE_VIEWING, { objectId, taskId });
    send();
    const timer = setInterval(send, 60_000);
    document.addEventListener("visibilitychange", send);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", send);
    };
  }, [objectId, taskId]);
}

/** Names of colleagues typing in this chat right now (each disappears after 5 seconds). */
export function useTyping(objectId: string, taskId: string | null): string[] {
  const [names, setNames] = useState<Record<string, { name: string; until: number }>>({});
  useLive((e) => {
    if (e.o !== objectId || (e.task ?? null) !== taskId || !e.by) return;
    if (e.k === "typing" && e.name) {
      const by = e.by;
      setNames((cur) => ({ ...cur, [by]: { name: e.name!, until: Date.now() + 5000 } }));
    } else if (e.k === "message" && e.a === "new") {
      // The message arrived: they stopped typing.
      setNames((cur) => {
        if (!cur[e.by!]) return cur;
        const next = { ...cur };
        delete next[e.by!];
        return next;
      });
    }
  });
  useEffect(() => {
    if (Object.keys(names).length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setNames((cur) => {
        const next = Object.fromEntries(Object.entries(cur).filter(([, v]) => v.until > now));
        return Object.keys(next).length === Object.keys(cur).length ? cur : next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [names]);
  return Object.values(names).map((v) => v.name);
}

/** Tests: forget the shared connection. */
export function resetLiveForTests(): void {
  disconnect();
  listeners.clear();
  openWatchers.clear();
  lastTyping.clear();
  delay = 2000;
}
