// xenaxio step 78: video meetings. The platform hands out a short-lived token
// for the media server (LiveKit); the browser connects its signal through the
// platform's address (/api/meet/rtc) and sends video and sound straight to the
// media server. Guests (no account) knock and wait in the lobby.
import { apiFetch, withBasePath } from "@/lib/browser-navigation";
import { XenaxioApiError } from "@/lib/xenaxio/api";
import { tapStats } from "@/lib/xenaxio/stats";

export type MeetingState = "open" | "ended" | "expired" | "unavailable";
/** Step 79: a webinar is a meeting with a stage and viewers who only watch. */
export type MeetingKind = "meeting" | "webinar";
/** In a meeting everyone of the company is a "member"; in a webinar hosts, presenters and viewers. */
export type MeetingRole = "member" | "guest" | "host" | "presenter" | "viewer";

export interface MeetingInfo {
  title: string;
  kind?: MeetingKind;
  /** Step 79, part B: a webinar's page (also where viewers register). */
  webinar?: WebinarPage;
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
  /** Step 92: the company's background, only for its own people. */
  background?: MeetBackground;
  /** Step 90: the meeting is being recorded now (guests see it before they enter). */
  recording?: boolean;
}

/** Step 90: an earlier recording of a meeting, as its organizer and the people in it see it. */
export interface MeetingRecording {
  id: string;
  /** recording → processing (into the organizer's Files) → stored, or failed. */
  status: "recording" | "processing" | "stored" | "failed";
  startedAt: string;
  stoppedAt: string | null;
  /** In the organizer's Files, e.g. "Meetings/2026-10-30 14-42 Kick-off". */
  folder: string | null;
  speakers: string[];
  error: string | null;
  /** Step 90, part B: the transcript by speaker (off: no AI or transcription off; deleted: its file was deleted). */
  transcript?: { status: TranscriptStatus; error: string | null };
}

export type TranscriptStatus = "none" | "pending" | "running" | "done" | "failed" | "off" | "deleted";

/** Step 90, part B: a recording's transcript, one paragraph per turn. */
export interface MeetingTranscript {
  recordingId: string;
  meeting: string;
  startedAt: string;
  stoppedAt: string | null;
  timeZone: string;
  language: string | null;
  lines: { at: string; speaker: string; text: string }[];
}

/** Step 90, part D: a recording as the company's admin sees it. */
export interface CompanyRecording {
  id: string;
  meeting: string;
  organizer: string | null;
  startedAt: string;
  stoppedAt: string | null;
  status: MeetingRecording["status"];
  transcript: TranscriptStatus;
  folder: string | null;
  bytes: number;
  speakers: string[];
}

/** Step 90: whether the meeting records now, and who may switch it. */
export interface RecordingState {
  recording: boolean;
  since: string | null;
  /** The company may record and the installation can. */
  available: boolean;
  /** This person started the meeting: they switch recording on and off. */
  canControl: boolean;
  recordings: MeetingRecording[];
}

export interface WebinarPage {
  description: string;
  startsAt: string | null;
  durationMinutes: number | null;
  registration: boolean;
  hosts: string[];
  imprintUrl: string | null;
  privacyUrl: string | null;
}

/** Step 79, part B: what a host sets for a webinar. */
export interface WebinarFields {
  startsAt: Date;
  durationMinutes: number;
  description: string;
  registration: boolean;
}

/** Step 79, part B: who registered, who came and for how long. */
export interface WebinarRegistration {
  id: string;
  name: string;
  email: string;
  registeredAt: string;
  cancelledAt: string | null;
  joinedAt: string | null;
  minutes: number;
}

export interface MeetingView {
  code: string;
  title: string;
  kind?: MeetingKind;
  startsAt?: string | null;
  durationMinutes?: number | null;
  description?: string;
  registration?: boolean;
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
  kind?: MeetingKind;
  role?: MeetingRole;
}

/** Step 79: for hosts — who is on the stage, who raised a hand, how many watch. */
export interface WebinarStage {
  hosts: { identity: string; name: string }[];
  presenters: { identity: string; name: string; present: boolean }[];
  hands: { identity: string; name: string; since: string }[];
  viewers: number;
}

