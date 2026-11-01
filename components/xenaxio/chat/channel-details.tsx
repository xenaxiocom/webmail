"use client";

// Step 99, part B: a channel's details, as in Slack — a click on its name
// opens them. "Info": name, topic, description, who made it and when, the
// link, leave. "Mitglieder": search, add, managers, remove. "Angeheftet":
// pinned messages. "Integrationen". "Einstellungen": open or closed, who
// writes, who may @channel, archive. Channel managers change everything; the
// company's admin does it through the platform (step 63), also in channels
// they manage nothing in.
import { IconCopy, IconCrown, IconPin, IconSearch, IconStar, IconStarFilled } from "@tabler/icons-react";
import { useLocale } from "next-intl";
import { useState } from "react";
import { type ChatChannelChange, errorText, xenaxio, XenaxioApiError } from "@/lib/xenaxio/api";
import { type ChatClient, isPlatformAccount, type Room, roomPeople, serverOfUser } from "@/lib/xenaxio/chat/client";
import { plainPreview } from "@/lib/xenaxio/chat/format";
import { useChatStore } from "@/lib/xenaxio/chat/store";
import { useXT } from "@/lib/xenaxio/i18n";
import { useXenaxioMe } from "@/lib/xenaxio/me-store";
import { toast } from "@/stores/toast-store";
import { cn } from "@/lib/utils";
import { channelLink, PersonAvatar, useChatTime, useDisplayName } from "./common";
import { Modal, useChatDialogs } from "./dialogs";
import { RoomBackgroundSettings } from "./room-background-settings";

export type DetailsTab = "info" | "members" | "pinned" | "integrations" | "background" | "settings";

/** Who may change what in a channel: its managers, or the company admin through the platform. */
export function useChannelRights(client: ChatClient, room: Room) {
  const me = useXenaxioMe();
  const moderator = client.can(room, "state");
  // Step 63: the company admin manages every channel of the company through the platform.
  const companyAdmin = me?.user.role === "admin" && !!room.creator && serverOfUser(room.creator) === client.homeServer;
  return { moderator, companyAdmin, manage: moderator || companyAdmin };
}

export function ChannelDetails({ client, room, initialTab = "info", onClose, onInvite, onIntegrations }: { client: ChatClient; room: Room; initialTab?: DetailsTab; onClose: () => void; onInvite: () => void; onIntegrations: () => void }) {
  const t = useXT();
  const [tab, setTab] = useState<DetailsTab>(initialTab);
  const name = client.roomName(room);
  const { manage } = useChannelRights(client, room);
  // Step 109: everyone in the channel sees its background tab (their own choice); managers and the admin also set it for all.
  const tabs: DetailsTab[] = ["info", "members", "pinned", ...(room.archived ? [] : (["integrations"] as const)), "background", ...(manage ? (["settings"] as const) : [])];
  return (
    <Modal title={`${room.joinRule === "public" ? "#" : "🔒 "}${name}`} onClose={onClose} wide>
      <div role="tablist" className="-mx-4 -mt-4 mb-4 flex gap-1 overflow-x-auto border-b border-border px-3">
        {tabs.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn("shrink-0 border-b-2 px-2.5 py-2 text-sm", tab === k ? "border-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t(`chat.details_${k}`)}
          </button>
        ))}
      </div>
      {tab === "info" && <InfoTab client={client} room={room} onClose={onClose} />}
      {tab === "members" && <MembersTab client={client} room={room} onInvite={onInvite} />}
      {tab === "pinned" && <PinnedTab room={room} onClose={onClose} />}
      {tab === "integrations" && (
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">{t("chat.details_integrations_text")}</p>
          <button type="button" onClick={() => (onClose(), onIntegrations())} className="h-9 rounded-md border border-border px-3 hover:bg-accent">
            {t("chat.hooks_menu")}
          </button>
        </div>
      )}
      {tab === "background" && <RoomBackgroundSettings client={client} room={room} />}
      {tab === "settings" && <SettingsTab client={client} room={room} onClose={onClose} />}
    </Modal>
  );
}

