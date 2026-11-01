// Step 43, part B: a small Matrix client for the team chat. One long-poll sync
// loop through the platform's proxy keeps rooms, timelines, threads, reactions,
// edits, unread counts, typing and presence in memory; components read them
// through the store (store.ts). No end-to-end encryption (decided for step 43),
// so no crypto code is needed.
import { ChatError, mx, newTxnId, paths } from "./api";
import { isPollEnd, isPollResponse, isPollStart, type PollState, pollOf, responseAnswers } from "./poll";
import { type Bookmark, BOOKMARKS_TYPE, bookmarksOf, CANVAS_TYPE, FORUM_TYPE, keepPost, VOICE_TYPE } from "./extras";
import type { ChannelRef } from "./format";
import { BACKGROUND_TYPE, backgroundCodeOf, backgroundImageOf, NO_ROOM_BACKGROUNDS, parseRoomBackgrounds, ROOM_BACKGROUNDS_TYPE, type RoomBackgrounds } from "./room-background";

const KEYWORD_PREFIX = "xenaxio-kw-";
/** A stable rule id per keyword (ids allow only a few characters). */
function keywordRuleId(word: string): string {
  let hex = "";
  for (const b of new TextEncoder().encode(word.toLowerCase())) hex += b.toString(16).padStart(2, "0");
  return KEYWORD_PREFIX + hex.slice(0, 120);
}

/** How long the list of open channels is kept for "#name" links. */
const CHANNEL_DIRECTORY_MS = 5 * 60_000;

export interface RawEvent {
  event_id?: string;
  type: string;
  sender: string;
  origin_server_ts?: number;
  content: Record<string, unknown>;
  state_key?: string;
  redacts?: string;
  unsigned?: {
    transaction_id?: string;
    prev_content?: Record<string, unknown>;
    redacted_because?: unknown;
    "m.relations"?: { "m.thread"?: { count?: number; latest_event?: RawEvent; current_user_participated?: boolean } };
  };
}

export interface Message {
  /** Event id; "~<txn>" while it is being sent. */
  id: string;
  txnId?: string;
  roomId: string;
  sender: string;
  ts: number;
  type: string;
  /** Current content: the latest edit applied. */
  content: Record<string, unknown>;
  stateKey?: string;
  prevContent?: Record<string, unknown>;
  edited: boolean;
  redacted: boolean;
  status?: "sending" | "failed";
  /** Set on a reply inside a thread: the thread's first message. */
  threadRoot?: string;
  /** Set on a thread's first message. */
  thread?: { count: number; latestTs: number; participants: string[] };
  /** Reaction → who reacted, in order. */
  reactions: Record<string, string[]>;
  /** Step 99, part E2b: a poll's votes and end. */
  pollState?: PollState;
}

export interface Member {
  userId: string;
  displayName: string;
  avatarMxc?: string;
  membership: "join" | "invite" | "leave" | "ban" | "knock";
}

export interface PersonInfo {
  userId: string;
  displayName?: string;
  avatarMxc?: string;
  presence?: "online" | "unavailable" | "offline";
  statusMsg?: string;
  lastActiveAgo?: number;
  currentlyActive?: boolean;
}

export interface Room {
  id: string;
  name: string | null;
  topic: string | null;
  kind: "space" | "channel" | "dm";
  joinRule: string;
  membership: "join" | "invite" | "leave";
  inviter?: string;
  members: Map<string, Member>;
  /** Main timeline, oldest first (thread replies live in `threads`). */
  timeline: Message[];
  byId: Map<string, Message>;
  threads: Map<string, Message[]>;
  threadsLoaded: Set<string>;
  prevBatch: string | null;
  atStart: boolean;
  notifications: number;
  highlights: number;
  threadUnread: Map<string, { notifications: number; highlights: number }>;
  pinned: string[];
  /** My read receipt in the main timeline. */
  readUpTo: string | null;
  typing: string[];
  powerLevels: PowerLevels;
  creator: string | null;
  tags: Record<string, { order?: number }>;
  lastTs: number;
  archived: boolean;
  /** Step 99: the channel's description (our state, next to the topic) and when it was made. */
  description: string | null;
  createdTs: number | null;
  /** Step 99, part E: marked unread by hand (Matrix m.marked_unread); the "new" line goes after `readUpTo`. */
  markedUnread: { readUpTo: string | null } | null;
  /** Step 99, part H: a voice channel (Discord), a forum with its tags (Discord), the canvas and bookmarks (Slack). */
  voice: boolean;
  forum: { tags: string[] } | null;
  canvas: { text: string; by: string; ts: number } | null;
  bookmarks: Bookmark[];
  /** Marked here and now: the open view does not mark it read again until it is left. */
  keepUnread?: boolean;
  /** Step 43, part E: made for people of other companies ("externer Kanal" or a conversation with them). */
  external: boolean;
  /** Step 109: the room's background (a code of lib/xenaxio/backgrounds.ts), or none. */
  background: string | null;
  /** Step 109: or a picture uploaded for it ("mxc://…"). */
  backgroundImage: string | null;
}

export interface PowerLevels {
  users: Record<string, number>;
  users_default: number;
  events: Record<string, number>;
  events_default: number;
  state_default: number;
  redact: number;
  invite: number;
  kick: number;
  /** Who may notify everyone (@room, our @channel / @here). */
  notifications?: { room?: number };
}

export interface SavedItem {
  roomId: string;
  eventId: string;
  ts: number;
}

export interface SearchHit {
  roomId: string;
  message: Message;
  rank: number;
}

type Listener = () => void;

const DEFAULT_POWER: PowerLevels = { users: {}, users_default: 0, events: {}, events_default: 0, state_default: 50, redact: 50, invite: 0, kick: 50 };

/** What the sync asks for: lazy members, thread counters, the last 30 events per room. */
const SYNC_FILTER = JSON.stringify({
  room: {
    timeline: { limit: 30, unread_thread_notifications: true },
    state: { lazy_load_members: true },
    ephemeral: { types: ["m.typing", "m.receipt"] },
  },
  presence: { types: ["m.presence"] },
});
const SYNC_TIMEOUT_MS = 30_000;
/** The platform's service account on every company chat server (it creates "Alle"). */
export const SERVICE_LOCALPART = "xenaxio";
/** Our own account data: messages saved for later. */
export const SAVED_TYPE = "com.xenaxio.saved";
/** Step 99, part C: the sidebar's own sections, order and filters (account data: the same on every device). */
export const SIDEBAR_TYPE = "com.xenaxio.sidebar";
export type SectionSort = "manual" | "alpha" | "activity";
export interface SidebarSection {
  id: string;
  name: string;
  /** Rooms in the order the person put them. */
  rooms: string[];
}
export interface SidebarLayout {
  sections: SidebarSection[];
  /** Folded sections: "starred", "channels", "direct" or an own section's id. */
  collapsed: string[];
  /** Order per section; unset: own sections as put, channels by name, direct messages by activity. */
  sort: Record<string, SectionSort>;
  unreadOnly: boolean;
}
export const EMPTY_LAYOUT: SidebarLayout = { sections: [], collapsed: [], sort: {}, unreadOnly: false };

/** The layout from account data; anything odd is dropped (another client may have written it). */
export function parseLayout(content: Record<string, unknown> | undefined): SidebarLayout {
  const c = content ?? {};
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const sections = (Array.isArray(c.sections) ? c.sections : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({ id: str(x.id, 40), name: str(x.name, 80).trim(), rooms: (Array.isArray(x.rooms) ? x.rooms : []).filter((r): r is string => typeof r === "string" && r.startsWith("!")).slice(0, 500) }))
    .filter((x) => /^s[a-z0-9]{1,30}$/.test(x.id) && x.name)
    .slice(0, 30);
  const collapsed = (Array.isArray(c.collapsed) ? c.collapsed : []).filter((x): x is string => typeof x === "string").slice(0, 40);
  const sort: Record<string, SectionSort> = {};
  if (c.sort && typeof c.sort === "object")
    for (const [k, v] of Object.entries(c.sort as Record<string, unknown>)) if (v === "manual" || v === "alpha" || v === "activity") sort[k.slice(0, 40)] = v;
  return { sections, collapsed, sort, unreadOnly: c.unreadOnly === true };
}

export type NotifyLevel = "all" | "mentions" | "none";
type PushRule = { rule_id?: string; enabled?: boolean; actions?: unknown[] };

/**
 * Each channel's own level from the push rules (our rules, see setNotifications):
 * muted, mentions only, or — when the default is lower — all messages.
 */
export function roomLevelsOf(content: Record<string, unknown> | undefined): Map<string, NotifyLevel> {
  const global = (content?.global ?? {}) as { override?: PushRule[]; room?: PushRule[] };
  const levels = new Map<string, NotifyLevel>();
  for (const r of global.room ?? [])
    if (r.rule_id?.startsWith("!") && r.enabled !== false) levels.set(r.rule_id, (r.actions ?? []).includes("notify") ? "all" : "mentions");
  for (const r of global.override ?? []) if (r.rule_id?.startsWith(MUTE_PREFIX) && r.enabled !== false) levels.set(r.rule_id.slice(MUTE_PREFIX.length), "none");
  return levels;
}

