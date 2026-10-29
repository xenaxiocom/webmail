// xenaxio step 78: video meetings. The platform hands out a short-lived token
// for the media server (LiveKit); the browser connects its signal through the
// platform's address (/api/meet/rtc) and sends video and sound straight to the
// media server. Guests (no account) knock and wait in the lobby.
import { apiFetch, withBasePath } from "@/lib/browser-navigation";
import { XenaxioApiError } from "@/lib/xenaxio/api";

export type MeetingState = "open" | "ended" | "expired" | "unavailable";

export interface MeetingInfo {
  title: string;
  company: string;
  state: MeetingState;
  guests: boolean;
  /** The viewer is signed in as someone of the company: enters directly. */
  member: boolean;
  /** Step 78, part D: whether it runs now, who is in it, when it ran (a call's card in the chat). */
  running?: boolean;
  participants?: number;
  /** The most people at the same time (1: a call nobody answered). */
  peakParticipants?: number;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface MeetingView {
  code: string;
  title: string;
  path: string;
  source: string;
  expiresAt: string;
  createdAt: string;
  running: boolean;
  participants: number;
  ended: boolean;
}

export interface JoinGrant {
  token: string;
  signalPath: string;
  identity: string;
  title: string;
}

export type GuestState = "waiting" | "admitted" | "denied" | "removed" | "ended";

export interface MeetSettings {
  available: boolean;
  allowed: boolean;
  enabled: boolean;
  guests: boolean;
  maxParticipants: number;
  maxHours: number;
}

export interface LobbyGuest {
  id: string;
  name: string;
  since: string;
}

export interface MeetingPerson {
  identity: string;
  name: string;
  joinedAt: string;
  speaking: boolean;
}

async function call<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(path, {
      method,
      credentials: "same-origin",
      headers: { Accept: "application/json", "x-xenaxio-csrf": "1", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new XenaxioApiError(0, "network");
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new XenaxioApiError(
      res.status,
      typeof data.error === "string" ? data.error : "internal",
      data.details as Record<string, unknown> | undefined,
      data.issues as { path: string; message: string }[] | undefined,
    );
  }
  return data as T;
}

// Whole paths, so the Lite build check (scripts/lite/lib.mjs) sees each one.
const MEET = "/api/meet";
const ADMIN = "/api/admin/meetings";
const at = (code: string) => `${MEET}/${encodeURIComponent(code)}`;

export const meet = {
  // The employee.
  status: () => call<{ enabled: boolean; guests: boolean; maxParticipants: number }>("GET", `${MEET}/status`),
  mine: () => call<{ meetings: MeetingView[] }>("GET", MEET).then((r) => r.meetings),
  /** `until`: the end of the calendar event the meeting belongs to (the link works a day longer). */
  create: (title: string, until?: Date) => call<MeetingView>("POST", MEET, { title, ...(until ? { until: until.toISOString() } : {}) }),
  /** Part D: the call of a chat room (the running one, or a new one). */
  roomCall: (roomId: string, kind: "channel" | "dm") =>
    call<MeetingView & { created: boolean }>("POST", `/api/chat/rooms/${encodeURIComponent(roomId)}/call`, { kind }),
  // Everyone (guests too).
  info: (code: string) => call<MeetingInfo>("GET", at(code)),
  join: (code: string) => call<JoinGrant>("POST", `${at(code)}/join`),
  knock: (code: string, name: string) => call<{ guestId: string; key: string; state: "waiting" }>("POST", `${at(code)}/guests`, { name }),
  guestStatus: (code: string, guestId: string, key: string) =>
    call<{ state: GuestState } & Partial<JoinGrant>>("POST", `${at(code)}/guests/${encodeURIComponent(guestId)}/status`, { key }),
  // People of the company in the meeting.
  lobby: (code: string) => call<{ guests: LobbyGuest[] }>("GET", `${at(code)}/lobby`).then((r) => r.guests),
  decide: (code: string, guestId: string, admit: boolean) => call<{ ok: true }>("POST", `${at(code)}/lobby/${encodeURIComponent(guestId)}`, { admit }),
  people: (code: string) => call<{ participants: MeetingPerson[] }>("GET", `${at(code)}/participants`).then((r) => r.participants),
  remove: (code: string, identity: string) => call<{ ok: true }>("POST", `${at(code)}/participants/remove`, { identity }),
  mute: (code: string, identity: string) => call<{ ok: true }>("POST", `${at(code)}/participants/mute`, { identity }),
  end: (code: string) => call<{ ok: true }>("POST", `${at(code)}/end`),
  // The company admin.
  settings: () => call<MeetSettings>("GET", ADMIN),
  saveSettings: (change: { enabled?: boolean; guests?: boolean }) => call<MeetSettings>("PUT", ADMIN, change),
};

/** The meeting's code from the address (/meet/<code>, also under a locale prefix). */
export function meetingCode(pathname: string): string | null {
  const m = /\/meet\/([a-z0-9]{10,32})\/?$/.exec(pathname);
  return m ? (m[1] as string) : null;
}

/** The code of a Xenaxio Meeting link (any of the platform's addresses), or null for other links. */
export function meetingCodeOfLink(uri: string | null | undefined): string | null {
  if (!uri) return null;
  try {
    const url = new URL(uri);
    return url.protocol === "https:" || url.hostname === "localhost" ? meetingCode(url.pathname) : null;
  } catch {
    return null;
  }
}

/** The full link of a meeting, to copy and send. */
export function meetingLink(code: string, origin = typeof location === "undefined" ? "" : location.origin): string {
  return `${origin}${withBasePath(`/meet/${code}`)}`;
}

/** Where the browser connects its signal: the platform's own address, as WebSocket. */
export function signalUrl(signalPath: string, href = typeof location === "undefined" ? "http://localhost/" : location.href): string {
  const url = new URL(withBasePath(signalPath), href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href.replace(/\/$/, "");
}

/** A guest's visit survives a reload of the page (same tab only). */
const GUEST_KEY = "xenaxio-meet-guest";

export interface GuestVisit {
  code: string;
  guestId: string;
  key: string;
  name: string;
}

export function loadGuestVisit(code: string): GuestVisit | null {
  try {
    const raw = sessionStorage.getItem(GUEST_KEY);
    const v = raw ? (JSON.parse(raw) as GuestVisit) : null;
    return v && v.code === code ? v : null;
  } catch {
    return null;
  }
}

export function saveGuestVisit(v: GuestVisit | null): void {
  try {
    if (v) sessionStorage.setItem(GUEST_KEY, JSON.stringify(v));
    else sessionStorage.removeItem(GUEST_KEY);
  } catch {
    // Private mode: the visit only lasts until the page is reloaded.
  }
}

/** Who someone is by their identity: an employee ("u:…") or a guest ("g:…"). */
export function isGuest(identity: string): boolean {
  return identity.startsWith("g:");
}