/** Runs a change as a channel manager, or through the platform for the company admin. */
function useChange(client: ChatClient, room: Room) {
  const t = useXT();
  const { moderator } = useChannelRights(client, room);
  return async (direct: () => Promise<unknown>, asAdmin: ChatChannelChange): Promise<boolean> => {
    try {
      await (moderator ? direct() : xenaxio.changeChatChannel(room.id, asAdmin));
      return true;
    } catch (err) {
      toast.error(err instanceof XenaxioApiError ? errorText(t, err) : t("chat.error"));
      return false;
    }
  };
}

function Field({ label, value, empty, onEdit }: { label: string; value: string | null; empty: string; onEdit?: () => void }) {
  const t = useXT();
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{label}</span>
        {onEdit && (
          <button type="button" onClick={onEdit} className="text-sm font-medium text-primary hover:underline">
            {t("chat.details_edit")}
          </button>
        )}
      </div>
      <p className={cn("mt-0.5 whitespace-pre-wrap break-words text-sm", !value && "text-muted-foreground")}>{value || empty}</p>
    </div>
  );
}

function InfoTab({ client, room, onClose }: { client: ChatClient; room: Room; onClose: () => void }) {
  const t = useXT();
  const locale = useLocale();
  const nameOf = useDisplayName();
  const { full } = useChatTime();
  const { prompt, confirm } = useChatDialogs();
  const setView = useChatStore((s) => s.setView);
  const { manage } = useChannelRights(client, room);
  const change = useChange(client, room);
  const editable = manage && !room.archived;
  const name = client.roomName(room);
  const edit = (field: "name" | "topic" | "description") => async () => {
    const current = field === "name" ? (room.name ?? "") : field === "topic" ? (room.topic ?? "") : (room.description ?? "");
    const next = await prompt({ title: t(`chat.details_${field}_edit`), defaultValue: current, confirmText: t("chat.save_edit") });
    if (next === null) return;
    const value = next.trim();
    if (field === "name") {
      // Slack-style names: lower case, words joined by dashes (as when creating one).
      const clean = value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9äöüß_-]/g, "").slice(0, 80);
      if (!clean || clean === room.name) return;
      if (await change(() => client.rename(room.id, clean), { name: clean })) toast.success(t("chat.details_saved"));
    } else if (field === "topic") {
      if (await change(() => client.setTopic(room.id, value.slice(0, 500)), { topic: value.slice(0, 500) })) toast.success(t("chat.details_saved"));
    } else if (await change(() => client.setDescription(room.id, value.slice(0, 1000)), { description: value.slice(0, 1000) })) toast.success(t("chat.details_saved"));
  };
  const creator = room.creator && !isPlatformAccount(room.creator) ? nameOf(room.creator) : null;
  return (
    <div className="space-y-2">
      <Field label={t("chat.details_name")} value={`${name}`} empty="" onEdit={editable ? () => void edit("name")() : undefined} />
      <Field label={t("chat.topic")} value={room.topic} empty={t("chat.details_none")} onEdit={editable ? () => void edit("topic")() : undefined} />
      <Field label={t("chat.details_description")} value={room.description} empty={t("chat.details_none")} onEdit={editable ? () => void edit("description")() : undefined} />
      {(creator || room.createdTs) && (
        <p className="px-1 text-xs text-muted-foreground">
          {creator && room.createdTs
            ? t("chat.details_created_by", { name: creator, date: full(room.createdTs) })
            : creator
              ? t("chat.details_created_by_only", { name: creator })
              : t("chat.details_created", { date: full(room.createdTs as number) })}
        </p>
      )}
      <div className="flex flex-wrap gap-2 pt-2">
        <button
          type="button"
          className="flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-accent"
          onClick={() => void client.setFavourite(room.id, !room.tags["m.favourite"]).catch(() => toast.error(t("chat.error")))}
        >
          {room.tags["m.favourite"] ? <IconStarFilled size={15} className="text-amber-500" /> : <IconStar size={15} />}
          {room.tags["m.favourite"] ? t("chat.unstar") : t("chat.star")}
        </button>
        <button
          type="button"
          className="flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-accent"
          onClick={() =>
            void navigator.clipboard
              .writeText(channelLink(locale, room.id))
              .then(() => toast.success(t("chat.copied")))
              .catch(() => toast.error(t("chat.error")))
          }
        >
          <IconCopy size={15} />
          {t("chat.details_copy_link")}
        </button>
        <button
          type="button"
          className="h-9 rounded-md border border-border px-3 text-sm text-destructive hover:bg-destructive/10"
          onClick={async () => {
            if (!(await confirm({ title: t("chat.leave"), message: t("chat.leave_confirm", { name }), confirmText: t("chat.leave") }))) return;
            try {
              await client.leave(room.id);
              onClose();
              setView({ kind: "home" });
            } catch {
              toast.error(t("chat.error"));
            }
          }}
        >
          {t("chat.leave")}
        </button>
      </div>
    </div>
  );
}