/** Step 79, part C: questions, polls and chat of a webinar. */
export type ChatMode = "all" | "hosts" | "off";
export interface WebinarQuestion {
  id: string;
  name: string | null;
  text: string;
  votes: number;
  answered: boolean;
  hidden: boolean;
  createdAt: string;
}
export interface WebinarPoll {
  id: string;
  question: string;
  options: string[];
  results: "all" | "hosts";
  closed: boolean;
  counts?: number[];
}
export interface WebinarChatMessage {
  id: string;
  identity: string;
  name: string;
  text: string;
  toHosts: boolean;
  at: string;
}
export interface WebinarLiveState {
  chatMode: ChatMode;
  anonymousQuestions: boolean;
  host: boolean;
  questions: WebinarQuestion[];
  polls: WebinarPoll[];
  chat: WebinarChatMessage[];
  myVotes: { questions: string[]; polls: Record<string, number> };
}

/** A guest proves its visit with the key only its browser has; a registered viewer with the key of the personal link. */
export type GuestKey = { guestId: string; key: string } | { registrationId: string; key: string };

export type GuestState = "waiting" | "admitted" | "denied" | "removed" | "ended";

export interface MeetSettings {
  available: boolean;
  allowed: boolean;
  enabled: boolean;
  guests: boolean;
  maxParticipants: number;
  maxHours: number;
  /** Step 92: the company's background picture for meetings; null without one. */
  background: MeetBackground | null;
  /** Step 90: the installation can record meetings' sound. */
  recordingAvailable?: boolean;
  /** Step 90: the operator has not forbidden recording for the company. */
  recordingAllowed?: boolean;
  /** Step 90: the admin's switch (on by default). */
  recording?: boolean;
}

/** Step 92: the company's picture behind employees' cameras (for its own people only). */
export interface MeetBackground {
  /** Path on the platform, versioned for caching. */
  url: string;
  /** Employees who have not chosen a background of their own start with it. */
  default: boolean;
  /** Step 93: a still picture, an animation (GIF, MP4, WebM) or a 360° panorama; missing — a picture. */
  kind?: "image" | "animation" | "panorama";
  /** Step 93: the file's type, e.g. image/gif or video/mp4. */
  contentType?: string;
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

async function call<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
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

/** Step 92: a picture goes up as the raw file. */
async function upload<T>(method: "PUT", path: string, body: Blob): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(path, {
      method,
      credentials: "same-origin",
      headers: { Accept: "application/json", "x-xenaxio-csrf": "1", "Content-Type": body.type || "application/octet-stream" },
      body,
    });
  } catch {
    throw new XenaxioApiError(0, "network");
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new XenaxioApiError(res.status, typeof data.error === "string" ? data.error : "internal", data.details as Record<string, unknown> | undefined);
  return data as T;
}

// Whole paths, so the Lite build check (scripts/lite/lib.mjs) sees each one.
const MEET = "/api/meet";
const ADMIN = "/api/admin/meetings";
const at = (code: string) => `${MEET}/${encodeURIComponent(code)}`;

