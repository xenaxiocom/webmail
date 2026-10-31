// Step 99, part E2: "Later" in Rooms, as in Slack — reminders about messages
// and messages sent later. The platform keeps them, reminds by push at the
// time and sends a scheduled message as the person.
import { create } from "zustand";
import { apiFetch } from "@/lib/browser-navigation";

export interface ChatReminder {
  id: string;
  roomId: string;
  eventId: string;
  roomName: string | null;
  preview: string;
  remindAt: string;
  notifiedAt: string | null;
  doneAt: string | null;
}

export interface ChatScheduledMessage {
  id: string;
  roomId: string;
  roomName: string | null;
  threadRoot: string | null;
  preview: string;
  sendAt: string;
  sentAt: string | null;
  eventId: string | null;
  error: string | null;
}

const json = { Accept: "application/json", "Content-Type": "application/json", "x-xenaxio-csrf": "1" };

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, { method, credentials: "same-origin", headers: json, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return (await res.json()) as T;
}

interface LaterStore {
  reminders: ChatReminder[];
  scheduled: ChatScheduledMessage[];
  loaded: boolean;
  load: () => Promise<void>;
  remind: (input: { roomId: string; eventId: string; roomName: string | null; preview: string; remindAt: string }) => Promise<void>;
  changeReminder: (id: string, change: { remindAt?: string; done?: boolean }) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
  schedule: (input: { roomId: string; roomName: string | null; threadRoot: string | null; content: Record<string, unknown>; sendAt: string }) => Promise<void>;
  changeScheduled: (id: string, change: { sendAt?: string }) => Promise<void>;
  deleteScheduled: (id: string) => Promise<void>;
}

export const useChatLater = create<LaterStore>((set, get) => ({
  reminders: [],
  scheduled: [],
  loaded: false,
  load: async () => {
    const res = await call<{ reminders: ChatReminder[]; scheduled: ChatScheduledMessage[] }>("GET", "/api/chat/later");
    set({ ...res, loaded: true });
  },
  remind: async (input) => {
    await call("POST", "/api/chat/reminders", input);
    await get().load();
  },
  changeReminder: async (id, change) => {
    await call("PATCH", `/api/chat/reminders/${id}`, change);
    await get().load();
  },
  deleteReminder: async (id) => {
    await call("DELETE", `/api/chat/reminders/${id}`);
    await get().load();
  },
  schedule: async (input) => {
    await call("POST", "/api/chat/scheduled", input);
    await get().load();
  },
  changeScheduled: async (id, change) => {
    await call("PATCH", `/api/chat/scheduled/${id}`, change);
    await get().load();
  },
  deleteScheduled: async (id) => {
    await call("DELETE", `/api/chat/scheduled/${id}`);
    await get().load();
  },
}));

/** Due: its time has come and it is not done (Slack shows these first). */
export function isDue(r: ChatReminder, now = Date.now()): boolean {
  return !r.doneAt && Date.parse(r.remindAt) <= now;
}

export type LaterChoice = "20m" | "1h" | "3h" | "tomorrow" | "monday";

/** Slack's quick times: in 20 minutes, an hour, three hours; tomorrow at 9; next Monday at 9. */
export function laterTime(choice: LaterChoice, now = new Date()): Date {
  if (choice === "20m" || choice === "1h" || choice === "3h") return new Date(now.getTime() + { "20m": 20, "1h": 60, "3h": 180 }[choice] * 60_000);
  const d = new Date(now);
  d.setHours(9, 0, 0, 0);
  if (choice === "tomorrow") d.setDate(d.getDate() + 1);
  else d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7));
  return d;
}

/** A value for <input type="datetime-local"> in the browser's time zone. */
export function localInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
