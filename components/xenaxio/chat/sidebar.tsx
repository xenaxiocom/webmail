"use client";

// Step 43, part B: the chat's left column, as in Slack — company name, jump
// and search, Threads / Erwähnungen / Gespeichert, starred, channels, direct
// messages and invitations; unread in bold, mentions as a badge. Step 99,
// part C: a menu on every channel (right click, "⋯", long press), own
// sections with drag and drop, order per section, "unread only", Shift+Esc
// marks everything read; the layout is kept on the server (account data).
import { IconAdjustmentsHorizontal, IconAlarm, IconAt, IconCards, IconHeadphones, IconMessage2, IconPencil, IconVolume, IconBellOff, IconBookmark, IconChevronDown, IconChevronRight, IconDots, IconHash, IconLock, IconMessages, IconPlus, IconSearch, IconSparkles, IconWorld } from "@tabler/icons-react";
import { useLocale } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { type ChatClient, type Room, type SectionSort, type SidebarLayout, serverOfUser } from "@/lib/xenaxio/chat/client";
import { type ChatView, useChatStore } from "@/lib/xenaxio/chat/store";
import { moveRoom, newSectionId, sidebarGroups, threadsOf } from "@/lib/xenaxio/chat/view";
import { sendAssistantCommand } from "@/lib/xenaxio/assistant";
import { useXT } from "@/lib/xenaxio/i18n";
import { toast } from "@/stores/toast-store";
import { NotifyButton } from "./notifications";
import { cn } from "@/lib/utils";
import { channelLink, PersonAvatar, presenceOf, useAssistant } from "./common";
import { useChatDialogs } from "./dialogs";
import { useLongPress } from "./message-sheet";
import { isDue, useChatLater } from "@/lib/xenaxio/chat/later";
import { useChatExtras } from "@/lib/xenaxio/chat/extras";

const ROOM_DRAG = "application/x-xenaxio-room";

/** A menu next to what opened it; closes on a click outside and on Escape. */
function Popover({ onClose, className, children }: { onClose: () => void; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (e: MouseEvent | TouchEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", outside);
    document.addEventListener("touchstart", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("touchstart", outside);
      document.removeEventListener("keydown", key);
    };
  }, [onClose]);
  return (
    <div ref={ref} role="menu" className={cn("absolute z-40 w-60 rounded-md border border-border bg-popover py-1 text-sm shadow-lg", className)}>
      {children}
    </div>
  );
}

function MenuItem({ onClick, children, checked, danger }: { onClick: () => void; children: React.ReactNode; checked?: boolean; danger?: boolean }) {
  return (
    <button type="button" role={checked === undefined ? "menuitem" : "menuitemradio"} aria-checked={checked} onClick={onClick} className={cn("flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-accent", danger && "text-destructive", checked && "font-semibold")}>
      <span>{children}</span>
      {checked && <span aria-hidden>✓</span>}
    </button>
  );
}

const MenuLabel = ({ children }: { children: React.ReactNode }) => <div className="px-3 pb-0.5 pt-2 text-[11px] font-semibold uppercase text-muted-foreground">{children}</div>;
const MenuLine = () => <div className="my-1 border-t border-border" />;

/** Saves the layout; says so when the server refuses. */
function useLayout(client: ChatClient) {
  const t = useXT();
  return (change: (layout: SidebarLayout) => SidebarLayout) => void client.setSidebar(change(client.sidebar)).catch(() => toast.error(t("chat.error")));
}