function MembersTab({ client, room, onInvite }: { client: ChatClient; room: Room; onInvite: () => void }) {
  const t = useXT();
  const nameOf = useDisplayName();
  const { confirm } = useChatDialogs();
  const setPanel = useChatStore((s) => s.setPanel);
  const [query, setQuery] = useState("");
  const moderator = client.can(room, "state");
  const canKick = client.can(room, "kick");
  // The client changes rooms in place, so this is worked out on every render.
  const q = query.trim().toLowerCase();
  const members = roomPeople(room)
    .filter((m) => !q || nameOf(m.userId).toLowerCase().includes(q) || m.userId.toLowerCase().includes(q))
    .sort((a, b) => Number(client.isManager(room, b.userId)) - Number(client.isManager(room, a.userId)) || nameOf(a.userId).localeCompare(nameOf(b.userId)));
  const mine = client.powerOf(room, client.userId);
  const run = async (job: () => Promise<unknown>) => {
    try {
      await job();
    } catch {
      toast.error(t("chat.error"));
    }
  };
  return (
    <div>
      <div className="flex gap-2">
        <label className="flex h-9 flex-1 items-center gap-1.5 rounded-md border border-input px-2 focus-within:ring-2 focus-within:ring-ring">
          <IconSearch size={15} className="text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("chat.details_members_search")} aria-label={t("chat.details_members_search")} className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none" />
        </label>
        {client.can(room, "invite") && !room.archived && (
          <button type="button" onClick={onInvite} className="h-9 shrink-0 rounded-md bg-primary px-3 text-sm text-primary-foreground">
            {t("chat.invite")}
          </button>
        )}
      </div>
      <ul className="mt-3 max-h-[50vh] overflow-y-auto">
        {members.map((m) => {
          const manager = client.isManager(room, m.userId);
          const self = m.userId === client.userId;
          // Only someone above them can change or remove them, as Matrix decides.
          const above = mine > client.powerOf(room, m.userId);
          return (
            <li key={m.userId} className="group flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-accent/50">
              <button type="button" onClick={() => setPanel({ kind: "profile", userId: m.userId })} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <PersonAvatar userId={m.userId} name={nameOf(m.userId)} size="sm" />
                <span className="truncate text-sm">
                  {nameOf(m.userId)}
                  {self && <span className="text-muted-foreground"> ({t("chat.you")})</span>}
                </span>
                {m.membership === "invite" && <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">{t("chat.details_invited")}</span>}
                {manager && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                    <IconCrown size={11} />
                    {t("chat.details_manager")}
                  </span>
                )}
              </button>
              {!self && !room.archived && moderator && above && (
                <button type="button" className="shrink-0 rounded px-2 py-1 text-xs hover:bg-accent" onClick={() => void run(() => client.setManager(room.id, m.userId, !manager))}>
                  {manager ? t("chat.details_manager_off") : t("chat.details_manager_on")}
                </button>
              )}
              {!self && !room.archived && canKick && above && (
                <button
                  type="button"
                  className="shrink-0 rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                  onClick={async () => {
                    if (await confirm({ title: t("chat.details_remove"), message: t("chat.details_remove_confirm", { name: nameOf(m.userId), channel: client.roomName(room) }), confirmText: t("chat.details_remove"), variant: "destructive" }))
                      await run(() => client.kick(room.id, m.userId));
                  }}
                >
                  {t("chat.details_remove")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PinnedTab({ room, onClose }: { room: Room; onClose: () => void }) {
  const t = useXT();
  const nameOf = useDisplayName();
  const setFocus = useChatStore((s) => s.setFocus);
  if (room.pinned.length === 0)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <IconPin size={15} />
        {t("chat.details_pinned_none")}
      </p>
    );
  return (
    <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
      {room.pinned.map((id) => {
        const m = room.byId.get(id);
        return (
          <li key={id}>
            <button type="button" className="block w-full rounded-md border border-border px-3 py-2 text-left hover:bg-accent" onClick={() => (onClose(), setFocus({ roomId: room.id, eventId: id }))}>
              <span className="block text-xs font-semibold">{m ? nameOf(m.sender) : ""}</span>
              <span className="block truncate text-sm">{m ? plainPreview(m.content, 120) : id}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Choice<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: { value: T; label: string; hint?: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <fieldset className="space-y-1.5" disabled={disabled}>
      <legend className="mb-1 text-sm font-semibold">{label}</legend>
      {options.map((o) => (
        <label key={o.value} className="flex items-start gap-2 text-sm">
          <input type="radio" checked={value === o.value} onChange={() => onChange(o.value)} className="mt-1" />
          <span>
            {o.label}
            {o.hint && <span className="block text-xs text-muted-foreground">{o.hint}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function SettingsTab({ client, room, onClose }: { client: ChatClient; room: Room; onClose: () => void }) {
  const t = useXT();
  const { confirm } = useChatDialogs();
  const { companyAdmin } = useChannelRights(client, room);
  const change = useChange(client, room);
  const [busy, setBusy] = useState(false);
  const rules = client.roomRules(room);
  const name = client.roomName(room);
  const save = async (direct: () => Promise<unknown>, asAdmin: ChatChannelChange) => {
    setBusy(true);
    if (await change(direct, asAdmin)) toast.success(t("chat.details_saved"));
    setBusy(false);
  };
  if (room.archived)
    return (
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">{t("chat.details_archived")}</p>
        {companyAdmin && (
          <button type="button" className="h-9 rounded-md border border-border px-3 hover:bg-accent" onClick={() => void save(async () => xenaxio.changeChatChannel(room.id, { archived: false }), { archived: false })}>
            {t("chat.restore")}
          </button>
        )}
      </div>
    );
  return (
    <div className="space-y-5">
      {!room.external && (
        <Choice
          label={t("chat.details_privacy")}
          value={room.joinRule === "public" ? "public" : "private"}
          disabled={busy}
          options={[
            { value: "public", label: t("chat.create_public") },
            { value: "private", label: t("chat.create_private") },
          ]}
          onChange={(v) => void save(() => client.setPublic(room.id, v === "public"), { isPublic: v === "public" })}
        />
      )}
      <Choice
        label={t("chat.details_posting")}
        value={rules.posting}
        disabled={busy}
        options={[
          { value: "everyone", label: t("chat.details_posting_everyone") },
          { value: "managers", label: t("chat.details_posting_managers"), hint: t("chat.details_posting_managers_hint") },
        ]}
        onChange={(v) => void save(() => client.setRoomRules(room.id, { posting: v }), { posting: v })}
      />
      <Choice
        label={t("chat.details_mentions")}
        value={rules.channelMentions}
        disabled={busy}
        options={[
          { value: "everyone", label: t("chat.details_mentions_everyone") },
          { value: "managers", label: t("chat.details_mentions_managers") },
        ]}
        onChange={(v) => void save(() => client.setRoomRules(room.id, { channelMentions: v }), { channelMentions: v })}
      />
      <div className="border-t border-border pt-4">
        <button
          type="button"
          disabled={busy}
          className="h-9 rounded-md border border-destructive/40 px-3 text-sm text-destructive hover:bg-destructive/10"
          onClick={async () => {
            if (!(await confirm({ title: t("chat.archive"), message: t("chat.archive_confirm", { name }), confirmText: t("chat.archive"), variant: "destructive" }))) return;
            await save(() => client.archive(room.id), { archived: true });
            onClose();
          }}
        >
          {t("chat.archive")}
        </button>
      </div>
    </div>
  );
}
