"use client";

// Step 43, part B: the right-hand panel — a thread, a channel's members or a
// colleague's profile.
import { IconBell, IconBellOff, IconDots, IconMail, IconMessageCircle, IconPencil, IconPhone, IconSparkles, IconX } from "@tabler/icons-react";
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
import { errorText, xenaxio } from "@/lib/xenaxio/api";
import { useXenaxioAvatarStore } from "@/lib/xenaxio/avatars";
import { useMeetNavItem } from "@/lib/xenaxio/meet-nav";
import type { Colleague } from "@/lib/xenaxio/chat/store";
import { cn } from "@/lib/utils";
import { useJoinRoomCall } from "@/components/xenaxio/meet/call";
import { useChatDialogs } from "./dialogs";
import { PersonAvatar, presenceOf, useAssistant, useColleague, useDisplayName } from "./common";
import { Composer } from "./composer";
import { ChatMessage } from "./message";
import { MessageList } from "./message-list";
import { TypingLine } from "./room-view";
import { LargeAvatar, ProfileBanner, ProfileDetails, ProfileDialog, ProfileFrame, ProfileRole } from "./profile";
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

/** The own status: a new one (the box empties after saving), presets, clear. */
function StatusEditor({ client, current }: { client: ChatClient; current: string | undefined }) {
  const t = useXT();
  const [status, setStatus] = useState("");
  const saveStatus = async (value: string | null) => {
    try {
      await client.setStatus(value);
      setStatus("");
      toast.success(value ? t("chat.status_saved") : t("chat.status_cleared"));
    } catch {
      toast.error(t("chat.error"));
    }
  };
  return (
    <div className="space-y-3">
      <div className="text-sm" data-testid="chat-current-status">
        <span className="text-muted-foreground">{t("chat.status_current")}: </span>
        {current || <span className="text-muted-foreground">{t("chat.status_none")}</span>}
      </div>
      <div>
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
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            onKeyDown={(e) => e.key === "Enter" && status.trim() && void saveStatus(status.trim())}
          />
          <button type="button" disabled={!status.trim()} onClick={() => void saveStatus(status.trim())} className="h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50">
            {t("chat.save_edit")}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {STATUS_PRESETS.map((p) => (
          <button key={p} type="button" onClick={() => void saveStatus(t(`chat.status_presets_${p}`))} className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-accent">
            {t(`chat.status_presets_${p}`)}
          </button>
        ))}
        {current && (
          <button type="button" onClick={() => void saveStatus(null)} className="rounded-full px-2.5 py-1 text-xs text-muted-foreground underline">
            {t("chat.status_clear")}
          </button>
        )}
      </div>
    </div>
  );
}

/** Step 104: the company's admin removes a colleague's picture or banner that does not belong at work. */
function AdminMenu({ colleague }: { colleague: Colleague }) {
  const t = useXT();
  const [open, setOpen] = useState(false);
  const { confirm } = useChatDialogs();
  const setColleague = useChatStore((s) => s.setColleague);
  const setProfile = useChatStore((s) => s.setProfile);
  const refreshAvatars = useXenaxioAvatarStore((s) => s.load);
  const id = colleague.id;
  const banner = colleague.profile?.bannerImage;
  if (!id || (!colleague.avatarUrl && !banner)) return null;
  const run = async (what: "avatar" | "banner") => {
    setOpen(false);
    const ok = await confirm({
      title: t(what === "avatar" ? "chat.admin_remove_avatar" : "chat.admin_remove_banner"),
      message: t("chat.admin_remove_confirm", { name: colleague.displayName }),
      confirmText: t("chat.admin_remove"),
      variant: "destructive",
    });
    if (!ok) return;
    try {
      if (what === "avatar") {
        await xenaxio.removeAvatar({ kind: "users", id });
        setColleague(colleague.address, { avatarUrl: null, avatarAnimation: null });
        void refreshAvatars(true);
      } else {
        await xenaxio.removeUserBanner(id);
        if (colleague.profile) setProfile(colleague.address, { ...colleague.profile, banner: colleague.profile.banner === "custom" ? "none" : colleague.profile.banner, bannerImage: null });
      }
      toast.success(t("chat.admin_removed"));
    } catch (err) {
      toast.error(errorText(t, err));
    }
  };
  return (
    <span className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="rounded p-1 hover:bg-accent" aria-label={t("chat.admin_menu")} title={t("chat.admin_menu")} aria-expanded={open}>
        <IconDots size={18} />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-40 w-56 rounded-md border border-border bg-popover py-1 shadow-lg" onMouseLeave={() => setOpen(false)}>
          {colleague.avatarUrl && (
            <button type="button" onClick={() => void run("avatar")} className="block w-full px-3 py-1.5 text-left text-sm text-destructive hover:bg-accent">
              {t("chat.admin_remove_avatar")}
            </button>
          )}
          {banner && (
            <button type="button" onClick={() => void run("banner")} className="block w-full px-3 py-1.5 text-left text-sm text-destructive hover:bg-accent">
              {t("chat.admin_remove_banner")}
            </button>
          )}
        </div>
      )}
    </span>
  );
}