/**
 * Step 99, part D: the default for channels, as in Slack — all new messages;
 * direct messages, mentions and keywords; or nothing. It is the person's own
 * push rules on the chat server: "nothing" is the master rule, "mentions"
 * turns off the rule for ordinary messages in channels.
 */
export function defaultLevelOf(content: Record<string, unknown> | undefined): NotifyLevel {
  const global = (content?.global ?? {}) as { override?: PushRule[]; underride?: PushRule[] };
  if (global.override?.find((r) => r.rule_id === ".m.rule.master")?.enabled === true) return "none";
  if (global.underride?.find((r) => r.rule_id === ".m.rule.message")?.enabled === false) return "mentions";
  return "all";
}

/** Channels where @channel / @here do not notify this person (step 99). */
export function ignoredRoomMentionsOf(content: Record<string, unknown> | undefined): Set<string> {
  const global = (content?.global ?? {}) as { override?: PushRule[] };
  return new Set((global.override ?? []).filter((r) => r.rule_id?.startsWith(NOROOM_PREFIX) && r.enabled !== false).map((r) => (r.rule_id as string).slice(NOROOM_PREFIX.length)));
}

const MUTE_PREFIX = "xenaxio-mute-";
const NOROOM_PREFIX = "xenaxio-noroom-";

/** Our own room state: an archived channel (read-only, out of the directory). */
export const ARCHIVED_TYPE = "com.xenaxio.archived";
/** Step 63: on a change the platform made in a channel, the admin who asked for it. */
export const BY_FIELD = "com.xenaxio.by";
/** Step 99: a channel's description; the platform writes the same type for the company admin. */
export const DESCRIPTION_TYPE = "com.xenaxio.description";
/** Step 99, part E: unsent messages of every channel and thread, kept in the account (the same on every device). */
export const DRAFTS_TYPE = "com.xenaxio.drafts";
export interface Draft {
  text: string;
  ts: number;
}
const MAX_DRAFTS = 40;
const MAX_DRAFT_CHARS = 8000;

/** Drafts from account data; anything odd is dropped. */
export function parseDrafts(content: Record<string, unknown> | undefined): Record<string, Draft> {
  const items = (content?.items ?? {}) as Record<string, unknown>;
  const out: Record<string, Draft> = {};
  if (!items || typeof items !== "object") return out;
  for (const [key, v] of Object.entries(items).slice(0, MAX_DRAFTS)) {
    const d = v as { text?: unknown; ts?: unknown };
    if (/^![^|\s]{1,255}\|[^|\s]{0,255}$/.test(key) && typeof d?.text === "string" && d.text.trim())
      out[key] = { text: d.text.slice(0, MAX_DRAFT_CHARS), ts: typeof d.ts === "number" ? d.ts : 0 };
  }
  return out;
}

/** Step 99, part E: "mark as unread" (Matrix 1.12; Element used the older name). */
const MARKED_UNREAD = "m.marked_unread";
const MARKED_UNREAD_OLD = "com.famedly.marked_unread";
/** Our addition to it: the message before the first unread one, for the "new" line. */
const READ_UP_TO = "com.xenaxio.read_up_to";
/** Step 99: the level of a channel's managers (Matrix moderators). */
export const MANAGER_LEVEL = 50;

/** The platform's own account (it sets channels up; never shown as a person). */
export function isPlatformAccount(userId: string): boolean {
  return userId.startsWith(`@${SERVICE_LOCALPART}:`);
}

/** The bot of a channel's integration (incoming webhook, step 43 part D): "@xenaxio.hook.…". */
export function isIntegrationBot(userId: string): boolean {
  return userId.startsWith(`@${SERVICE_LOCALPART}.hook.`);
}

/**
 * People of a room as its members list shows them: those who joined and those
 * invited who have not opened the chat yet (their app accepts the invitation),
 * without the platform's account and the integrations' bots.
 */
export function roomPeople(room: Room): Member[] {
  return [...room.members.values()].filter((m) => (m.membership === "join" || m.membership === "invite") && !isPlatformAccount(m.userId) && !isIntegrationBot(m.userId));
}

/** Events shown in a timeline; the rest only change room state. */
/** Step 43, part E: our mark in a room's creation — made for people of other companies. */
export const EXTERNAL_MARK = "com.xenaxio.external";

/** The chat domain of a Matrix id ("@eva:beta.de" → "beta.de"). */
export function serverOfUser(userId: string): string {
  return userId.slice(userId.indexOf(":") + 1).toLowerCase();
}

/** A full chat address someone typed (@name:domain), or null. */
export function parseMatrixId(input: string): string | null {
  const s = input.trim();
  return /^@[a-z0-9._=\-/+]+:[a-z0-9.-]+\.[a-z]{2,}(:\d{1,5})?$/i.test(s) ? s.toLowerCase() : null;
}

export function isVisible(m: Pick<Message, "type" | "content" | "prevContent" | "stateKey">): boolean {
  // Step 99, part E2b: a poll shows like a message.
  if (m.type === "m.room.message" || isPollStart(m.type)) return true;
  if (m.type === "m.room.member") {
    const now = m.content.membership;
    const before = m.prevContent?.membership;
    // Joins and leaves; name and picture changes are not news.
    return now !== before && (now === "join" || now === "leave" || now === "ban");
  }
  return m.type === "m.room.name" || m.type === "m.room.topic" || m.type === ARCHIVED_TYPE || m.type === BACKGROUND_TYPE;
}

function relation(content: Record<string, unknown>): { relType?: string; eventId?: string; key?: string } {
  const rel = content["m.relates_to"] as { rel_type?: string; event_id?: string; key?: string } | undefined;
  return rel ? { relType: rel.rel_type, eventId: rel.event_id, key: rel.key } : {};
}

function toMessage(roomId: string, ev: RawEvent): Message {
  const summary = ev.unsigned?.["m.relations"]?.["m.thread"];
  const rel = relation(ev.content);
  return {
    id: ev.event_id ?? `~${ev.unsigned?.transaction_id ?? newTxnId()}`,
    ...(ev.unsigned?.transaction_id ? { txnId: ev.unsigned.transaction_id } : {}),
    roomId,
    sender: ev.sender,
    ts: ev.origin_server_ts ?? Date.now(),
    type: ev.type,
    content: ev.content ?? {},
    ...(ev.state_key !== undefined ? { stateKey: ev.state_key } : {}),
    ...(ev.unsigned?.prev_content ? { prevContent: ev.unsigned.prev_content } : {}),
    edited: false,
    redacted: !!ev.unsigned?.redacted_because || (ev.type === "m.room.message" && Object.keys(ev.content ?? {}).length === 0),
    ...(rel.relType === "m.thread" && rel.eventId ? { threadRoot: rel.eventId } : {}),
    ...(summary
      ? {
          thread: {
            count: summary.count ?? 0,
            latestTs: summary.latest_event?.origin_server_ts ?? 0,
            participants: summary.latest_event ? [summary.latest_event.sender] : [],
          },
        }
      : {}),
    reactions: {},
  };
}

function newRoom(id: string): Room {
  return {
    id,
    name: null,
    topic: null,
    kind: "channel",
    joinRule: "invite",
    membership: "join",
    members: new Map(),
    timeline: [],
    byId: new Map(),
    threads: new Map(),
    threadsLoaded: new Set(),
    prevBatch: null,
    atStart: false,
    notifications: 0,
    highlights: 0,
    threadUnread: new Map(),
    pinned: [],
    readUpTo: null,
    typing: [],
    powerLevels: DEFAULT_POWER,
    creator: null,
    tags: {},
    lastTs: 0,
    archived: false,
    external: false,
    description: null,
    createdTs: null,
    markedUnread: null,
    voice: false,
    forum: null,
    canvas: null,
    bookmarks: [],
    background: null,
    backgroundImage: null,
  };
}

/** A relation that arrived before its target (backward pagination, lazy loading). */
interface Pending {
  ev: RawEvent;
}

export class ChatClient {
  userId = "";
  rooms = new Map<string, Room>();
  people = new Map<string, PersonInfo>();
  /** m.direct: partner → their DM rooms. */
  direct: Record<string, string[]> = {};
  saved: SavedItem[] = [];
  /** Step 99, part C: own sections, folded sections, order and filter of the sidebar. */
  sidebar: SidebarLayout = EMPTY_LAYOUT;
  /** Step 109: the person's own view of channel backgrounds (account data). */
  roomBackgrounds: RoomBackgrounds = NO_ROOM_BACKGROUNDS;
  /** Step 99, part E: drafts per channel and thread ("roomId|threadRoot"). */
  drafts: Record<string, Draft> = {};
  private draftTimer: ReturnType<typeof setTimeout> | null = null;
  /** Channels with their own level (from the push rules on the server); the others follow `defaultLevel`. */
  roomLevels = new Map<string, NotifyLevel>();
  /** Step 99, part D: the default level for channels, and channels where @channel is ignored. */
  defaultLevel: NotifyLevel = "all";
  ignoredRoomMentions = new Set<string>();
  /** People I blocked (Matrix ignore list). */
  ignored: Record<string, object> = {};
  ready = false;
  /** Last sync failure (shown as "reconnecting"); null while all is well. */
  syncError: string | null = null;
  signedOut = false;