/** The menu of one channel or direct message in the sidebar. */
function RoomMenu({ client, room, onClose }: { client: ChatClient; room: Room; onClose: () => void }) {
  const t = useXT();
  const locale = useLocale();
  const { prompt, confirm } = useChatDialogs();
  const setView = useChatStore((s) => s.setView);
  const save = useLayout(client);
  const starred = !!room.tags["m.favourite"];
  const level = client.levelOf(room.id);
  const inSection = client.sidebar.sections.find((s) => s.rooms.includes(room.id))?.id ?? null;
  const run = (job: () => Promise<unknown> | void) => () => {
    onClose();
    void Promise.resolve(job()).catch(() => toast.error(t("chat.error")));
  };
  const moveTo = (to: string | null) => async () => {
    if (starred && to) await client.setFavourite(room.id, false);
    save((l) => moveRoom(l, room.id, to));
  };
  return (
    <Popover onClose={onClose} className="left-2 top-8">
      <MenuItem onClick={run(() => client.setFavourite(room.id, !starred))}>{starred ? t("chat.unstar") : t("chat.star")}</MenuItem>
      <MenuLabel>{t("chat.side_move")}</MenuLabel>
      {client.sidebar.sections.map((s) => (
        <MenuItem key={s.id} checked={inSection === s.id} onClick={run(moveTo(s.id))}>
          {s.name}
        </MenuItem>
      ))}
      <MenuItem checked={!inSection && !starred} onClick={run(moveTo(null))}>
        {room.kind === "dm" ? t("chat.direct") : t("chat.channels")}
      </MenuItem>
      <MenuItem
        onClick={run(async () => {
          const name = (await prompt({ title: t("chat.side_new_section"), defaultValue: "", confirmText: t("chat.create") }))?.trim();
          if (!name) return;
          const id = newSectionId();
          if (starred) await client.setFavourite(room.id, false);
          save((l) => moveRoom({ ...l, sections: [...l.sections, { id, name: name.slice(0, 80), rooms: [] }] }, room.id, id));
        })}
      >
        {t("chat.side_new_section")}…
      </MenuItem>
      <MenuLabel>{t("chat.notifications")}</MenuLabel>
      {(["all", "mentions", "none"] as const).map((l) => (
        <MenuItem key={l} checked={level === l} onClick={run(() => client.setNotifications(room.id, l))}>
          {t(`chat.notify_${l}`)}
        </MenuItem>
      ))}
      {room.kind === "channel" && (
        <MenuItem checked={client.ignoredRoomMentions.has(room.id)} onClick={run(() => client.setIgnoreRoomMentions(room.id, !client.ignoredRoomMentions.has(room.id)))}>
          {t("chat.notify_ignore_room")}
        </MenuItem>
      )}
      <MenuLine />
      {client.isUnread(room) ? (
        <MenuItem
          onClick={run(() => {
            room.keepUnread = false;
            return client.markRead(room.id);
          })}
        >
          {t("chat.side_mark_read")}
        </MenuItem>
      ) : (
        <MenuItem onClick={run(() => client.markUnread(room.id))}>{t("chat.mark_unread")}</MenuItem>
      )}
      <MenuItem
        onClick={run(async () => {
          await navigator.clipboard.writeText(channelLink(locale, room.id));
          toast.success(t("chat.copied"));
        })}
      >
        {t("chat.copy_link")}
      </MenuItem>
      {room.kind === "channel" && (
        <MenuItem
          danger
          onClick={run(async () => {
            const name = client.roomName(room);
            if (!(await confirm({ title: t("chat.leave"), message: t("chat.leave_confirm", { name }), confirmText: t("chat.leave") }))) return;
            await client.leave(room.id);
            setView({ kind: "home" });
          })}
        >
          {t("chat.leave")}
        </MenuItem>
      )}
    </Popover>
  );
}

