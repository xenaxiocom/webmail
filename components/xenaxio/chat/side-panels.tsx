"use client";

// Step 43, part B: the right-hand panel — a thread, a channel's members or a
// colleague's profile.
import { IconBell, IconBellOff, IconSparkles, IconX } from "@tabler/icons-react";
import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import { type ChatClient, isPlatformAccount, serverOfUser } from "@/lib/xenaxio/chat/client";
import { type SidePanel, useChatStore } from "@/lib/xenaxio/chat/store";
import { useXT } from "@/lib/xenaxio/i18n";
import { sendAssistantCommand } from "@/lib/xenaxio/assistant";
import { toast } from "@/stores/toast-store";
import { setThreadFollow, threadFollow } from "@/lib/xenaxio/chat/api";
import { NameForm, saveMyName } from "@/components/xenaxio/name-setting";
import { useXenaxioMe } from "@/lib/xenaxio/me-store";
import { PersonAvatar, presenceOf, useAssistant, useColleague, useDisplayName } from "./common";
import { Composer } from "./composer";
import { ChatMessage } from "./message";
import { MessageList } from "./message-list";
import { TypingLine } from "./room-view";
import { ProfileBanner, ProfileDetails, ProfileDialog, ProfileFrame } from "./profile";
import { CanvasPanel } from "./channel-extras";