  private since: string | null = null;
  private running = false;
  private abort: AbortController | null = null;
  private listeners = new Set<Listener>();
  private notifyScheduled = false;
  private pendingRelations = new Map<string, Pending[]>();
  /** Reaction event id → what it reacted to (to undo it on redaction). */
  private reactionIndex = new Map<string, { roomId: string; target: string; key: string; sender: string }>();
  private typingSentAt = new Map<string, number>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Batches changes into one render per frame. */
  private changed(): void {
    if (this.notifyScheduled) return;
    this.notifyScheduled = true;
    const run = () => {
      this.notifyScheduled = false;
      for (const l of this.listeners) l();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const me = await mx<{ user_id: string }>("GET", paths.whoami);
    this.userId = me.user_id;
    void this.loop();
  }

  stop(): void {
    this.running = false;
    this.abort?.abort();
  }

  private async loop(): Promise<void> {
    let backoff = 1000;
    while (this.running) {
      this.abort = new AbortController();
      try {
        const q = new URLSearchParams({ filter: SYNC_FILTER, timeout: String(this.since ? SYNC_TIMEOUT_MS : 0), set_presence: "online" });
        if (this.since) q.set("since", this.since);
        const res = await mx<SyncResponse>("GET", `${paths.sync}?${q}`, undefined, { signal: this.abort.signal });
        this.processSync(res, !this.since);
        this.since = res.next_batch;
        if (!this.ready || this.syncError) {
          this.ready = true;
          this.syncError = null;
          this.changed();
        }
        backoff = 1000;
      } catch (err) {
        if (!this.running || (err as { name?: string }).name === "AbortError") return;
        if (err instanceof ChatError && err.status === 401) {
          this.signedOut = true;
          this.running = false;
          this.changed();
          return;
        }
        this.syncError = err instanceof ChatError ? err.errcode : "M_UNKNOWN";
        this.changed();
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, 30_000);
      }
    }
  }

  // --- Applying the server's news ------------------------------------------

  processSync(res: SyncResponse, initial: boolean): void {
    for (const ev of res.account_data?.events ?? []) this.applyAccountData(ev);
    for (const ev of res.presence?.events ?? []) this.applyPresence(ev);
    for (const [id, data] of Object.entries(res.rooms?.join ?? {})) {
      const room = this.room(id);
      room.membership = "join";
      room.inviter = undefined;
      for (const ev of data.state?.events ?? []) this.applyState(room, ev);
      const timeline = data.timeline;
      if (timeline) {
        if (timeline.limited && !initial) {
          // A gap: what we had is no longer contiguous with the news; start over from here.
          room.timeline = [];
          room.atStart = false;
        }
        if (timeline.limited || initial || !room.prevBatch) room.prevBatch = timeline.prev_batch ?? room.prevBatch;
        if (initial && !timeline.limited) room.atStart = true;
        for (const ev of timeline.events ?? []) this.addEvent(room, ev, "forward");
      }
      for (const ev of data.ephemeral?.events ?? []) this.applyEphemeral(room, ev);
      for (const ev of data.account_data?.events ?? []) {
        if (ev.type === "m.tag") room.tags = ((ev.content.tags ?? {}) as Room["tags"]) ?? {};
        if (ev.type === MARKED_UNREAD || ev.type === MARKED_UNREAD_OLD) {
          const from = ev.content[READ_UP_TO];
          room.markedUnread = ev.content.unread === true ? { readUpTo: typeof from === "string" ? from : null } : null;
        }
      }
      if (data.unread_notifications) {
        room.notifications = data.unread_notifications.notification_count ?? 0;
        room.highlights = data.unread_notifications.highlight_count ?? 0;
      }
      if (data.unread_thread_notifications) {
        for (const [root, counts] of Object.entries(data.unread_thread_notifications)) {
          room.threadUnread.set(root, { notifications: counts.notification_count ?? 0, highlights: counts.highlight_count ?? 0 });
        }
      }
    }
    for (const [id, data] of Object.entries(res.rooms?.invite ?? {})) {
      const room = this.room(id);
      room.membership = "invite";
      for (const ev of data.invite_state?.events ?? []) {
        this.applyState(room, ev as RawEvent);
        if (ev.type === "m.room.member" && ev.state_key === this.userId) {
          room.inviter = ev.sender;
          if ((ev.content as { is_direct?: boolean }).is_direct) room.kind = "dm";
        }
      }
    }
    for (const id of Object.keys(res.rooms?.leave ?? {})) this.rooms.delete(id);
    this.acceptColleagueInvites();
    this.changed();
  }

  private joining = new Set<string>();

  /**
   * As in Slack, a colleague's direct message or private channel simply
   * appears: invitations from the own company's server are accepted at once.
   * Invitations from other servers (federation, step 43 part E) wait.
   */
  private acceptColleagueInvites(): void {
    const own = this.userId.slice(this.userId.indexOf(":") + 1);
    for (const room of this.rooms.values()) {
      if (room.membership !== "invite" || !room.inviter || this.joining.has(room.id)) continue;
      if (room.inviter.slice(room.inviter.indexOf(":") + 1) !== own) continue;
      this.joining.add(room.id);
      void mx("POST", paths.join(room.id), {}).catch(() => this.joining.delete(room.id));
    }
  }

  private room(id: string): Room {
    let room = this.rooms.get(id);
    if (!room) {
      room = newRoom(id);
      if (this.isDirectRoom(id)) room.kind = "dm";
      this.rooms.set(id, room);
    }
    return room;
  }

  private isDirectRoom(id: string): boolean {
    return Object.values(this.direct).some((ids) => ids.includes(id));
  }

  private applyAccountData(ev: RawEvent): void {
    if (ev.type === "m.direct") {
      this.direct = (ev.content ?? {}) as Record<string, string[]>;
      for (const room of this.rooms.values()) if (this.isDirectRoom(room.id) && room.kind !== "space") room.kind = "dm";
    } else if (ev.type === "m.ignored_user_list") {
      this.ignored = ((ev.content ?? {}).ignored_users ?? {}) as Record<string, object>;
    } else if (ev.type === SAVED_TYPE) {
      this.saved = Array.isArray(ev.content.items) ? (ev.content.items as SavedItem[]) : [];
    } else if (ev.type === DRAFTS_TYPE) {
      // A draft being typed here wins over the server's copy until it is saved.
      this.drafts = { ...parseDrafts(ev.content), ...(this.draftTimer ? this.drafts : {}) };
    } else if (ev.type === SIDEBAR_TYPE) {
      this.sidebar = parseLayout(ev.content);
    } else if (ev.type === ROOM_BACKGROUNDS_TYPE) {
      this.roomBackgrounds = parseRoomBackgrounds(ev.content);
    } else if (ev.type === "m.push_rules") {
      this.roomLevels = roomLevelsOf(ev.content);
      this.defaultLevel = defaultLevelOf(ev.content);
      this.ignoredRoomMentions = ignoredRoomMentionsOf(ev.content);
    }
  }

  private applyPresence(ev: RawEvent): void {
    const c = ev.content as { presence?: PersonInfo["presence"]; status_msg?: string; last_active_ago?: number; currently_active?: boolean; displayname?: string; avatar_url?: string };
    const person = this.person(ev.sender);
    if (c.presence) person.presence = c.presence;
    person.statusMsg = c.status_msg ?? undefined;
    if (c.last_active_ago !== undefined) person.lastActiveAgo = c.last_active_ago;
    if (c.currently_active !== undefined) person.currentlyActive = c.currently_active;
  }

  person(userId: string): PersonInfo {
    let p = this.people.get(userId);
    if (!p) {
      p = { userId };
      this.people.set(userId, p);
    }
    return p;
  }