function RoomRow({ client, room, active, onOpen, onDropBefore }: { client: ChatClient; room: Room; active: boolean; onOpen: () => void; onDropBefore?: (roomId: string) => void }) {
  const t = useXT();
  const [menu, setMenu] = useState(false);
  const closeMenu = () => setMenu(false);
  const longPress = useLongPress(() => setMenu(true));
  const name = client.roomName(room);
  const muted = client.roomLevels.get(room.id) === "none";
  // Step 99, part H: a call going on in the room (Slack's huddle sign, Discord's voice channel).
  const inCall = useChatExtras((s) => s.calls.get(room.id) ?? 0);
  const threadHighlights = [...room.threadUnread.values()].reduce((n, c) => n + c.highlights, 0);
  const badge = room.kind === "dm" ? room.notifications : room.highlights + threadHighlights;
  const unread = room.notifications > 0 || badge > 0 || !!room.markedUnread;
  const partner = room.kind === "dm" ? client.dmPartners(room)[0] : undefined;
  return (
    <div
      className="group/row relative"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(ROOM_DRAG, room.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (onDropBefore && e.dataTransfer.types.includes(ROOM_DRAG)) e.preventDefault();
      }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(ROOM_DRAG);
        if (!onDropBefore || !id || id === room.id) return;
        e.preventDefault();
        e.stopPropagation();
        onDropBefore(id);
      }}
      {...longPress}
      // A right click (and Android's long press) opens the menu too.
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu(true);
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded-md px-2 pr-7 text-left text-sm",
          active ? "bg-primary text-primary-foreground" : "hover:bg-accent",
          !active && !unread && "text-muted-foreground",
          unread && !active && "font-semibold text-foreground",
          muted && !active && "opacity-60",
        )}
      >
        {room.kind === "dm" ? (
          partner ? <PersonAvatar userId={partner} name={name} size="sm" presence={presenceOf(client, partner)} className="scale-[0.8]" /> : <IconMessages size={16} />
        ) : room.voice ? (
          <IconVolume size={16} className="shrink-0 opacity-80" />
        ) : room.forum ? (
          <IconMessage2 size={16} className="shrink-0 opacity-80" />
        ) : room.external ? (
          <IconWorld size={16} className="shrink-0 opacity-80" />
        ) : room.joinRule === "public" ? (
          <IconHash size={16} className="shrink-0 opacity-80" />
        ) : (
          <IconLock size={16} className="shrink-0 opacity-80" />
        )}
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {room.kind === "dm" && partner && client.isExternalUser(partner) && <span className="shrink-0 text-[10px] opacity-70">{serverOfUser(partner)}</span>}
        {muted && <IconBellOff size={13} className="shrink-0 opacity-70" aria-label={t("chat.notify_none")} />}
        {inCall > 0 && (
          <span className={cn("flex shrink-0 items-center gap-0.5 text-[11px] font-semibold", active ? "" : "text-emerald-600")} title={t("chat.call_running_count", { count: inCall })} aria-label={t("chat.call_running_count", { count: inCall })}>
            <IconHeadphones size={13} />
            {inCall}
          </span>
        )}
        {badge > 0 && <span className={cn("min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold leading-5", active ? "bg-primary-foreground text-primary" : "bg-red-500 text-white")}>{badge}</span>}
      </button>
      <button
        type="button"
        onClick={() => setMenu((m) => !m)}
        aria-label={t("chat.side_room_menu", { name })}
        aria-haspopup="menu"
        className={cn("absolute right-1 top-1 rounded p-0.5 opacity-0 group-hover/row:opacity-100 focus:opacity-100", active ? "text-primary-foreground hover:bg-primary-foreground/20" : "text-muted-foreground hover:bg-accent", menu && "opacity-100")}
      >
        <IconDots size={14} />
      </button>
      {menu && <RoomMenu client={client} room={room} onClose={closeMenu} />}
    </div>
  );
}

