"use client";

// Step 43, part B: a channel or direct conversation — header with topic,
// members, pinned messages and settings; the timeline; who is typing; the
// composer. Files can be dropped anywhere on it. Step 99: the channel's name
// opens its details (name, topic, members, settings), as in Slack.
import { IconBell, IconChevronDown, IconHash, IconLock, IconNotes, IconPin, IconStar, IconStarFilled, IconUsers, IconWorld } from "@tabler/icons-react";
import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import { type ChatClient, isPlatformAccount, type Room } from "@/lib/xenaxio/chat/client";
import { plainPreview } from "@/lib/xenaxio/chat/format";
import { useChatStore } from "@/lib/xenaxio/chat/store";
import { useXT } from "@/lib/xenaxio/i18n";
import { toast } from "@/stores/toast-store";
import { cn } from "@/lib/utils";
import { PersonAvatar, presenceOf, useDisplayName } from "./common";
import { addToComposer, Composer } from "./composer";
import { composerKey } from "@/lib/xenaxio/chat/pending-files";
import { PeoplePicker } from "./dialogs";
import { IntegrationsDialog } from "./integrations";
import { MessageList } from "./message-list";
import { CallButton, useJoinRoomCall } from "@/components/xenaxio/meet/call";
import { BookmarksBar, ForumView, VoiceBar } from "./channel-extras";
import { useChatExtras } from "@/lib/xenaxio/chat/extras";
import { ChannelDetails, type DetailsTab } from "./channel-details";

export function TypingLine({ room }: { room: Room }) {
  const t = useXT();
  const name = useDisplayName();
  const who = room.typing;
  const text = who.length === 0 ? "" : who.length === 1 ? t("chat.typing_one", { name: name(who[0]!) }) : who.length === 2 ? t("chat.typing_two", { a: name(who[0]!), b: name(who[1]!) }) : t("chat.typing_many");
  return <div className="h-5 px-5 text-xs text-muted-foreground">{text}</div>;
}

function NotificationMenu({ client, room, onClose }: { client: ChatClient; room: Room; onClose: () => void }) {
  const t = useXT();
  const [level, setLevel] = useState<"all" | "mentions" | "none" | null>(null);
  useEffect(() => {
    void client.notificationLevel(room.id).then(setLevel);
  }, [client, room.id]);
  const choose = async (next: "all" | "mentions" | "none") => {
    setLevel(next);
    onClose();
    await client.setNotifications(room.id, next).catch(() => toast.error(t("chat.error")));
  };
  return (
    <div className="absolute right-0 top-9 z-40 w-52 rounded-md border border-border bg-popover py-1 shadow-lg" onMouseLeave={onClose}>
      {(["all", "mentions", "none"] as const).map((l) => (
        <button key={l} type="button" onClick={() => void choose(l)} className={cn("flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-accent", level === l && "font-semibold")}>
          {t(`chat.notify_${l}`)}
          {level === l && <span>✓</span>}
        </button>
      ))}
      {/* Step 99, part D: as in Slack, a channel's @channel / @here can be ignored. */}
      {room.kind === "channel" && (
        <button
          type="button"
          onClick={() => {
            onClose();
            void client.setIgnoreRoomMentions(room.id, !client.ignoredRoomMentions.has(room.id)).catch(() => toast.error(t("chat.error")));
          }}
          className={cn("flex w-full items-center justify-between border-t border-border px-3 py-1.5 text-left text-sm hover:bg-accent", client.ignoredRoomMentions.has(room.id) && "font-semibold")}
        >
          {t("chat.notify_ignore_room")}
          {client.ignoredRoomMentions.has(room.id) && <span>✓</span>}
        </button>
      )}
    </div>
  );
}

