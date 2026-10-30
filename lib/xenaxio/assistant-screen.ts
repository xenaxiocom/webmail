// Step 89: the screen the assistant is asked from. The platform gets ids and
// paths only (what is open on the page); the panel shows the names, so the
// person sees what the assistant looks at first.
import { useEffect } from "react";
import { create } from "zustand";
import { assistantIds, type ChatContext, pageOf, type ScreenOpen, type UiPage } from "@/lib/xenaxio/assistant";

/** Emails of a selection the assistant is told about (the platform takes 20). */
export const MAX_SELECTED_EMAILS = 20;

/** Something open in a component's own state (the calendar's event card, the files preview). */
export interface ScreenItem {
  id: string;
  name: string;
  /** Events: the local day and time it starts. */
  day?: string;
  time?: string;
}

type ItemKind = "event" | "task" | "file";

interface ScreenItems {
  items: Partial<Record<ItemKind, ScreenItem>>;
  set: (kind: ItemKind, item: ScreenItem | null) => void;
}

export const useScreenItems = create<ScreenItems>((set) => ({
  items: {},
  set: (kind, item) =>
    set((s) => {
      const items = { ...s.items };
      if (item) items[kind] = item;
      else delete items[kind];
      return { items };
    }),
}));

/** Publishes what a component has open for as long as it is open. */
export function useAssistantScreenItem(kind: ItemKind, item: ScreenItem | null): void {
  const set = useScreenItems((s) => s.set);
  const { id, name, day, time } = item ?? {};
  useEffect(() => {
    if (!id) return;
    set(kind, { id, name: name ?? "", ...(day ? { day } : {}), ...(time ? { time } : {}) });
    return () => set(kind, null);
  }, [set, kind, id, name, day, time]);
}

/** An event's start as the screen item wants it: id of the series for an occurrence, local day and time. */
export function eventItem(e: { id: string; baseEventId?: string | null; originalId?: string; title?: string; start?: string } | null | undefined): ScreenItem | null {
  if (!e) return null;
  const start = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(e.start ?? "");
  return { id: e.baseEventId || e.originalId || e.id, name: e.title ?? "", ...(start?.[1] ? { day: start[1] } : {}), ...(start?.[2] ? { time: start[2] } : {}) };
}

type MailRef = { id: string; threadId: string; subject?: string | null; mailboxIds?: Record<string, boolean> | null };
type ChatView = { kind: "room"; roomId: string } | { kind: string };
type ChatPanel = { kind: "thread"; roomId: string; rootId: string } | { kind: string } | null;

/** Everything the screen is made of, read from the stores. */
export interface ScreenState {
  /** Path without the language. */
  pathname: string;
  email?: MailRef | null;
  selected?: MailRef[];
  calendar?: { view: string; date: Date };
  items?: Partial<Record<ItemKind, ScreenItem>>;
  folder?: string;
  chat?: { view: ChatView; panel: ChatPanel; roomName: (id: string) => string | undefined };
  contact?: { address?: string; name: string } | null;
}

/** What the panel shows: what is open, by name. */
export interface ScreenLabel {
  kind: "email" | "emails" | ScreenOpen["kind"] | "folder" | "view" | "page";
  name: string;
}