export const meet = {
  // The employee.
  status: () =>
    call<{ enabled: boolean; guests: boolean; maxParticipants: number; webinars?: boolean; maxViewers?: number; background?: MeetBackground | null }>("GET", `${MEET}/status`),
  mine: () => call<{ meetings: MeetingView[] }>("GET", MEET).then((r) => r.meetings),
  /** `until`: the end of the calendar event the meeting belongs to (the link works a day longer). */
  create: (title: string, until?: Date, kind?: MeetingKind, webinar?: WebinarFields) =>
    call<MeetingView>("POST", MEET, {
      title,
      ...(until ? { until: until.toISOString() } : {}),
      ...(kind && kind !== "meeting" ? { kind } : {}),
      ...(webinar
        ? {
            startsAt: webinar.startsAt.toISOString(),
            durationMinutes: webinar.durationMinutes,
            description: webinar.description,
            registration: webinar.registration,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }
        : {}),
    }),
  /** Part D: the call of a chat room (the running one, or a new one). */
  roomCall: (roomId: string, kind: "channel" | "dm") =>
    call<MeetingView & { created: boolean }>("POST", `/api/chat/rooms/${encodeURIComponent(roomId)}/call`, { kind }),
  // Everyone (guests too).
  info: (code: string) => call<MeetingInfo>("GET", at(code)),
  join: (code: string) => call<JoinGrant>("POST", `${at(code)}/join`).then(tapStats("meeting-join")),
  knock: (code: string, name: string) => call<{ guestId: string; key: string; state: "waiting" | "admitted" }>("POST", `${at(code)}/guests`, { name }),
  guestStatus: (code: string, guestId: string, key: string) =>
    call<{ state: GuestState } & Partial<JoinGrant>>("POST", `${at(code)}/guests/${encodeURIComponent(guestId)}/status`, { key }),
  // People of the company in the meeting.
  lobby: (code: string) => call<{ guests: LobbyGuest[] }>("GET", `${at(code)}/lobby`).then((r) => r.guests),
  decide: (code: string, guestId: string, admit: boolean) => call<{ ok: true }>("POST", `${at(code)}/lobby/${encodeURIComponent(guestId)}`, { admit }),
  people: (code: string) => call<{ participants: MeetingPerson[] }>("GET", `${at(code)}/participants`).then((r) => r.participants),
  remove: (code: string, identity: string) => call<{ ok: true }>("POST", `${at(code)}/participants/remove`, { identity }),
  mute: (code: string, identity: string) => call<{ ok: true }>("POST", `${at(code)}/participants/mute`, { identity }),
  end: (code: string) => call<{ ok: true }>("POST", `${at(code)}/end`),
  // Step 90: recording the meeting's sound (only the one who started it switches it).
  recording: (code: string) => call<RecordingState>("GET", `${at(code)}/recording`),
  startRecording: (code: string) => call<RecordingState>("POST", `${at(code)}/recording`),
  stopRecording: (code: string) => call<RecordingState>("DELETE", `${at(code)}/recording`),
  // Step 90, part B: the transcript (the organizer and the people in it); the organizer asks again.
  transcript: (recordingId: string) => call<MeetingTranscript>("GET", `${MEET}/recordings/${encodeURIComponent(recordingId)}/transcript`),
  retryTranscript: (recordingId: string) => call<{ ok: true }>("POST", `${MEET}/recordings/${encodeURIComponent(recordingId)}/transcript`),
  // Step 79: webinars. Viewers raise a hand and react through the platform.
  hand: (code: string, raised: boolean, guest?: GuestKey | null) => call<{ ok: true }>("POST", `${at(code)}/hand`, { raised, ...(guest ?? {}) }),
  reaction: (code: string, emoji: string, guest?: GuestKey | null) => call<{ ok: true }>("POST", `${at(code)}/reaction`, { emoji, ...(guest ?? {}) }),
  stage: (code: string) => call<WebinarStage>("GET", `${at(code)}/stage`),
  setStage: (code: string, identity: string, on: boolean) => call<{ ok: true }>("POST", `${at(code)}/stage`, { identity, on }),
  setHost: (code: string, identity: string, on: boolean) => call<{ ok: true }>("POST", `${at(code)}/hosts`, { identity, on }),
  // Step 79, part C: questions, polls and chat (guests and registered viewers send their key along).
  webinarState: (code: string, guest?: GuestKey | null) => call<WebinarLiveState>("POST", `${at(code)}/webinar/state`, { ...(guest ?? {}) }),
  ask: (code: string, text: string, anonymous: boolean, guest?: GuestKey | null) => call<WebinarQuestion>("POST", `${at(code)}/questions`, { text, anonymous, ...(guest ?? {}) }),
  voteQuestion: (code: string, id: string, up: boolean, guest?: GuestKey | null) =>
    call<{ ok: true }>("POST", `${at(code)}/questions/${encodeURIComponent(id)}/vote`, { up, ...(guest ?? {}) }),
  moderateQuestion: (code: string, id: string, change: { answered?: boolean; hidden?: boolean }) => call<{ ok: true }>("POST", `${at(code)}/questions/${encodeURIComponent(id)}`, change),
  createPoll: (code: string, question: string, options: string[], results: "all" | "hosts") => call<WebinarPoll>("POST", `${at(code)}/polls`, { question, options, results }),
  votePoll: (code: string, id: string, option: number, guest?: GuestKey | null) =>
    call<{ ok: true }>("POST", `${at(code)}/polls/${encodeURIComponent(id)}/vote`, { option, ...(guest ?? {}) }),
  closePoll: (code: string, id: string) => call<{ ok: true }>("POST", `${at(code)}/polls/${encodeURIComponent(id)}/close`),
  sendChat: (code: string, text: string, guest?: GuestKey | null) => call<WebinarChatMessage>("POST", `${at(code)}/chat`, { text, ...(guest ?? {}) }),
  liveSettings: (code: string, change: { chatMode?: ChatMode; anonymousQuestions?: boolean }) =>
    call<{ chatMode: ChatMode; anonymousQuestions: boolean }>("PUT", `${at(code)}/webinar/live`, change),
  // Step 79, part B: registration (public) and, for hosts, the webinar and who registered.
  register: (code: string, input: { name: string; email: string; locale: "de" | "en" }) =>
    call<{ ok: true }>("POST", `${at(code)}/register`, { ...input, consent: true }).then(tapStats("webinar-registered")),
  registration: (code: string, id: string, key: string) =>
    call<{ name: string; cancelled: boolean }>("POST", `${at(code)}/registrations/${encodeURIComponent(id)}/status`, { key }),
  joinRegistered: (code: string, id: string, key: string) =>
    call<JoinGrant>("POST", `${at(code)}/registrations/${encodeURIComponent(id)}/join`, { key }).then(tapStats("meeting-join")),
  cancelRegistration: (code: string, id: string, key: string) => call<{ ok: true }>("POST", `${at(code)}/registrations/${encodeURIComponent(id)}/cancel`, { key }),
  updateWebinar: (code: string, change: Partial<WebinarFields> & { title?: string }) =>
    call<MeetingView>("PUT", `${at(code)}/webinar`, { ...change, ...(change.startsAt ? { startsAt: change.startsAt.toISOString() } : {}) }),
  registrations: (code: string) => call<{ registrations: WebinarRegistration[] }>("GET", `${at(code)}/registrations`).then((r) => r.registrations),
  /** The registrations as CSV, saved by the browser. */
  downloadRegistrations: async (code: string) => {
    const res = await apiFetch(`${at(code)}/registrations.csv`, { credentials: "same-origin", headers: { Accept: "text/csv", "x-xenaxio-csrf": "1" } });
    if (!res.ok) throw new XenaxioApiError(res.status, "internal");
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: `webinar-${code}.csv` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  // The company admin.
  settings: () => call<MeetSettings>("GET", ADMIN),
  saveSettings: (change: { enabled?: boolean; guests?: boolean; backgroundDefault?: boolean; recording?: boolean }) => call<MeetSettings>("PUT", ADMIN, change),
  /** Step 92: the company's background, sent as the picture itself (the browser makes it a JPEG first). */
  uploadBackground: (picture: Blob) => upload<MeetSettings>("PUT", `${ADMIN}/background`, picture),
  removeBackground: () => call<MeetSettings>("DELETE", `${ADMIN}/background`),
  // Step 90, part D: the company's recordings; deleting one (sound and transcript, in the organizer's Files too).
  recordings: () => call<{ recordings: CompanyRecording[] }>("GET", `${ADMIN}/recordings`).then((r) => r.recordings),
  deleteRecording: (id: string) => call<{ ok: true }>("DELETE", `${ADMIN}/recordings/${encodeURIComponent(id)}`),
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

/** Step 79, part B: the personal link of a registered viewer (#r=<id>.<key>, &cancel=1 to cancel). */
export function personalLink(hash: string): { id: string; key: string; cancel: boolean } | null {
  const m = /(?:^#|&)r=([0-9a-f-]{36})\.([A-Za-z0-9_-]{20,64})/.exec(hash);
  return m ? { id: m[1] as string, key: m[2] as string, cancel: /(?:^#|&)cancel=1(?:&|$)/.test(hash) } : null;
}