function Section({
  id,
  title,
  collapsed,
  onToggle,
  action,
  actionLabel,
  onDropRoom,
  menu,
  children,
}: {
  id: string;
  title: string;
  collapsed: boolean;
  onToggle: (id: string) => void;
  action?: () => void;
  actionLabel?: string;
  onDropRoom?: (roomId: string) => void;
  menu?: (close: () => void) => React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useXT();
  const [over, setOver] = useState(false);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <div
      className={cn("mt-3 rounded-md", over && "bg-primary/10 ring-1 ring-primary/40")}
      onDragOver={(e) => {
        if (onDropRoom && e.dataTransfer.types.includes(ROOM_DRAG)) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setOver(false);
      }}
      onDrop={(e) => {
        setOver(false);
        const roomId = e.dataTransfer.getData(ROOM_DRAG);
        if (onDropRoom && roomId) {
          e.preventDefault();
          onDropRoom(roomId);
        }
      }}
      data-section={id}
    >
      <div className="group relative flex items-center px-1">
        <button type="button" onClick={() => onToggle(id)} className="flex flex-1 items-center gap-1 rounded px-1 py-1 text-left text-xs font-semibold text-muted-foreground hover:text-foreground">
          {collapsed ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
          {title}
        </button>
        {menu && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={t("chat.side_section_menu", { name: title })}
            aria-haspopup="menu"
            className="rounded p-1 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <IconDots size={14} />
          </button>
        )}
        {action && (
          <button type="button" onClick={action} aria-label={actionLabel} title={actionLabel} className="rounded p-1 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100 focus:opacity-100">
            <IconPlus size={14} />
          </button>
        )}
        {open && menu && <Popover onClose={close} className="right-1 top-7">{menu(close)}</Popover>}
      </div>
      {!collapsed && <div className="space-y-0.5 px-1">{children}</div>}
    </div>
  );
}

/** Order of a section, and for own sections: rename and delete. */
function SectionMenu({ client, id, own, close }: { client: ChatClient; id: string; own: boolean; close: () => void }) {
  const t = useXT();
  const { prompt, confirm } = useChatDialogs();
  const save = useLayout(client);
  const current: SectionSort = client.sidebar.sort[id] ?? (own ? "manual" : id === "direct" ? "activity" : "alpha");
  const section = client.sidebar.sections.find((s) => s.id === id);
  const sorts: SectionSort[] = own ? ["manual", "alpha", "activity"] : ["alpha", "activity"];
  return (
    <>
      <MenuLabel>{t("chat.side_sort")}</MenuLabel>
      {sorts.map((k) => (
        <MenuItem key={k} checked={current === k} onClick={() => (close(), save((l) => ({ ...l, sort: { ...l.sort, [id]: k } })))}>
          {t(`chat.side_sort_${k}`)}
        </MenuItem>
      ))}
      {own && section && (
        <>
          <MenuLine />
          <MenuItem
            onClick={async () => {
              close();
              const name = (await prompt({ title: t("chat.side_rename_section"), defaultValue: section.name, confirmText: t("chat.save_edit") }))?.trim();
              if (name) save((l) => ({ ...l, sections: l.sections.map((s) => (s.id === id ? { ...s, name: name.slice(0, 80) } : s)) }));
            }}
          >
            {t("chat.side_rename_section")}
          </MenuItem>
          <MenuItem
            danger
            onClick={async () => {
              close();
              if (await confirm({ title: t("chat.side_delete_section"), message: t("chat.side_delete_section_confirm", { name: section.name }), confirmText: t("chat.side_delete_section"), variant: "destructive" }))
                save((l) => ({ ...l, sections: l.sections.filter((s) => s.id !== id), collapsed: l.collapsed.filter((c) => c !== id) }));
            }}
          >
            {t("chat.side_delete_section")}
          </MenuItem>
        </>
      )}
    </>
  );
}