function PinnedMenu({ room, onClose }: { room: Room; onClose: () => void }) {
  const t = useXT();
  const name = useDisplayName();
  const setFocus = useChatStore((s) => s.setFocus);
  return (
    <div className="absolute right-0 top-9 z-40 w-80 rounded-md border border-border bg-popover py-1 shadow-lg" onMouseLeave={onClose}>
      {room.pinned.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">{t("chat.pinned_none")}</div>}
      {room.pinned.map((id) => {
        const m = room.byId.get(id);
        return (
          <button key={id} type="button" className="block w-full px-3 py-2 text-left hover:bg-accent" onClick={() => (onClose(), setFocus({ roomId: room.id, eventId: id }))}>
            <span className="block text-xs font-semibold">{m ? name(m.sender) : ""}</span>
            <span className="block truncate text-sm">{m ? plainPreview(m.content, 90) : id}</span>
          </button>
        );
      })}
    </div>
  );
}

export function RoomView({ client, room, focusId }: { client: ChatClient; room: Room; focusId: string | null }) {
  const t = useXT();
  const locale = useLocale();
  const setPanel = useChatStore((s) => s.setPanel);
  const setEditing = useChatStore((s) => s.setEditing);
  const [menu, setMenu] = useState<"notify" | "pinned" | null>(null);
  // Step 99, part B: a click on the channel's name opens its details, as in Slack.
  const [details, setDetails] = useState<DetailsTab | null>(null);
  const [inviting, setInviting] = useState(false);
  const [integrations, setIntegrations] = useState(false);
  const [dragging, setDragging] = useState(false);
  const roomName = client.roomName(room);
  const partners = room.kind === "dm" ? client.dmPartners(room) : [];
  const joined = [...room.members.values()].filter((m) => m.membership === "join" && !isPlatformAccount(m.userId)).length;
  const starred = !!room.tags["m.favourite"];
  const inCall = useChatExtras((s) => s.calls.get(room.id) ?? 0);
  const joinCall = useJoinRoomCall(client);
  // Step 99, part H: Ctrl+Shift+H starts the call or joins it (Slack's huddle shortcut).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "KeyH") {
        e.preventDefault();
        void joinCall(room).catch(() => toast.error(t("chat.error")));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [joinCall, room, t]);

  useEffect(() => {
    if (room.kind === "channel") void client.loadMembers(room.id).catch(() => undefined);
  }, [client, room.id, room.kind]);

  const editLast = () => {
    const mine = [...room.timeline].reverse().find((m) => m.sender === client.userId && m.type === "m.room.message" && !m.redacted && m.content.msgtype === "m.text");
    if (mine) setEditing(mine.id);
  };

  const toggleStar = () => client.setFavourite(room.id, !starred).catch(() => toast.error(t("chat.error")));

  const beginning =
    room.kind === "dm" ? (
      <div className="px-5 pb-4 pt-8">
        {partners[0] && <PersonAvatar userId={partners[0]} name={roomName} size="lg" />}
        <p className="mt-2 text-sm text-muted-foreground">{t("chat.beginning_dm", { name: roomName })}</p>
      </div>
    ) : (
      <div className="px-5 pb-4 pt-8">
        <h2 className="text-xl font-bold">
          {room.external ? "🌐 " : room.joinRule === "public" ? "#" : "🔒 "}
          {roomName}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("chat.beginning", { name: roomName })}</p>
        {room.topic && <p className="mt-1 text-sm">{room.topic}</p>}
      </div>
    );

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files") && client.can(room, "send")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        // Step 62: into the message box, sent with the next message.
        addToComposer(composerKey(room.id), [...e.dataTransfer.files], locale);
      }}
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <div className="relative min-w-0">
          <button
            type="button"
            onClick={() => (room.kind === "dm" ? partners[0] && setPanel({ kind: "profile", userId: partners[0] }) : setDetails("info"))}
            className="flex min-w-0 items-center gap-1 rounded px-1.5 py-1 text-base font-bold hover:bg-accent"
            aria-haspopup="dialog"
            title={room.kind === "dm" ? undefined : t("chat.details_open")}
          >
            {room.kind === "dm" ? (
              partners[0] && <PersonAvatar userId={partners[0]} name={roomName} size="sm" presence={presenceOf(client, partners[0])} className="mr-1" />
            ) : room.external ? (
              <IconWorld size={18} className="text-primary" />
            ) : room.joinRule === "public" ? (
              <IconHash size={18} />
            ) : (
              <IconLock size={18} />
            )}
            <span className="truncate">{roomName}</span>
            {room.external && <span className="ml-1 rounded bg-primary/10 px-1.5 text-[10px] font-semibold uppercase text-primary">{t("chat.external")}</span>}
            {room.kind !== "dm" && <IconChevronDown size={14} className="text-muted-foreground" />}
          </button>
        </div>
        <button type="button" onClick={() => void toggleStar()} className="rounded p-1 text-muted-foreground hover:bg-accent" title={starred ? t("chat.unstar") : t("chat.star")} aria-label={starred ? t("chat.unstar") : t("chat.star")}>
          {starred ? <IconStarFilled size={16} className="text-amber-500" /> : <IconStar size={16} />}
        </button>
        {room.topic && (
          <button type="button" onClick={() => setDetails("info")} className="hidden min-w-0 truncate text-left text-sm text-muted-foreground hover:text-foreground md:block">
            {room.topic}
          </button>
        )}
        {room.kind === "dm" && partners[0] && client.people.get(partners[0])?.statusMsg && (
          <span className="hidden min-w-0 truncate text-sm text-muted-foreground md:block">{client.people.get(partners[0])?.statusMsg}</span>
        )}
        <span className="flex-1" />
        {/* Step 78, part D: a call in this channel or direct message. */}
        <CallButton client={client} room={room} participants={inCall} />
        {/* Step 99, part H: the channel's canvas (Slack). */}
        {room.kind === "channel" && (
          <button type="button" onClick={() => setPanel({ kind: "canvas", roomId: room.id })} className={cn("rounded p-1.5 text-muted-foreground hover:bg-accent", room.canvas && "text-primary")} title={t("chat.canvas")} aria-label={t("chat.canvas")}>
            <IconNotes size={16} />
          </button>
        )}
        {room.kind === "channel" && (
          <button type="button" onClick={() => setPanel({ kind: "members", roomId: room.id })} className="flex items-center gap-1 rounded px-2 py-1 text-sm text-muted-foreground hover:bg-accent" title={t("chat.members")}>
            <IconUsers size={16} />
            <span className="tabular-nums">{joined}</span>
          </button>
        )}
        <span className="relative">
          <button type="button" onClick={() => setMenu(menu === "pinned" ? null : "pinned")} className="flex items-center gap-1 rounded px-2 py-1 text-sm text-muted-foreground hover:bg-accent" title={t("chat.pinned")} aria-label={t("chat.pinned")}>
            <IconPin size={16} />
            {room.pinned.length > 0 && <span className="tabular-nums">{room.pinned.length}</span>}
          </button>
          {menu === "pinned" && <PinnedMenu room={room} onClose={() => setMenu(null)} />}
        </span>
        <span className="relative">
          <button type="button" onClick={() => setMenu(menu === "notify" ? null : "notify")} className="rounded p-1.5 text-muted-foreground hover:bg-accent" title={t("chat.notifications")} aria-label={t("chat.notifications")}>
            <IconBell size={16} />
          </button>
          {menu === "notify" && <NotificationMenu client={client} room={room} onClose={() => setMenu(null)} />}
        </span>
      </header>

      {room.kind === "channel" && <BookmarksBar client={client} room={room} />}
      {room.voice && <VoiceBar client={client} room={room} />}
      {room.forum ? (
        // Step 99, part H: a forum lists its posts; replies go in each post's thread.
        <ForumView client={client} room={room} />
      ) : (
        <>
          <MessageList room={room} client={client} messages={room.kind === "dm" ? room.timeline.filter((m) => m.type !== "m.room.member") : room.timeline} focusId={focusId} header={beginning} />
          <TypingLine room={room} />
          <Composer
            room={room}
            client={client}
            locale={locale}
            placeholder={t("chat.composer_placeholder", { name: room.kind === "dm" ? roomName : `#${roomName}` })}
            onEditLast={editLast}
          />
        </>
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/5 text-sm font-medium text-primary">
          {t("chat.drop_files")}
        </div>
      )}
      {details && room.kind === "channel" && (
        <ChannelDetails client={client} room={room} initialTab={details} onClose={() => setDetails(null)} onInvite={() => setInviting(true)} onIntegrations={() => setIntegrations(true)} />
      )}
      {integrations && <IntegrationsDialog room={room} roomName={roomName} onClose={() => setIntegrations(false)} />}
      {inviting && (
        <PeoplePicker
          title={t("chat.invite_title", { name: roomName })}
          action={t("chat.invite")}
          client={client}
          allowExternal={room.external}
          max={20}
          exclude={[...room.members.values()].filter((m) => m.membership === "join" || m.membership === "invite").map((m) => m.userId)}
          onClose={() => setInviting(false)}
          onDone={async (ids) => {
            for (const id of ids) await client.invite(room.id, id);
          }}
        />
      )}
    </div>
  );
}