export function PanelFrame({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  const t = useXT();
  const setPanel = useChatStore((s) => s.setPanel);
  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-l border-border bg-background md:w-[380px]">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-bold">{title}</div>
          {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        {actions}
        <button type="button" onClick={() => setPanel(null)} className="rounded p-1 hover:bg-accent" aria-label={t("chat.close")}>
          <IconX size={18} />
        </button>
      </header>
      {children}
    </aside>
  );
}

function ThreadPanel({ client, roomId, rootId }: { client: ChatClient; roomId: string; rootId: string }) {
  const t = useXT();
  const ai = useAssistant();
  const locale = useLocale();
  const room = client.rooms.get(roomId);
  const [error, setError] = useState(false);
  // Step 99, part E2b: following the thread, as in Slack (replying follows it).
  const [follow, setFollow] = useState<boolean | null>(null);
  useEffect(() => {
    setError(false);
    void client.loadThread(roomId, rootId).catch(() => setError(true));
    void threadFollow(roomId, rootId).then(setFollow);
  }, [client, roomId, rootId]);
  if (!room) return null;
  const root = room.byId.get(rootId);
  const replies = room.threads.get(rootId) ?? [];
  // Part D: the assistant reads the thread (as this person) and sums it up.
  const summarize = ai ? (
    <button
      type="button"
      onClick={() => sendAssistantCommand({ action: "ask", text: t("chat.ai_thread_prompt", { room: client.roomName(room), roomId, rootId }) })}
      className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:bg-accent"
      title={t("chat.ai_summarize")}
    >
      <IconSparkles size={15} />
      {t("chat.ai_summarize")}
    </button>
  ) : null;
  // Following: chosen, or replied in it, or it is one's own message.
  const following = follow ?? (root?.sender === client.userId || replies.some((r) => r.sender === client.userId));
  const followButton = (
    <button
      type="button"
      onClick={() => {
        const next = !following;
        setFollow(next);
        void setThreadFollow(roomId, rootId, next).catch(() => toast.error(t("chat.error")));
      }}
      className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium hover:bg-accent"
      aria-pressed={following}
    >
      {following ? <IconBellOff size={15} /> : <IconBell size={15} />}
      {following ? t("chat.thread_unfollow") : t("chat.thread_follow")}
    </button>
  );
  return (
    <PanelFrame
      title={t("chat.thread")}
      subtitle={client.roomName(room)}
      actions={
        <>
          {followButton}
          {summarize}
        </>
      }
    >
      <MessageList
        room={room}
        client={client}
        messages={replies}
        inThread
        threadRoot={rootId}
        header={
          root ? (
            <div className="border-b border-border pb-2">
              <ChatMessage message={root} room={room} client={client} continued={false} inThread />
              {replies.length > 0 && <div className="px-5 pt-2 text-xs text-muted-foreground">{replies.length === 1 ? t("chat.reply_one") : t("chat.replies", { count: replies.length })}</div>}
            </div>
          ) : error ? (
            <div className="p-4 text-sm text-destructive">{t("chat.error")}</div>
          ) : null
        }
      />
      <TypingLine room={room} />
      <Composer room={room} client={client} threadRoot={rootId} locale={locale} placeholder={t("chat.thread_placeholder")} />
    </PanelFrame>
  );
}

function MembersPanel({ client, roomId }: { client: ChatClient; roomId: string }) {
  const t = useXT();
  const name = useDisplayName();
  const setPanel = useChatStore((s) => s.setPanel);
  const room = client.rooms.get(roomId);
  useEffect(() => {
    void client.loadMembers(roomId).catch(() => undefined);
  }, [client, roomId]);
  if (!room) return null;
  const members = [...room.members.values()].filter((m) => m.membership === "join" && !isPlatformAccount(m.userId)).sort((a, b) => name(a.userId).localeCompare(name(b.userId)));
  return (
    <PanelFrame title={t("chat.members")} subtitle={t("chat.members_count", { count: members.length })}>
      <div className="flex-1 overflow-y-auto p-2">
        {members.map((m) => (
          <button key={m.userId} type="button" onClick={() => setPanel({ kind: "profile", userId: m.userId })} className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-accent">
            <PersonAvatar userId={m.userId} name={name(m.userId)} size="sm" presence={presenceOf(client, m.userId)} />
            <span className="min-w-0 flex-1 truncate text-sm">
              {name(m.userId)}
              {m.userId === client.userId && <span className="text-muted-foreground"> ({t("chat.you")})</span>}
            </span>
            {client.powerOf(room, m.userId) >= 100 && <span className="text-[10px] uppercase text-muted-foreground">admin</span>}
          </button>
        ))}
      </div>
    </PanelFrame>
  );
}

const STATUS_PRESETS = ["meeting", "lunch", "vacation", "sick", "remote"] as const;

function ProfilePanel({ client, userId }: { client: ChatClient; userId: string }) {
  const t = useXT();
  const name = useDisplayName();
  const colleague = useColleague(userId);
  const setView = useChatStore((s) => s.setView);
  const setPanel = useChatStore((s) => s.setPanel);
  const person = client.people.get(userId);
  const me = userId === client.userId;
  // Step 101: the own name, changed here too (the platform's, not the chat's alone).
  const myName = useXenaxioMe()?.user.displayName;
  // The box is for a new status; the current one is shown under the name.
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState(false);
  const presence = presenceOf(client, userId);
  const presenceLabel = presence === "online" ? t("chat.online") : presence === "unavailable" ? t("chat.away") : t("chat.offline");
  const saveStatus = async (value: string | null) => {
    try {
      await client.setStatus(value);
      setStatus("");
      toast.success(value ? t("chat.status_saved") : t("chat.status_cleared"));
    } catch {
      toast.error(t("chat.error"));
    }
  };
  // Step 99, part G: banner, frame, job title and contacts (colleagues of the same company).
  const profile = colleague?.profile;
  return (
    <PanelFrame title={name(userId)}>
      <div className="flex-1 overflow-y-auto p-5">
        <ProfileBanner profile={profile} />
        <ProfileFrame profile={profile}>
          <PersonAvatar userId={userId} name={name(userId)} size="lg" presence={presence} />
        </ProfileFrame>
        <h3 className="mt-3 text-lg font-bold">{name(userId)}</h3>
        <ProfileDetails profile={profile} />
        {me && colleague && (
          <button type="button" onClick={() => setEditing(true)} className="mt-2 h-8 rounded-md border border-border px-3 text-sm hover:bg-accent">
            {t("chat.profile_edit")}
          </button>
        )}
        {editing && colleague && <ProfileDialog address={colleague.address} initial={profile} onClose={() => setEditing(false)} />}
        {client.isExternalUser(userId) && (
          <div className="mt-1 inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
            {t("chat.ext_person", { domain: serverOfUser(userId) })}
          </div>
        )}
        <div className="mt-1 break-all text-xs text-muted-foreground">{userId}</div>
        <div className="text-sm text-muted-foreground">{presenceLabel}</div>
        {person?.statusMsg ? (
          <div className="mt-2 text-sm" data-testid="chat-current-status">
            {person.statusMsg}
          </div>
        ) : (
          me && (
            <div className="mt-2 text-sm text-muted-foreground" data-testid="chat-current-status">
              {t("chat.status_none")}
            </div>
          )
        )}
        {colleague?.email && (
          <div className="mt-4">
            <div className="text-xs font-medium text-muted-foreground">{t("chat.profile_email")}</div>
            <a href={`mailto:${colleague.email}`} className="text-sm text-primary hover:underline">
              {colleague.email}
            </a>
          </div>
        )}
        {!me && (
          <button
            type="button"
            className="mt-5 h-9 rounded-md border border-border px-4 text-sm font-medium hover:bg-accent"
            onClick={async () => {
              try {
                const roomId = await client.openDirect([userId]);
                setView({ kind: "room", roomId });
                setPanel(null);
              } catch {
                toast.error(t("chat.error"));
              }
            }}
          >
            {t("chat.message_person")}
          </button>
        )}
        {/* Part E: block a person (their messages and invitations no longer reach me). */}
        {!me && !colleague && (
          <button
            type="button"
            className="ml-2 mt-5 h-9 rounded-md border border-border px-4 text-sm hover:bg-accent"
            onClick={() => void client.setIgnored(userId, !client.isIgnored(userId)).catch(() => toast.error(t("chat.error")))}
          >
            {client.isIgnored(userId) ? t("chat.unblock") : t("chat.block")}
          </button>
        )}
        {me && (
          <div className="mt-5">
            <label htmlFor="chat-own-name" className="text-sm font-medium">
              {t("name.label")}
            </label>
            <div className="mt-1">
              <NameForm id="chat-own-name" initial={myName ?? name(userId)} save={saveMyName} compact />
            </div>
          </div>
        )}
        {me && (
          <div className="mt-5">
            <label htmlFor="chat-new-status" className="text-sm font-medium">
              {t("chat.status_new")}
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="chat-new-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                placeholder={t("chat.status_placeholder")}
                maxLength={100}
                className="h-9 flex-1 rounded-md border border-input bg-transparent px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                onKeyDown={(e) => e.key === "Enter" && status.trim() && void saveStatus(status.trim())}
              />
              <button type="button" disabled={!status.trim()} onClick={() => void saveStatus(status.trim())} className="h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50">
                {t("chat.save_edit")}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {STATUS_PRESETS.map((p) => (
                <button key={p} type="button" onClick={() => void saveStatus(t(`chat.status_presets_${p}`))} className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-accent">
                  {t(`chat.status_presets_${p}`)}
                </button>
              ))}
              {person?.statusMsg && (
                <button type="button" onClick={() => void saveStatus(null)} className="rounded-full px-2.5 py-1 text-xs text-muted-foreground underline">
                  {t("chat.status_clear")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </PanelFrame>
  );
}

export function ChatSidePanel({ client, panel }: { client: ChatClient; panel: SidePanel }) {
  if (!panel) return null;
  if (panel.kind === "thread") return <ThreadPanel key={`${panel.roomId}|${panel.rootId}`} client={client} roomId={panel.roomId} rootId={panel.rootId} />;
  if (panel.kind === "members") return <MembersPanel client={client} roomId={panel.roomId} />;
  if (panel.kind === "canvas") return <CanvasPanel client={client} roomId={panel.roomId} />;
  return <ProfilePanel key={panel.userId} client={client} userId={panel.userId} />;
}