export interface Screen {
  page?: UiPage;
  context: ChatContext;
  label?: ScreenLabel;
}

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Step 89: the screen for the assistant, from the path and the stores. */
export function screenOf(s: ScreenState): Screen {
  const path = s.pathname.replace(/\/+$/, "") || "/";
  const page = pageOf(path);
  if (!page) return { context: {} };
  const context: ChatContext = { page };
  let label: ScreenLabel | undefined;
  const open = (o: ScreenOpen, name: string) => {
    context.open = o;
    label = { kind: o.kind, name };
  };

  if (page === "mail") {
    // Only on the mail page: the selected email stays in its store when the person moves on.
    if (s.email) {
      Object.assign(context, assistantIds(s.email));
      label = { kind: "email", name: s.email.subject ?? "" };
    } else if ((s.selected?.length ?? 0) >= 2) {
      context.selectedEmailIds = s.selected!.slice(0, MAX_SELECTED_EMAILS).map((m) => assistantIds(m).emailId);
      label = { kind: "emails", name: String(s.selected!.length) };
    }
  } else if (page === "calendar") {
    if (s.calendar && s.calendar.view !== "tasks") {
      context.view = s.calendar.view;
      context.day = localDay(s.calendar.date);
    }
    const event = s.items?.event;
    const linked = /^\/calendar\/event\/([^/]+)$/.exec(path);
    if (event) open({ kind: "event", id: event.id, ...(event.day ? { day: event.day } : {}), ...(event.time ? { time: event.time } : {}) }, event.name);
    else if (linked?.[1]) open({ kind: "event", id: decodeURIComponent(linked[1]) }, "");
    if (s.items?.task) open({ kind: "task", id: s.items.task.id }, s.items.task.name);
  } else if (page === "tasks") {
    if (s.items?.task) open({ kind: "task", id: s.items.task.id }, s.items.task.name);
  } else if (page === "files") {
    if (s.folder) {
      context.folder = s.folder.startsWith("/") ? s.folder : `/${s.folder}`;
      if (context.folder !== "/") label = { kind: "folder", name: context.folder };
    }
    if (s.items?.file) open({ kind: "file", id: s.items.file.id }, s.items.file.name);
  } else if (page === "rooms" && s.chat) {
    const { view, panel, roomName } = s.chat;
    if (panel?.kind === "thread" && "rootId" in panel) open({ kind: "thread", id: panel.rootId, room: panel.roomId }, roomName(panel.roomId) ?? "");
    else if (view.kind === "room" && "roomId" in view) open({ kind: "room", id: view.roomId }, roomName(view.roomId) ?? "");
    else if (view.kind !== "home") {
      context.view = view.kind;
      label = { kind: "view", name: view.kind };
    }
  } else if (page === "contacts") {
    if (s.contact?.address) open({ kind: "contact", id: s.contact.address }, s.contact.name);
  } else {
    // Settings and administration: the platform finds the page's settings in its catalog.
    if (/^\/(settings|workspace)(\/[A-Za-z0-9_-]+)+$/.test(path)) {
      context.path = `${path}/`;
      label = { kind: "page", name: path };
    }
  }
  return { page, context, ...(label ? { label } : {}) };
}

/** Step 89: one-click questions in the empty panel that fit the screen (keys of `assistant.screen.ask_*`). */
export function screenSuggestions(screen: Screen): string[] {
  const kind = screen.label?.kind;
  switch (screen.page) {
    case "mail":
      return kind === "email" ? ["email_tasks", "email_points"] : kind === "emails" ? ["emails_summary", "emails_open"] : ["mail_new", "mail_waiting"];
    case "calendar":
      return kind === "event" ? ["event_prepare", "event_move"] : kind === "task" ? ["task_help", "task_due"] : ["calendar_week", "calendar_free"];
    case "tasks":
      return kind === "task" ? ["task_help", "task_due"] : ["tasks_urgent", "tasks_week"];
    case "files":
      return kind === "file" ? ["file_summary", "file_points"] : ["folder_contents", "folder_find"];
    case "rooms":
      return kind === "thread" ? ["thread_summary", "thread_open"] : kind === "room" ? ["room_missed", "room_summary"] : ["rooms_missed", "rooms_mentions"];
    case "contacts":
      return kind === "contact" ? ["contact_last", "contact_open"] : ["contacts_find"];
    case "settings":
    case "workspace": {
      const path = screen.context.path ?? "";
      if (path.startsWith("/settings/vacation/")) return ["vacation_on", "page_what"];
      if (path.startsWith("/settings/account/")) return ["signature_write", "page_what"];
      return path ? ["page_what", "page_how"] : ["settings_find"];
    }
    default:
      return [];
  }
}