  private applyState(room: Room, ev: RawEvent): void {
    const c = ev.content ?? {};
    switch (ev.type) {
      case "m.room.create":
        room.creator = (c.creator as string) ?? ev.sender;
        if (typeof ev.origin_server_ts === "number") room.createdTs = ev.origin_server_ts;
        if (c.type === "m.space") room.kind = "space";
        room.external = c[EXTERNAL_MARK] === true && c["m.federate"] !== false;
        break;
      case "m.room.name":
        room.name = typeof c.name === "string" && c.name ? c.name : null;
        break;
      case "m.room.topic":
        room.topic = typeof c.topic === "string" && c.topic ? c.topic : null;
        break;
      case "m.room.join_rules":
        room.joinRule = (c.join_rule as string) ?? "invite";
        break;
      case "m.room.pinned_events":
        room.pinned = Array.isArray(c.pinned) ? (c.pinned as string[]) : [];
        break;
      case "m.room.power_levels":
        room.powerLevels = { ...DEFAULT_POWER, ...(c as Partial<PowerLevels>) };
        break;
      case ARCHIVED_TYPE:
        room.archived = c.archived === true;
        break;
      case VOICE_TYPE:
        room.voice = c.voice === true;
        break;
      case FORUM_TYPE:
        room.forum = c.forum === true ? { tags: (Array.isArray(c.tags) ? c.tags : []).filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 40)).slice(0, 20) } : null;
        break;
      case CANVAS_TYPE:
        room.canvas = typeof c.text === "string" && c.text.trim() ? { text: c.text.slice(0, 50_000), by: ev.sender, ts: ev.origin_server_ts ?? 0 } : null;
        break;
      case BOOKMARKS_TYPE:
        room.bookmarks = bookmarksOf(c);
        break;
      case BACKGROUND_TYPE:
        room.background = backgroundCodeOf(c);
        room.backgroundImage = backgroundImageOf(c);
        break;
      case DESCRIPTION_TYPE:
        room.description = typeof c.description === "string" && c.description.trim() ? c.description.trim().slice(0, 1000) : null;
        break;
      case "m.room.member": {
        const userId = ev.state_key as string;
        const membership = (c.membership as Member["membership"]) ?? "leave";
        const displayName = typeof c.displayname === "string" && c.displayname ? c.displayname : userId.slice(1).split(":")[0] ?? userId;
        room.members.set(userId, { userId, displayName, ...(typeof c.avatar_url === "string" ? { avatarMxc: c.avatar_url } : {}), membership });
        const person = this.person(userId);
        if (membership === "join") {
          person.displayName = displayName;
          if (typeof c.avatar_url === "string") person.avatarMxc = c.avatar_url;
        }
        if (userId === this.userId && (c as { is_direct?: boolean }).is_direct) room.kind = room.kind === "space" ? "space" : "dm";
        break;
      }
    }
  }

  private applyEphemeral(room: Room, ev: RawEvent): void {
    if (ev.type === "m.typing") {
      room.typing = ((ev.content.user_ids as string[]) ?? []).filter((u) => u !== this.userId);
    } else if (ev.type === "m.receipt") {
      for (const [eventId, receipts] of Object.entries(ev.content as Record<string, { "m.read"?: Record<string, { thread_id?: string }> }>)) {
        const mine = receipts["m.read"]?.[this.userId];
        if (mine && (!mine.thread_id || mine.thread_id === "main")) room.readUpTo = eventId;
      }
    }
  }

  /** Adds one event of the room's timeline (live or from pagination). */
  addEvent(room: Room, ev: RawEvent, direction: "forward" | "backward"): void {
    if (ev.state_key !== undefined && direction === "forward") this.applyState(room, ev);
    if (ev.type === "m.room.redaction") return this.applyRedaction(room, ev);
    const rel = relation(ev.content ?? {});
    if (ev.type === "m.reaction") {
      if (rel.relType === "m.annotation" && rel.eventId && rel.key) this.applyReaction(room, ev, rel.eventId, rel.key);
      return;
    }
    if (rel.relType === "m.replace" && rel.eventId) return this.applyEdit(room, ev, rel.eventId);
    if ((isPollResponse(ev.type) || isPollEnd(ev.type)) && rel.relType === "m.reference" && rel.eventId) return this.applyPoll(room, ev, rel.eventId);

    const txn = ev.unsigned?.transaction_id;
    if (txn) {
      // Our own message coming back: it takes the place of the local copy.
      const local = room.byId.get(`~${txn}`);
      if (local) {
        room.byId.delete(local.id);
        local.id = ev.event_id as string;
        local.ts = ev.origin_server_ts ?? local.ts;
        delete local.status;
        room.byId.set(local.id, local);
        this.flushPending(room, local);
        return;
      }
    }
    if (ev.event_id && room.byId.has(ev.event_id)) return;
    const message = toMessage(room.id, ev);
    if (!isVisible(message)) return;
    // The platform's service account sets channels up; that is not news.
    // Step 63: a change an admin asked for is (it names the admin).
    if (message.stateKey !== undefined && isPlatformAccount(message.sender) && typeof message.content[BY_FIELD] !== "string") return;
    if (message.type === "m.room.member" && message.stateKey && isPlatformAccount(message.stateKey)) return;
    room.byId.set(message.id, message);
    if (message.threadRoot) this.addThreadReply(room, message, direction);
    else if (direction === "forward") room.timeline.push(message);
    else room.timeline.unshift(message);
    const news = message.type === "m.room.message" || isPollStart(message.type);
    if (direction === "forward" && news) room.lastTs = Math.max(room.lastTs, message.ts);
    if (direction === "backward" && room.lastTs === 0 && news) room.lastTs = message.ts;
    this.flushPending(room, message);
  }

  private addThreadReply(room: Room, reply: Message, direction: "forward" | "backward"): void {
    const root = reply.threadRoot as string;
    const list = room.threads.get(root) ?? [];
    if (direction === "forward") list.push(reply);
    else list.unshift(reply);
    list.sort((a, b) => a.ts - b.ts);
    room.threads.set(root, list);
    const rootMessage = room.byId.get(root);
    if (rootMessage && direction === "forward") {
      const t = rootMessage.thread ?? { count: 0, latestTs: 0, participants: [] };
      rootMessage.thread = {
        count: room.threadsLoaded.has(root) ? list.length : t.count + 1,
        latestTs: Math.max(t.latestTs, reply.ts),
        participants: [...new Set([...t.participants, reply.sender])],
      };
    }
    if (direction === "forward") room.lastTs = Math.max(room.lastTs, reply.ts);
  }

  private queue(target: string, ev: RawEvent): void {
    const list = this.pendingRelations.get(target) ?? [];
    list.push({ ev });
    this.pendingRelations.set(target, list);
  }

  private flushPending(room: Room, message: Message): void {
    const waiting = this.pendingRelations.get(message.id);
    if (!waiting) return;
    this.pendingRelations.delete(message.id);
    // Oldest first, so the latest edit wins.
    for (const { ev } of waiting.sort((a, b) => (a.ev.origin_server_ts ?? 0) - (b.ev.origin_server_ts ?? 0))) this.addEvent(room, ev, "forward");
  }

  /** Step 99, part E2b: a vote (each person's latest counts) or the end of a poll (by whoever started it). */
  private applyPoll(room: Room, ev: RawEvent, target: string): void {
    const message = room.byId.get(target);
    if (!message) return this.queue(target, ev);
    const poll = pollOf(message.content);
    if (!poll) return;
    const state = (message.pollState ??= { votes: new Map(), endedTs: null });
    const ts = ev.origin_server_ts ?? Date.now();
    if (isPollEnd(ev.type)) {
      if (ev.sender === message.sender && (state.endedTs === null || ts < state.endedTs)) state.endedTs = ts;
      return;
    }
    // Votes after the end do not count.
    if (state.endedTs !== null && ts > state.endedTs) return;
    const answers = responseAnswers(ev.content ?? {}, poll);
    if (answers === null) return;
    const before = state.votes.get(ev.sender);
    if (!before || before.ts <= ts) state.votes.set(ev.sender, { answers, ts });
  }

  /** Step 99, part E2b: every vote of a poll (the timeline only has the newest). */
  async loadPoll(roomId: string, pollId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;
    let from: string | undefined;
    for (let page = 0; page < 10; page++) {
      const res = await mx<{ chunk?: RawEvent[]; next_batch?: string }>("GET", `${paths.relations(roomId, pollId, "m.reference")}?limit=100${from ? `&from=${encodeURIComponent(from)}` : ""}`);
      for (const ev of res.chunk ?? []) this.addEvent(room, ev, "forward");
      if (!res.next_batch) break;
      from = res.next_batch;
    }
    this.changed();
  }

  /** Sends any event (polls and their votes); shown at once for a poll, quietly for a vote. */
  async sendEvent(roomId: string, type: string, content: Record<string, unknown>): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const res = await mx<{ event_id: string }>("PUT", paths.send(roomId, type, newTxnId()), content);
    // A vote counts right away (the sync brings it again; the latest wins).
    const rel = relation(content);
    if (rel.relType === "m.reference" && rel.eventId) this.addEvent(room, { event_id: res.event_id, type, sender: this.userId, origin_server_ts: Date.now(), content }, "forward");
    this.changed();
  }

  private applyEdit(room: Room, ev: RawEvent, target: string): void {
    const message = room.byId.get(target);
    if (!message) return this.queue(target, ev);
    // Only the author may edit.
    if (message.sender !== ev.sender || message.redacted) return;
    const next = ev.content["m.new_content"] as Record<string, unknown> | undefined;
    if (!next) return;
    message.content = { ...keepPost(next, message.content), ...(message.content["m.relates_to"] ? { "m.relates_to": message.content["m.relates_to"] } : {}) };
    message.edited = true;
  }

  private applyReaction(room: Room, ev: RawEvent, target: string, key: string): void {
    if (ev.event_id && this.reactionIndex.has(ev.event_id)) return;
    const message = room.byId.get(target);
    if (!message) return this.queue(target, ev);
    const who = message.reactions[key] ?? [];
    if (!who.includes(ev.sender)) message.reactions = { ...message.reactions, [key]: [...who, ev.sender] };
    if (ev.event_id) this.reactionIndex.set(ev.event_id, { roomId: room.id, target, key, sender: ev.sender });
  }

  private applyRedaction(room: Room, ev: RawEvent): void {
    const target = ev.redacts ?? (ev.content?.redacts as string | undefined);
    if (!target) return;
    const reaction = this.reactionIndex.get(target);
    if (reaction) {
      this.reactionIndex.delete(target);
      const message = room.byId.get(reaction.target);
      if (message) {
        const left = (message.reactions[reaction.key] ?? []).filter((s) => s !== reaction.sender);
        const next = { ...message.reactions };
        if (left.length) next[reaction.key] = left;
        else delete next[reaction.key];
        message.reactions = next;
      }
      return;
    }
    const message = room.byId.get(target);
    if (!message) return this.queue(target, { ...ev, type: "m.room.redaction" });
    message.redacted = true;
    message.content = {};
    message.reactions = {};
  }

  // --- Reading more ---------------------------------------------------------

  /** Older messages of a channel. */
  async loadOlder(roomId: string, limit = 40): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room || room.atStart || !room.prevBatch) {
      if (room && !room.prevBatch) room.atStart = true;
      return;
    }
    const q = new URLSearchParams({ dir: "b", limit: String(limit), from: room.prevBatch, filter: JSON.stringify({ lazy_load_members: true }) });
    const res = await mx<{ chunk?: RawEvent[]; end?: string; state?: RawEvent[] }>("GET", `${paths.messages(roomId)}?${q}`);
    for (const ev of res.state ?? []) if (ev.type === "m.room.member") this.applyState(room, ev);
    for (const ev of res.chunk ?? []) this.addEvent(room, ev, "backward");
    room.prevBatch = res.end ?? null;
    if (!res.end || !res.chunk?.length) room.atStart = true;
    this.changed();
  }

  /** All replies of a thread (first time it is opened). */
  async loadThread(roomId: string, rootId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room || room.threadsLoaded.has(rootId)) return;
    if (!room.byId.has(rootId)) {
      const ctx = await mx<{ event?: RawEvent }>("GET", `${paths.context(roomId, rootId)}?limit=0`);
      if (ctx.event) {
        const m = toMessage(roomId, ctx.event);
        room.byId.set(m.id, m);
      }
    }
    let from: string | undefined;
    for (let page = 0; page < 10; page++) {
      const q = new URLSearchParams({ dir: "b", limit: "100" });
      if (from) q.set("from", from);
      const res = await mx<{ chunk?: RawEvent[]; next_batch?: string }>("GET", `${paths.relations(roomId, rootId, "m.thread")}?${q}`);
      for (const ev of res.chunk ?? []) this.addEvent(room, ev, "backward");
      from = res.next_batch;
      if (!from) break;
    }
    room.threadsLoaded.add(rootId);
    const root = room.byId.get(rootId);
    const list = room.threads.get(rootId) ?? [];
    if (root && list.length) root.thread = { count: list.length, latestTs: list[list.length - 1]!.ts, participants: [...new Set(list.map((m) => m.sender))] };
    this.changed();
  }

  /** One message, also when it is not loaded (saved items, links). */
  async fetchMessage(roomId: string, eventId: string): Promise<Message | null> {
    const known = this.rooms.get(roomId)?.byId.get(eventId);
    if (known) return known;
    try {
      const ctx = await mx<{ event?: RawEvent }>("GET", `${paths.context(roomId, eventId)}?limit=0`);
      return ctx.event ? toMessage(roomId, ctx.event) : null;
    } catch {
      return null;
    }
  }

  /** Members of a channel (the sync loads only those who wrote). */
  async loadMembers(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const res = await mx<{ chunk?: RawEvent[] }>("GET", `${paths.members(roomId)}?not_membership=leave`);
    for (const ev of res.chunk ?? []) this.applyState(room, ev);
    this.changed();
  }

  // --- Writing --------------------------------------------------------------

  /** Sends a message; it shows at once and turns into the real one when the server answers. */
  async send(roomId: string, content: Record<string, unknown>, opts: { threadRoot?: string } = {}): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const txnId = newTxnId();
    let body = content;
    if (opts.threadRoot) {
      const replies = room.threads.get(opts.threadRoot) ?? [];
      const last = [...replies].reverse().find((m) => !m.id.startsWith("~"))?.id ?? opts.threadRoot;
      body = { ...content, "m.relates_to": { rel_type: "m.thread", event_id: opts.threadRoot, is_falling_back: true, "m.in_reply_to": { event_id: last } } };
    }
    const local: Message = {
      id: `~${txnId}`,
      txnId,
      roomId,
      sender: this.userId,
      ts: Date.now(),
      type: "m.room.message",
      content: body,
      edited: false,
      redacted: false,
      status: "sending",
      ...(opts.threadRoot ? { threadRoot: opts.threadRoot } : {}),
      reactions: {},
    };
    room.byId.set(local.id, local);
    if (local.threadRoot) this.addThreadReply(room, local, "forward");
    else room.timeline.push(local);
    room.lastTs = local.ts;
    this.changed();
    await this.deliver(room, local);
  }

  private async deliver(room: Room, local: Message): Promise<void> {
    try {
      const res = await mx<{ event_id: string }>("PUT", paths.send(room.id, local.type, local.txnId as string), local.content);
      // The sync may have swapped it already.
      if (room.byId.get(local.id) === local && local.id.startsWith("~")) {
        room.byId.delete(local.id);
        local.id = res.event_id;
        delete local.status;
        if (!room.byId.has(res.event_id)) room.byId.set(res.event_id, local);
        this.flushPending(room, local);
      }
    } catch {
      local.status = "failed";
    }
    this.changed();
  }

  async retry(roomId: string, messageId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    const local = room?.byId.get(messageId);
    if (!room || !local || local.status !== "failed") return;
    local.status = "sending";
    this.changed();
    await this.deliver(room, local);
  }

  /** Drops a message that could not be sent. */
  discard(roomId: string, messageId: string): void {
    const room = this.rooms.get(roomId);
    const local = room?.byId.get(messageId);
    if (!room || !local || local.status !== "failed") return;
    room.byId.delete(messageId);
    room.timeline = room.timeline.filter((m) => m !== local);
    if (local.threadRoot) room.threads.set(local.threadRoot, (room.threads.get(local.threadRoot) ?? []).filter((m) => m !== local));
    this.changed();
  }

  async edit(roomId: string, messageId: string, content: Record<string, unknown>): Promise<void> {
    const room = this.rooms.get(roomId);
    const message = room?.byId.get(messageId);
    if (!room || !message || message.sender !== this.userId) return;
    const previous = message.content;
    content = keepPost(content, previous);
    message.content = { ...content, ...(previous["m.relates_to"] ? { "m.relates_to": previous["m.relates_to"] } : {}) };
    message.edited = true;
    this.changed();
    try {
      await mx("PUT", paths.send(roomId, "m.room.message", newTxnId()), {
        ...content,
        body: `* ${String(content.body ?? "")}`,
        ...(content.formatted_body ? { formatted_body: `* ${String(content.formatted_body)}` } : {}),
        "m.new_content": content,
        "m.relates_to": { rel_type: "m.replace", event_id: messageId },
      });
    } catch (err) {
      message.content = previous;
      this.changed();
      throw err;
    }
  }

  async remove(roomId: string, messageId: string): Promise<void> {
    await mx("PUT", paths.redact(roomId, messageId, newTxnId()), {});
    const message = this.rooms.get(roomId)?.byId.get(messageId);
    if (message) {
      message.redacted = true;
      message.content = {};
      message.reactions = {};
      this.changed();
    }
  }

  /** Adds or takes back my reaction. */
  async toggleReaction(roomId: string, messageId: string, key: string): Promise<void> {
    const mine = [...this.reactionIndex.entries()].find(([, r]) => r.roomId === roomId && r.target === messageId && r.key === key && r.sender === this.userId);
    if (mine) {
      await mx("PUT", paths.redact(roomId, mine[0], newTxnId()), {});
      return;
    }
    await mx("PUT", paths.send(roomId, "m.reaction", newTxnId()), { "m.relates_to": { rel_type: "m.annotation", event_id: messageId, key } });
  }

  /** Marks a channel (or one of its threads) as read up to its last message. */
  async markRead(roomId: string, threadRoot?: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;
    // Step 99: marked unread in this very view; it stays so until the person leaves.
    if (!threadRoot && room.keepUnread) return;
    if (!threadRoot && room.markedUnread) {
      room.markedUnread = null;
      this.changed();
      await mx("PUT", paths.roomAccountData(this.userId, roomId, MARKED_UNREAD), { unread: false }).catch(() => undefined);
    }
    const list = threadRoot ? room.threads.get(threadRoot) ?? [] : room.timeline;
    const last = [...list].reverse().find((m) => !m.id.startsWith("~"));
    if (!last) return;
    if (threadRoot) {
      const counts = room.threadUnread.get(threadRoot);
      if (!counts?.notifications && !counts?.highlights) return;
      room.threadUnread.set(threadRoot, { notifications: 0, highlights: 0 });
      this.changed();
      await mx("POST", paths.receipt(roomId, last.id), { thread_id: threadRoot }).catch(() => undefined);
      return;
    }
    if (room.readUpTo === last.id && !room.notifications && !room.highlights) return;
    room.readUpTo = last.id;
    room.notifications = 0;
    room.highlights = 0;
    this.changed();
    await mx("POST", paths.readMarkers(roomId), { "m.fully_read": last.id, "m.read": last.id }).catch(() => undefined);
  }

  /** Tells the others I am typing (at most every 4 seconds), or stopped. */
  async setTyping(roomId: string, typing: boolean): Promise<void> {
    const last = this.typingSentAt.get(roomId) ?? 0;
    if (typing && Date.now() - last < 4000) return;
    this.typingSentAt.set(roomId, typing ? Date.now() : 0);
    await mx("PUT", paths.typing(roomId, this.userId), typing ? { typing: true, timeout: 6000 } : { typing: false }).catch(() => undefined);
  }

  async setStatus(statusMsg: string | null): Promise<void> {
    await mx("PUT", paths.presence(this.userId), { presence: "online", ...(statusMsg ? { status_msg: statusMsg } : {}) });
    const me = this.person(this.userId);
    me.statusMsg = statusMsg ?? undefined;
    this.changed();
  }

  // --- Channels and people --------------------------------------------------

  /** A new channel: open ones are listed in the company's channel directory. */
  async createChannel(input: { name: string; topic?: string; isPublic: boolean; invite?: string[]; external?: boolean; kind?: "text" | "voice" | "forum"; tags?: string[] }): Promise<string> {
    const res = await mx<{ room_id: string }>("POST", paths.createRoom, {
      name: input.name,
      // Part E: only channels made for it ever take people of other companies; others never federate.
      creation_content: input.external ? { [EXTERNAL_MARK]: true } : { "m.federate": false },
      ...(input.topic ? { topic: input.topic } : {}),
      preset: input.isPublic ? "public_chat" : "private_chat",
      visibility: input.isPublic ? "public" : "private",
      invite: input.invite ?? [],
      // Everyone in the channel may pin messages and notify everyone with @channel, as in Slack (step 99);
      // and edit the canvas and bookmarks (step 99, part H).
      power_level_content_override: { events: { "m.room.pinned_events": 0, [CANVAS_TYPE]: 0, [BOOKMARKS_TYPE]: 0 }, notifications: { room: 0 } },
      // Step 99, part H: a voice channel or a forum from the start.
      initial_state: [
        ...(input.kind === "voice" ? [{ type: VOICE_TYPE, state_key: "", content: { voice: true } }] : []),
        ...(input.kind === "forum" ? [{ type: FORUM_TYPE, state_key: "", content: { forum: true, tags: (input.tags ?? []).slice(0, 20) } }] : []),
      ],
    });
    return res.room_id;
  }

  /** The direct conversation with these people; an existing one with the same person is reused. */
  async openDirect(userIds: string[]): Promise<string> {
    const others = [...new Set(userIds.filter((u) => u !== this.userId))];
    if (others.length === 1) {
      const existing = (this.direct[others[0] as string] ?? []).find((id) => this.rooms.get(id)?.membership === "join");
      if (existing) return existing;
    }
    const external = others.some((u) => this.isExternalUser(u));
    const res = await mx<{ room_id: string }>("POST", paths.createRoom, {
      is_direct: true,
      preset: "trusted_private_chat",
      invite: others,
      creation_content: external ? { [EXTERNAL_MARK]: true } : { "m.federate": false },
    });
    const direct = { ...this.direct };
    for (const u of others) direct[u] = [...new Set([...(direct[u] ?? []), res.room_id])];
    this.direct = direct;
    await mx("PUT", paths.accountData(this.userId, "m.direct"), direct).catch(() => undefined);
    const room = this.room(res.room_id);
    room.kind = "dm";
    this.changed();
    return res.room_id;
  }

  async join(roomId: string): Promise<void> {
    await mx("POST", paths.join(roomId), {});
  }

  // --- Other companies (step 43, part E) ------------------------------------

  /** The chat domain of the own company (e.g. "acme.de"). */
  get homeServer(): string {
    return this.userId.slice(this.userId.indexOf(":") + 1);
  }

  /** A person of another company (another chat server). */
  isExternalUser(userId: string): boolean {
    return !!userId && serverOfUser(userId) !== this.homeServer;
  }

  /** Checks an address of someone outside before writing to them; their name if known. */
  async lookupPerson(userId: string): Promise<{ userId: string; displayName: string | null }> {
    const res = await mx<{ displayname?: string }>("GET", paths.profile(userId));
    return { userId, displayName: typeof res.displayname === "string" && res.displayname ? res.displayname : null };
  }

  /** Blocks (or unblocks) a person: their messages and invitations no longer reach me. */
  async setIgnored(userId: string, ignored: boolean): Promise<void> {
    const current = { ...this.ignored };
    if (ignored) current[userId] = {};
    else delete current[userId];
    this.ignored = current;
    this.changed();
    await mx("PUT", paths.accountData(this.userId, "m.ignored_user_list"), { ignored_users: current });
  }

  isIgnored(userId: string): boolean {
    return userId in this.ignored;
  }

  async leave(roomId: string): Promise<void> {
    await mx("POST", paths.leave(roomId), {});
    this.rooms.delete(roomId);
    this.changed();
  }

  async invite(roomId: string, userId: string): Promise<void> {
    await mx("POST", paths.invite(roomId), { user_id: userId });
  }

  async setTopic(roomId: string, topic: string): Promise<void> {
    await mx("PUT", paths.state(roomId, "m.room.topic"), { topic });
  }

  async rename(roomId: string, name: string): Promise<void> {
    await mx("PUT", paths.state(roomId, "m.room.name"), { name });
  }

  // --- Step 99: channel details, as in Slack ----------------------------------

  /** Step 99, part H: the channel's canvas (a page of notes, as in Slack). */
  async setCanvas(roomId: string, text: string): Promise<void> {
    await mx("PUT", paths.state(roomId, CANVAS_TYPE), { text: text.slice(0, 50_000) });
  }

  /** Step 99, part H: the links under the channel's name (Slack's bookmarks). */
  async setBookmarks(roomId: string, items: Bookmark[]): Promise<void> {
    await mx("PUT", paths.state(roomId, BOOKMARKS_TYPE), { items: items.slice(0, 20) });
  }

  /**
   * Step 109: the room's background for everyone in it (a channel's managers,
   * anyone in a direct conversation): a code, null (none), or an uploaded picture.
   */
  async setChannelBackground(roomId: string, value: { background: string | null } | { image: string }): Promise<void> {
    await mx("PUT", paths.state(roomId, BACKGROUND_TYPE), value);
  }

  /** Step 109: the person's own view of channel backgrounds, kept on the server for every device. */
  async setRoomBackgrounds(next: RoomBackgrounds): Promise<void> {
    const previous = this.roomBackgrounds;
    this.roomBackgrounds = next;
    this.changed();
    try {
      await mx("PUT", paths.accountData(this.userId, ROOM_BACKGROUNDS_TYPE), next);
    } catch (err) {
      this.roomBackgrounds = previous;
      this.changed();
      throw err;
    }
  }

  /** May this person change a kind of room state (canvas, bookmarks)? */
  canSetState(room: Room, type: string): boolean {
    return this.powerOf(room, this.userId) >= (room.powerLevels.events[type] ?? room.powerLevels.state_default);
  }

  async setDescription(roomId: string, description: string): Promise<void> {
    await mx("PUT", paths.state(roomId, DESCRIPTION_TYPE), { description });
  }

  /** Open (in the directory, anyone of the company joins) or closed (invitation only). */
  async setPublic(roomId: string, isPublic: boolean): Promise<void> {
    await mx("PUT", paths.state(roomId, "m.room.join_rules"), { join_rule: isPublic ? "public" : "invite" });
    await mx("PUT", `/_matrix/client/v3/directory/list/room/${encodeURIComponent(roomId)}`, { visibility: isPublic ? "public" : "private" }).catch(() => undefined);
  }

  /** Who writes (everyone or the managers) and who may notify everyone. */
  async setRoomRules(roomId: string, rules: { posting?: "everyone" | "managers"; channelMentions?: "everyone" | "managers" }): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const pl = room.powerLevels;
    const events = { ...pl.events };
    if (rules.posting) events["m.room.message"] = rules.posting === "managers" ? MANAGER_LEVEL : pl.events_default;
    const notifications = { ...(pl.notifications ?? {}), ...(rules.channelMentions ? { room: rules.channelMentions === "managers" ? MANAGER_LEVEL : 0 } : {}) };
    await mx("PUT", paths.state(roomId, "m.room.power_levels"), { ...pl, events, notifications });
  }

  /** Makes someone a manager of the channel, or takes it back. */
  async setManager(roomId: string, userId: string, on: boolean): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const users = { ...room.powerLevels.users };
    if (on) users[userId] = Math.max(MANAGER_LEVEL, users[userId] ?? 0);
    else delete users[userId];
    await mx("PUT", paths.state(roomId, "m.room.power_levels"), { ...room.powerLevels, users });
  }

  /** Removes someone from the channel (they can be invited again). */
  async kick(roomId: string, userId: string): Promise<void> {
    await mx("POST", `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/kick`, { user_id: userId });
  }

  /** Is this person a manager of the channel (moderator or higher)? */
  isManager(room: Room, userId: string): boolean {
    return this.powerOf(room, userId) >= MANAGER_LEVEL;
  }

  /** Who writes and who may notify everyone, read from the room's levels. */
  roomRules(room: Room): { posting: "everyone" | "managers"; channelMentions: "everyone" | "managers" } {
    const pl = room.powerLevels;
    const writeLevel = pl.events["m.room.message"] ?? pl.events_default;
    return { posting: writeLevel > 0 ? "managers" : "everyone", channelMentions: (pl.notifications?.room ?? 50) > 0 ? "managers" : "everyone" };
  }

  /** Archived: read-only for everyone and gone from the directory; messages stay. */
  async archive(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;
    await mx("PUT", paths.state(roomId, ARCHIVED_TYPE), { archived: true });
    await mx("PUT", paths.state(roomId, "m.room.join_rules"), { join_rule: "invite" });
    await mx("PUT", `/_matrix/client/v3/directory/list/room/${encodeURIComponent(roomId)}`, { visibility: "private" }).catch(() => undefined);
    await mx("PUT", paths.state(roomId, "m.room.power_levels"), { ...room.powerLevels, events_default: 100 });
  }

  async setPinned(roomId: string, eventId: string, pinned: boolean): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const next = pinned ? [...new Set([eventId, ...room.pinned])] : room.pinned.filter((id) => id !== eventId);
    await mx("PUT", paths.state(roomId, "m.room.pinned_events"), { pinned: next });
    room.pinned = next;
    this.changed();
  }

  /** Star a channel (Slack's "Favoriten" section). */
  async setFavourite(roomId: string, on: boolean): Promise<void> {
    const room = this.rooms.get(roomId);
    if (on) await mx("PUT", paths.tag(this.userId, roomId, "m.favourite"), { order: 0.5 });
    else await mx("DELETE", paths.tag(this.userId, roomId, "m.favourite"));
    if (room) {
      const tags = { ...room.tags };
      if (on) tags["m.favourite"] = { order: 0.5 };
      else delete tags["m.favourite"];
      room.tags = tags;
      this.changed();
    }
  }

  async setSaved(roomId: string, eventId: string, saved: boolean): Promise<void> {
    const items = saved
      ? [{ roomId, eventId, ts: Date.now() }, ...this.saved.filter((s) => s.eventId !== eventId)].slice(0, 500)
      : this.saved.filter((s) => s.eventId !== eventId);
    this.saved = items;
    this.changed();
    await mx("PUT", paths.accountData(this.userId, SAVED_TYPE), { items });
  }

  /** Mute a channel ("Nichts") or hear only mentions; back to everything with "all". */
  async setNotifications(roomId: string, level: NotifyLevel): Promise<void> {
    const muteId = `${MUTE_PREFIX}${roomId}`;
    await mx("DELETE", paths.pushRule("override", muteId)).catch(() => undefined);
    await mx("DELETE", paths.pushRule("room", roomId)).catch(() => undefined);
    // Step 99: a channel at the default level has no rule of its own; "all" under a lower default has one.
    const own = level !== this.defaultLevel;
    if (own && level === "all") await mx("PUT", paths.pushRule("room", roomId), { actions: ["notify", { set_tweak: "sound", value: "default" }] });
    if (own && level === "mentions") await mx("PUT", paths.pushRule("room", roomId), { actions: [] });
    if (own && level === "none") await mx("PUT", paths.pushRule("override", muteId), { actions: [], conditions: [{ kind: "event_match", key: "room_id", pattern: roomId }] });
    const levels = new Map(this.roomLevels);
    if (own) levels.set(roomId, level);
    else levels.delete(roomId);
    this.roomLevels = levels;
    this.changed();
  }

  /** The level a channel notifies at: its own, else the default. */
  levelOf(roomId: string): NotifyLevel {
    return this.roomLevels.get(roomId) ?? this.defaultLevel;
  }

  /** Step 99, part D: the default for channels (direct messages and mentions notify unless "nothing"). */
  async setDefaultLevel(level: NotifyLevel): Promise<void> {
    await mx("PUT", `${paths.pushRule("override", ".m.rule.master")}/enabled`, { enabled: level === "none" });
    await mx("PUT", `${paths.pushRule("underride", ".m.rule.message")}/enabled`, { enabled: level === "all" });
    this.defaultLevel = level;
    this.changed();
  }

  /** Step 99, part D: @channel / @here in this channel do not notify me. */
  async setIgnoreRoomMentions(roomId: string, ignore: boolean): Promise<void> {
    const id = `${NOROOM_PREFIX}${roomId}`;
    if (ignore)
      await mx("PUT", paths.pushRule("override", id), {
        actions: [],
        conditions: [
          { kind: "event_match", key: "room_id", pattern: roomId },
          { kind: "event_property_is", key: "content.m\\.mentions.room", value: true },
        ],
      });
    else await mx("DELETE", paths.pushRule("override", id)).catch(() => undefined);
    const next = new Set(this.ignoredRoomMentions);
    if (ignore) next.add(roomId);
    else next.delete(roomId);
    this.ignoredRoomMentions = next;
    this.changed();
  }

  /** Step 99, part C: the sidebar's layout, kept on the server for every device. */
  async setSidebar(next: SidebarLayout): Promise<void> {
    const previous = this.sidebar;
    this.sidebar = next;
    this.changed();
    try {
      await mx("PUT", paths.accountData(this.userId, SIDEBAR_TYPE), next);
    } catch (err) {
      this.sidebar = previous;
      this.changed();
      throw err;
    }
  }

  /**
   * Step 99, part E: marks a channel unread, from a message on (Slack: Alt+click)
   * or as a whole. Kept on the server for every device.
   */
  async markUnread(roomId: string, fromId?: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const visible = room.timeline.filter((m) => !m.id.startsWith("~"));
    // Without a message: the last one is unread, as in Slack.
    const at = fromId ? visible.findIndex((m) => m.id === fromId) : visible.length - 1;
    const readUpTo = at > 0 ? (visible[at - 1] as Message).id : null;
    room.markedUnread = { readUpTo };
    room.keepUnread = true;
    this.changed();
    await mx("PUT", paths.roomAccountData(this.userId, roomId, MARKED_UNREAD), { unread: true, ...(readUpTo ? { [READ_UP_TO]: readUpTo } : {}) });
  }

  /**
   * Step 99, part E: every version of an edited message, oldest first: the
   * original event, then each edit (Matrix m.replace relations) by its author.
   */
  async editHistory(roomId: string, eventId: string): Promise<{ ts: number; body: string }[]> {
    const original = await mx<RawEvent>("GET", `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/event/${encodeURIComponent(eventId)}`);
    const edits = await mx<{ chunk?: RawEvent[] }>("GET", `${paths.relations(roomId, eventId, "m.replace")}?limit=50`);
    const body = (c: Record<string, unknown> | undefined) => (typeof c?.body === "string" ? c.body : "");
    const versions = (edits.chunk ?? [])
      // Only the author's own edits count (Matrix ignores others').
      .filter((e) => e.sender === original.sender && e.type === "m.room.message")
      .map((e) => ({ ts: e.origin_server_ts ?? 0, body: body(e.content["m.new_content"] as Record<string, unknown> | undefined) }))
      .sort((a, b) => a.ts - b.ts);
    return [{ ts: original.origin_server_ts ?? 0, body: body(original.content) }, ...versions];
  }

  /** Keeps a draft (empty text removes it); saved to the server a moment after typing stops. */
  setDraft(key: string, text: string): void {
    const current = this.drafts[key]?.text ?? "";
    if (current === text) return;
    const next = { ...this.drafts };
    if (text.trim()) next[key] = { text: text.slice(0, MAX_DRAFT_CHARS), ts: Date.now() };
    else delete next[key];
    // The newest ones when there are too many.
    const keys = Object.keys(next).sort((a, b) => (next[b] as Draft).ts - (next[a] as Draft).ts);
    for (const k of keys.slice(MAX_DRAFTS)) delete next[k];
    this.drafts = next;
    this.changed();
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => {
      this.draftTimer = null;
      void mx("PUT", paths.accountData(this.userId, DRAFTS_TYPE), { items: this.drafts }).catch(() => undefined);
    }, 800);
  }

  /** Has new messages, or was marked unread. */
  isUnread(room: Room): boolean {
    return room.notifications > 0 || room.highlights > 0 || !!room.markedUnread;
  }

  /** Marks every channel and direct message as read (Slack: Shift+Esc). */
  async markAllRead(): Promise<void> {
    const unread = [...this.rooms.values()].filter((r) => r.membership === "join" && this.isUnread(r));
    for (const r of unread) r.keepUnread = false;
    await Promise.all(unread.map((r) => this.markRead(r.id)));
  }

  /** Own keywords: a message containing one notifies like a mention (Slack's "My keywords"). */
  async keywords(): Promise<string[]> {
    const res = await mx<{ global?: { content?: { rule_id: string; pattern?: string }[] } }>("GET", paths.pushRules);
    return (res.global?.content ?? []).filter((r) => r.rule_id.startsWith(KEYWORD_PREFIX) && r.pattern).map((r) => r.pattern as string);
  }

  async setKeywords(words: string[]): Promise<void> {
    const wanted = new Map(words.map((w) => [keywordRuleId(w), w]));
    const res = await mx<{ global?: { content?: { rule_id: string }[] } }>("GET", paths.pushRules);
    for (const rule of res.global?.content ?? [])
      if (rule.rule_id.startsWith(KEYWORD_PREFIX) && !wanted.has(rule.rule_id)) await mx("DELETE", paths.pushRule("content", rule.rule_id));
    for (const [id, pattern] of wanted)
      await mx("PUT", paths.pushRule("content", id), { pattern, actions: ["notify", { set_tweak: "sound", value: "default" }, { set_tweak: "highlight" }] });
  }

  /** The current notification level of a channel. */
  /** The current level of a channel (the push rules come with the sync). */
  async notificationLevel(roomId: string): Promise<NotifyLevel> {
    return this.levelOf(roomId);
  }

  async publicChannels(): Promise<{ roomId: string; name: string; topic: string | null; members: number }[]> {
    const res = await mx<{ chunk?: { room_id: string; name?: string; topic?: string; num_joined_members?: number }[] }>("POST", paths.publicRooms, { limit: 500 });
    return (res.chunk ?? []).map((r) => ({ roomId: r.room_id, name: r.name ?? r.room_id, topic: r.topic ?? null, members: r.num_joined_members ?? 0 }));
  }

  /** The company's open channels, for "#name" links; kept a few minutes. */
  private directory: { at: number; list: ChannelRef[] } | null = null;

  async loadChannelDirectory(maxAgeMs = CHANNEL_DIRECTORY_MS): Promise<void> {
    if (this.directory && Date.now() - this.directory.at < maxAgeMs) return;
    const previous = this.directory;
    // One request at a time.
    this.directory = { at: Date.now(), list: previous?.list ?? [] };
    try {
      const list = await this.publicChannels();
      this.directory = { at: Date.now(), list: list.filter((c) => c.name && c.name !== c.roomId).map((c) => ({ roomId: c.roomId, name: c.name })) };
    } catch {
      this.directory = previous;
    }
  }

  /**
   * Channels "#name" in a message links to, like in Slack: mine and the
   * company's open ones. One name, one channel: the one I am in wins.
   */
  channelRefs(): ChannelRef[] {
    const byName = new Map<string, ChannelRef>();
    for (const c of this.directory?.list ?? []) if (!byName.has(c.name)) byName.set(c.name, c);
    for (const r of this.rooms.values()) {
      if (r.kind !== "channel" || !r.name || (r.membership !== "join" && r.membership !== "invite")) continue;
      const known = byName.get(r.name);
      if (!known || r.membership === "join") byName.set(r.name, { roomId: r.id, name: r.name });
    }
    return [...byName.values()];
  }

  /**
   * A channel link was clicked (a room id, or a Matrix address "#name:server"
   * from other clients). Joined: its id. Invited or open in the company's
   * directory: joins first. Otherwise null (closed channel, not for me).
   */
  async openChannel(target: string): Promise<string | null> {
    let roomId = target;
    if (target.startsWith("#")) {
      const res = await mx<{ room_id?: string }>("GET", paths.alias(target)).catch(() => null);
      if (!res?.room_id) return null;
      roomId = res.room_id;
    }
    const room = this.rooms.get(roomId);
    if (room?.membership === "join") return roomId;
    if (room?.membership !== "invite") {
      await this.loadChannelDirectory(0);
      if (!this.directory?.list.some((c) => c.roomId === roomId)) return null;
    }
    await this.join(roomId);
    return roomId;
  }

  async search(term: string, filter: { rooms?: string[]; senders?: string[] } = {}): Promise<SearchHit[]> {
    const res = await mx<{ search_categories?: { room_events?: { results?: { rank: number; result: RawEvent & { room_id: string } }[] } } }>("POST", paths.search, {
      search_categories: {
        room_events: {
          search_term: term,
          order_by: "recent",
          filter: { ...(filter.rooms ? { rooms: filter.rooms } : {}), ...(filter.senders ? { senders: filter.senders } : {}), limit: 50 },
        },
      },
    });
    return (res.search_categories?.room_events?.results ?? [])
      .filter((r) => r.result.type === "m.room.message")
      .map((r) => ({ roomId: r.result.room_id, rank: r.rank, message: toMessage(r.result.room_id, r.result) }));
  }

  // --- Reading helpers for the interface -----------------------------------

  displayName(userId: string, room?: Room): string {
    return room?.members.get(userId)?.displayName ?? this.people.get(userId)?.displayName ?? userId.slice(1).split(":")[0] ?? userId;
  }

  /** The name a channel or direct conversation shows. */
  roomName(room: Room): string {
    if (room.name) return room.name;
    if (room.kind === "dm") {
      const partners = this.dmPartners(room);
      if (partners.length) return partners.map((u) => this.displayName(u, room)).join(", ");
    }
    return room.id;
  }

  dmPartners(room: Room): string[] {
    const fromDirect = Object.entries(this.direct)
      .filter(([, ids]) => ids.includes(room.id))
      .map(([u]) => u);
    if (fromDirect.length) return fromDirect;
    return [...room.members.values()].filter((m) => m.userId !== this.userId && (m.membership === "join" || m.membership === "invite")).map((m) => m.userId);
  }

  powerOf(room: Room, userId: string): number {
    return room.powerLevels.users[userId] ?? room.powerLevels.users_default;
  }

  can(room: Room, action: "send" | "state" | "redact" | "invite" | "pin" | "kick" | "mentionRoom"): boolean {
    const mine = this.powerOf(room, this.userId);
    const pl = room.powerLevels;
    switch (action) {
      case "send":
        return !room.archived && mine >= (pl.events["m.room.message"] ?? pl.events_default);
      case "state":
        return mine >= pl.state_default;
      case "redact":
        return mine >= pl.redact;
      case "invite":
        return mine >= pl.invite;
      case "pin":
        return mine >= (pl.events["m.room.pinned_events"] ?? pl.state_default);
      case "kick":
        return mine >= pl.kick;
      case "mentionRoom":
        return mine >= (pl.notifications?.room ?? 50);
    }
  }

  /** Unread across the chat: for the navigation badge. */
  totals(): { notifications: number; highlights: number } {
    let notifications = 0;
    let highlights = 0;
    for (const room of this.rooms.values()) {
      if (room.membership !== "join" || room.kind === "space") continue;
      notifications += room.notifications;
      highlights += room.highlights;
      for (const t of room.threadUnread.values()) highlights += t.highlights;
    }
    return { notifications, highlights };
  }
}

export interface SyncResponse {
  next_batch: string;
  account_data?: { events?: RawEvent[] };
  presence?: { events?: RawEvent[] };
  rooms?: {
    join?: Record<
      string,
      {
        state?: { events?: RawEvent[] };
        timeline?: { events?: RawEvent[]; limited?: boolean; prev_batch?: string };
        ephemeral?: { events?: RawEvent[] };
        account_data?: { events?: RawEvent[] };
        unread_notifications?: { notification_count?: number; highlight_count?: number };
        unread_thread_notifications?: Record<string, { notification_count?: number; highlight_count?: number }>;
      }
    >;
    invite?: Record<string, { invite_state?: { events?: { type: string; state_key?: string; sender: string; content: Record<string, unknown> }[] } }>;
    leave?: Record<string, unknown>;
  };
}