/** Step 104: "Message", "Call", "E-mail" under the name (as in Slack). */
function ProfileActions({ client, userId, email }: { client: ChatClient; userId: string; email: string | null | undefined }) {
  const t = useXT();
  const setView = useChatStore((s) => s.setView);
  const setPanel = useChatStore((s) => s.setPanel);
  const { visible: canCall } = useMeetNavItem();
  const join = useJoinRoomCall(client);
  const [busy, setBusy] = useState(false);
  const direct = async (call: boolean) => {
    setBusy(true);
    try {
      const roomId = await client.openDirect([userId]);
      setView({ kind: "room", roomId });
      setPanel(null);
      const room = client.rooms.get(roomId);
      if (call && room) await join(room);
    } catch {
      toast.error(t("chat.error"));
    } finally {
      setBusy(false);
    }
  };
  const button = "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-accent disabled:opacity-50";
  return (
    <div className="mt-4 flex gap-2">
      <button type="button" disabled={busy} onClick={() => void direct(false)} className={cn(button, "border-primary bg-primary text-primary-foreground hover:bg-primary/90")}>
        <IconMessageCircle size={16} />
        {t("chat.message_person")}
      </button>
      {canCall && (
        <button type="button" disabled={busy} onClick={() => void direct(true)} className={button}>
          <IconPhone size={16} />
          {t("chat.profile_call")}
        </button>
      )}
      {email && (
        <a href={`mailto:${email}`} className={button}>
          <IconMail size={16} />
          {t("chat.profile_email")}
        </a>
      )}
    </div>
  );
}

function ProfilePanel({ client, userId }: { client: ChatClient; userId: string }) {
  const t = useXT();
  const name = useDisplayName();
  const colleague = useColleague(userId);
  const meInfo = useXenaxioMe();
  const person = client.people.get(userId);
  const me = userId === client.userId;
  // Step 101: the own name, changed here too (the platform's, not the chat's alone).
  const myName = meInfo?.user.displayName;
  const [editing, setEditing] = useState(false);
  const presence = presenceOf(client, userId);
  const presenceLabel = presence === "online" ? t("chat.online") : presence === "unavailable" ? t("chat.away") : t("chat.offline");
  // Step 99, part G: banner, frame, job title and contacts (colleagues of the same company).
  const profile = colleague?.profile;
  const external = client.isExternalUser(userId);
  const admin = meInfo?.user.role === "admin" && !me && !!colleague;
  return (
    <PanelFrame title={name(userId)} actions={admin && colleague ? <AdminMenu colleague={colleague} /> : undefined}>
      <div className="flex-1 overflow-y-auto">
        <div className="relative">
          <ProfileBanner profile={profile} />
          {me && colleague && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-background/85 px-3 py-1.5 text-xs font-medium shadow backdrop-blur hover:bg-background"
              aria-label={t("chat.profile_edit")}
            >
              <IconPencil size={14} />
              {t("chat.profile_edit_short")}
            </button>
          )}
        </div>
        <div className="px-5 pb-6">
          <div className="-mt-12">
            <ProfileFrame profile={profile}>
              <LargeAvatar colleague={colleague} name={name(userId)} email={colleague?.email} presence={presence} framed={(profile?.frame ?? "none") !== "none"} />
            </ProfileFrame>
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
            <h3 className="text-xl font-bold leading-tight">{name(userId)}</h3>
            {profile?.pronouns && <span className="text-sm text-muted-foreground">{profile.pronouns}</span>}
          </div>
          <ProfileRole profile={profile} />
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", presence === "online" ? "bg-green-500" : presence === "unavailable" ? "bg-amber-400" : "bg-muted-foreground/50")} />
              {presenceLabel}
            </span>
            {external && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">{t("chat.ext_person", { domain: serverOfUser(userId) })}</span>}
          </div>
          {person?.statusMsg && (
            <div className="mt-3 inline-flex max-w-full items-center rounded-full border border-border bg-muted/40 px-3 py-1 text-sm" data-testid="chat-status-pill">
              <span className="truncate">{person.statusMsg}</span>
            </div>
          )}
          {me && !person?.statusMsg && colleague && (
            <button type="button" onClick={() => setEditing(true)} className="mt-3 inline-flex items-center rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted-foreground hover:bg-accent">
              {t("chat.status_set")}
            </button>
          )}
          {!me && <ProfileActions client={client} userId={userId} email={colleague?.email} />}
          {/* Without the company's directory (an older platform) the status is changed right here. */}
          {me && !colleague && (
            <div className="mt-5">
              <StatusEditor client={client} current={person?.statusMsg} />
            </div>
          )}
          <div className="mt-5">
            <ProfileDetails profile={profile} email={colleague?.email} />
          </div>
          {/* Part E: block a person (their messages and invitations no longer reach me). */}
          {!me && !colleague && (
            <button
              type="button"
              className="mt-5 h-9 rounded-md border border-border px-4 text-sm hover:bg-accent"
              onClick={() => void client.setIgnored(userId, !client.isIgnored(userId)).catch(() => toast.error(t("chat.error")))}
            >
              {client.isIgnored(userId) ? t("chat.unblock") : t("chat.block")}
            </button>
          )}
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(userId).then(() => toast.success(t("chat.profile_copied")), () => undefined)}
            className="mt-6 block max-w-full break-all text-left text-xs text-muted-foreground/80 hover:text-foreground"
            title={t("chat.profile_copy", { value: userId })}
          >
            {userId}
          </button>
        </div>
        {editing && colleague && (
          <ProfileDialog
            address={colleague.address}
            initial={profile}
            colleague={colleague}
            onClose={() => setEditing(false)}
            nameField={
              <div>
                <label htmlFor="chat-own-name" className="text-sm font-medium">
                  {t("name.label")}
                </label>
                <div className="mt-1">
                  <NameForm id="chat-own-name" initial={myName ?? name(userId)} save={saveMyName} compact />
                </div>
              </div>
            }
            statusTab={<StatusEditor client={client} current={person?.statusMsg} />}
          />
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