export function ChatSidebar({
  client,
  companyName,
  onJump,
  onCreateChannel,
  onNewMessage,
  onNotify,
}: {
  client: ChatClient;
  companyName: string;
  onJump: () => void;
  onCreateChannel: () => void;
  onNewMessage: () => void;
  onNotify: () => void;
}) {
  const t = useXT();
  const view = useChatStore((s) => s.view);
  const setView = useChatStore((s) => s.setView);
  const setPanel = useChatStore((s) => s.setPanel);
  const { prompt } = useChatDialogs();
  const save = useLayout(client);
  const layout = client.sidebar;
  const collapsed = new Set(layout.collapsed);
  const toggle = (key: string) => save((l) => ({ ...l, collapsed: l.collapsed.includes(key) ? l.collapsed.filter((c) => c !== key) : [...l.collapsed, key] }));
  const [options, setOptions] = useState(false);
  // Step 99, part E2: "Later" with the count of due reminders.
  const laterReminders = useChatLater((s) => s.reminders);
  const laterScheduled = useChatLater((s) => s.scheduled);
  const laterDue = laterReminders.filter((r) => isDue(r)).length;
  const laterAny = laterReminders.length + laterScheduled.length > 0;
  // Step 99, part H: how many channels "Catch up" goes through.
  const unreadRooms = [...client.rooms.values()].filter((r) => r.membership === "join" && r.kind !== "space" && client.isUnread(r)).length;
  const ai = useAssistant();
  const [search, setSearch] = useState("");
  const rooms = [...client.rooms.values()];
  const sections = sidebarGroups(rooms, (r) => client.roomName(r), layout, view.kind === "room" ? view.roomId : null);
  const threadNews = threadsOf(rooms, client.userId).reduce((n, x) => n + x.unread, 0);
  const isActive = (v: ChatView) => JSON.stringify(v) === JSON.stringify(view);
  const open = (roomId: string) => {
    setView({ kind: "room", roomId });
    setPanel(null);
  };
  /** A room dropped on a section: favourites star it; an own section takes it; "Kanäle" / "Direkt" take it back. */
  const dropInto = (to: "starred" | string | null, before?: string) => async (roomId: string) => {
    const room = client.rooms.get(roomId);
    if (!room) return;
    try {
      if (to === "starred") {
        if (!room.tags["m.favourite"]) await client.setFavourite(roomId, true);
        return;
      }
      if (room.tags["m.favourite"]) await client.setFavourite(roomId, false);
      await client.setSidebar(moveRoom(client.sidebar, roomId, to, before));
    } catch {
      toast.error(t("chat.error"));
    }
  };
  const newSection = async () => {
    const name = (await prompt({ title: t("chat.side_new_section"), defaultValue: "", confirmText: t("chat.create") }))?.trim();
    if (name) save((l) => ({ ...l, sections: [...l.sections, { id: newSectionId(), name: name.slice(0, 80), rooms: [] }] }));
  };
  // Slack: Shift+Esc marks everything as read.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        void client.markAllRead().then(() => toast.success(t("chat.side_all_read")));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [client, t]);
  const nav = (label: string, icon: React.ReactNode, target: ChatView, badge = 0) => (
    <button
      type="button"
      onClick={() => {
        setView(target);
        setPanel(null);
      }}
      className={cn("flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm", isActive(target) ? "bg-primary text-primary-foreground" : "hover:bg-accent", badge > 0 && "font-semibold")}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {badge > 0 && <span className="rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-5 text-white">{badge}</span>}
    </button>
  );

  return (
    <nav className="flex h-full min-h-0 w-full flex-col bg-secondary/60 md:w-64 md:border-r md:border-border" aria-label={t("chat.title")}>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="min-w-0 flex-1 truncate text-base font-bold">{companyName}</span>
        <NotifyButton onOpen={onNotify} />
        <span className="relative">
          <button type="button" onClick={() => setOptions((o) => !o)} className={cn("rounded-md p-1.5 hover:bg-accent", layout.unreadOnly && "text-primary")} title={t("chat.side_options")} aria-label={t("chat.side_options")} aria-haspopup="menu">
            <IconAdjustmentsHorizontal size={18} />
          </button>
          {options && (
            <Popover onClose={() => setOptions(false)} className="right-0 top-9">
              <MenuItem onClick={() => (setOptions(false), void newSection())}>{t("chat.side_new_section")}…</MenuItem>
              <MenuItem checked={layout.unreadOnly} onClick={() => (setOptions(false), save((l) => ({ ...l, unreadOnly: !l.unreadOnly })))}>
                {t("chat.side_unread_only")}
              </MenuItem>
              <MenuLine />
              <MenuItem onClick={() => (setOptions(false), void client.markAllRead().then(() => toast.success(t("chat.side_all_read"))))}>
                {t("chat.side_mark_all_read")}
                <kbd className="ml-2 rounded border border-border px-1 text-[10px] font-normal">Shift Esc</kbd>
              </MenuItem>
            </Popover>
          )}
        </span>
        <button type="button" onClick={onNewMessage} className="rounded-md p-1.5 hover:bg-accent" title={t("chat.new_message")} aria-label={t("chat.new_message")}>
          <IconPlus size={18} />
        </button>
      </div>
      <div className="space-y-1 p-2">
        <button type="button" onClick={onJump} className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-background px-2 text-left text-sm text-muted-foreground hover:border-foreground/30">
          <IconSearch size={15} />
          <span className="flex-1">{t("chat.jump")}</span>
          <kbd className="rounded border border-border px-1 text-[10px]">Ctrl K</kbd>
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (search.trim()) {
              setView({ kind: "search", query: search.trim() });
              setPanel(null);
            }
          }}
        >
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("chat.search_placeholder")} aria-label={t("chat.search_placeholder")} className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </form>
      </div>
      <div className="flex-1 overflow-y-auto pb-4">
        <div className="space-y-0.5 px-2">
          {nav(t("chat.threads"), <IconMessages size={16} />, { kind: "threads" }, threadNews)}
          {nav(t("chat.mentions"), <IconAt size={16} />, { kind: "mentions" })}
          {nav(t("chat.saved"), <IconBookmark size={16} />, { kind: "saved" })}
          {Object.keys(client.drafts).length > 0 && nav(t("chat.drafts"), <IconPencil size={16} />, { kind: "drafts" })}
          {(laterDue > 0 || laterAny) && nav(t("chat.later"), <IconAlarm size={16} />, { kind: "later" }, laterDue)}
          {unreadRooms > 0 && nav(t("chat.catchup"), <IconCards size={16} />, { kind: "catchup" }, unreadRooms)}
          {nav(t("chat.browse"), <IconHash size={16} />, { kind: "browse" })}
          {ai && (
            <button
              type="button"
              onClick={() => sendAssistantCommand({ action: "ask", text: t("chat.ai_missed_prompt") })}
              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-primary hover:bg-accent"
            >
              <IconSparkles size={16} />
              <span className="flex-1">{t("chat.ai_missed")}</span>
            </button>
          )}
        </div>

        {sections.invites.length > 0 && (
          <Section id="invites" title={t("chat.invites")} collapsed={false} onToggle={() => {}}>
            {sections.invites.map((r) => (
              <div key={r.id} className="rounded-md border border-border bg-background p-2 text-sm">
                <div className="truncate font-semibold">{client.roomName(r)}</div>
                {r.inviter && <div className="truncate text-xs text-muted-foreground">{t("chat.invited_by", { name: client.displayName(r.inviter, r) })}</div>}
                {/* Part E: invitations from other companies wait for a yes; say where they come from. */}
                {r.inviter && client.isExternalUser(r.inviter) && (
                  <div className="mt-1 flex items-start gap-1 rounded bg-amber-100/70 px-1.5 py-1 text-[11px] text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
                    <IconWorld size={13} className="mt-px shrink-0" />
                    <span>{t("chat.ext_invite", { domain: serverOfUser(r.inviter) })}</span>
                  </div>
                )}
                <div className="mt-1.5 flex gap-1.5">
                  <button
                    type="button"
                    className="h-7 rounded bg-primary px-2.5 text-xs text-primary-foreground"
                    onClick={() =>
                      void client
                        .join(r.id)
                        .then(() => open(r.id))
                        .catch(() => toast.error(t("chat.error")))
                    }
                  >
                    {t("chat.accept")}
                  </button>
                  <button type="button" className="h-7 rounded px-2.5 text-xs hover:bg-accent" onClick={() => void client.leave(r.id).catch(() => toast.error(t("chat.error")))}>
                    {t("chat.decline")}
                  </button>
                </div>
              </div>
            ))}
          </Section>
        )}

        {sections.starred.length > 0 && (
          <Section id="starred" title={t("chat.starred")} collapsed={collapsed.has("starred")} onToggle={toggle} onDropRoom={dropInto("starred")} menu={(close) => <SectionMenu client={client} id="starred" own={false} close={close} />}>
            {sections.starred.map((r) => (
              <RoomRow key={r.id} client={client} room={r} active={view.kind === "room" && view.roomId === r.id} onOpen={() => open(r.id)} />
            ))}
          </Section>
        )}

        {sections.custom.map((sec) => (
          <Section key={sec.id} id={sec.id} title={sec.name} collapsed={collapsed.has(sec.id)} onToggle={toggle} onDropRoom={dropInto(sec.id)} menu={(close) => <SectionMenu client={client} id={sec.id} own close={close} />}>
            {sec.rooms.map((r) => (
              <RoomRow key={r.id} client={client} room={r} active={view.kind === "room" && view.roomId === r.id} onOpen={() => open(r.id)} onDropBefore={(id) => void dropInto(sec.id, r.id)(id)} />
            ))}
            {sec.rooms.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">{layout.unreadOnly ? t("chat.side_nothing_unread") : t("chat.side_empty_section")}</p>}
          </Section>
        ))}

        {/* Step 99, part H: voice channels of their own, as in Discord. */}
        {sections.channels.some((r) => r.voice) && (
          <Section id="voice" title={t("chat.voice_channels")} collapsed={collapsed.has("voice")} onToggle={toggle}>
            {sections.channels
              .filter((r) => r.voice)
              .map((r) => (
                <RoomRow key={r.id} client={client} room={r} active={view.kind === "room" && view.roomId === r.id} onOpen={() => open(r.id)} />
              ))}
          </Section>
        )}

        <Section id="channels" title={t("chat.channels")} collapsed={collapsed.has("channels")} onToggle={toggle} action={onCreateChannel} actionLabel={t("chat.add_channel")} onDropRoom={dropInto(null)} menu={(close) => <SectionMenu client={client} id="channels" own={false} close={close} />}>
          {sections.channels
            .filter((r) => !r.voice)
            .map((r) => (
              <RoomRow key={r.id} client={client} room={r} active={view.kind === "room" && view.roomId === r.id} onOpen={() => open(r.id)} />
            ))}
          <button type="button" onClick={onCreateChannel} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-muted-foreground hover:bg-accent">
            <IconPlus size={16} />
            {t("chat.add_channel")}
          </button>
        </Section>

        <Section id="direct" title={t("chat.direct")} collapsed={collapsed.has("direct")} onToggle={toggle} action={onNewMessage} actionLabel={t("chat.new_message")} onDropRoom={dropInto(null)} menu={(close) => <SectionMenu client={client} id="direct" own={false} close={close} />}>
          {sections.direct.map((r) => (
            <RoomRow key={r.id} client={client} room={r} active={view.kind === "room" && view.roomId === r.id} onOpen={() => open(r.id)} />
          ))}
          <button type="button" onClick={onNewMessage} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-muted-foreground hover:bg-accent">
            <IconPlus size={16} />
            {t("chat.new_message")}
          </button>
        </Section>
      </div>
      <button
        type="button"
        onClick={() => setPanel({ kind: "profile", userId: client.userId })}
        className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2 text-left hover:bg-accent"
      >
        <PersonAvatar userId={client.userId} name={client.displayName(client.userId)} size="sm" presence="online" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{client.displayName(client.userId)}</span>
          <span className="block truncate text-xs text-muted-foreground">{client.people.get(client.userId)?.statusMsg ?? t("chat.status_set")}</span>
        </span>
      </button>
    </nav>
  );
}
