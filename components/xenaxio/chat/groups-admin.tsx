"use client";

// Step 99, part H (from Slack): the company admin keeps groups to mention
// ("@vertrieb" notifies every member) and the company's own emoji.
import { IconTrash } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/browser-navigation";
import { emojiUrl } from "@/lib/xenaxio/chat/extras";
import { errorText, type WorkspaceUser, xenaxio, XenaxioApiError } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";
import { Notice, Spinner } from "@/components/xenaxio/ui";

interface AdminGroup {
  id: string;
  handle: string;
  name: string;
  members: string[];
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, { method, credentials: "same-origin", headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json", "x-xenaxio-csrf": "1" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new XenaxioApiError(res.status, data.error ?? "error");
  return data;
}

export function GroupsAdmin() {
  const t = useXT();
  const [groups, setGroups] = useState<AdminGroup[] | null>(null);
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [editing, setEditing] = useState<{ id?: string; handle: string; name: string; members: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const [g, u] = await Promise.all([call<{ groups: AdminGroup[] }>("GET", "/api/admin/chat/groups"), xenaxio.users()]);
      setGroups(g.groups);
      setUsers(u.users.filter((x) => x.status === "active"));
    } catch (err) {
      setError(errorText(t, err));
    }
  }, [t]);
  useEffect(() => {
    void load();
  }, [load]);
  const save = async () => {
    if (!editing) return;
    setError(null);
    try {
      const body = { handle: editing.handle, name: editing.name, members: editing.members };
      await (editing.id ? call("PUT", `/api/admin/chat/groups/${editing.id}`, body) : call("POST", "/api/admin/chat/groups", body));
      setEditing(null);
      await load();
    } catch (err) {
      setError(errorText(t, err));
    }
  };
  const remove = async (id: string) => {
    try {
      await call("DELETE", `/api/admin/chat/groups/${id}`);
      await load();
    } catch (err) {
      setError(errorText(t, err));
    }
  };
  const nameOf = (id: string) => users.find((u) => u.id === id)?.displayName ?? id;
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-labelledby="chat-groups-title">
      <h2 id="chat-groups-title" className="text-base font-semibold">
        {t("chatadmin.groups_title")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("chatadmin.groups_intro")}</p>
      {error && <Notice kind="error">{error}</Notice>}
      {!groups && !error && <Spinner label={t("common.loading")} />}
      <ul className="divide-y divide-border">
        {groups?.map((g) => (
          <li key={g.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                @{g.handle} <span className="font-normal text-muted-foreground">{g.name}</span>
              </p>
              <p className="text-xs text-muted-foreground">{g.members.map(nameOf).join(", ") || t("chatadmin.groups_empty")}</p>
            </div>
            <span className="flex gap-1">
              <button type="button" className="h-8 rounded-md px-2 text-sm hover:bg-accent" onClick={() => setEditing({ id: g.id, handle: g.handle, name: g.name, members: g.members })}>
                {t("chat.details_edit")}
              </button>
              <button type="button" className="h-8 rounded-md px-2 text-sm text-destructive hover:bg-destructive/10" aria-label={t("chatadmin.groups_delete", { name: g.handle })} onClick={() => void remove(g.id)}>
                <IconTrash size={15} />
              </button>
            </span>
          </li>
        ))}
      </ul>
      {editing ? (
        <div className="space-y-2 rounded-md border border-border p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm font-medium">
              {t("chatadmin.groups_handle")}
              <input value={editing.handle} onChange={(e) => setEditing({ ...editing, handle: e.target.value })} placeholder="vertrieb" className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm font-normal" />
            </label>
            <label className="text-sm font-medium">
              {t("chatadmin.groups_name")}
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm font-normal" />
            </label>
          </div>
          <fieldset>
            <legend className="text-sm font-medium">{t("chatadmin.groups_members")}</legend>
            <div className="mt-1 grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
              {users.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editing.members.includes(u.id)}
                    onChange={(e) => setEditing({ ...editing, members: e.target.checked ? [...editing.members, u.id] : editing.members.filter((m) => m !== u.id) })}
                  />
                  {u.displayName}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex justify-end gap-2">
            <button type="button" className="h-9 rounded-md px-3 text-sm hover:bg-accent" onClick={() => setEditing(null)}>
              {t("chat.cancel")}
            </button>
            <button type="button" className="h-9 rounded-md bg-primary px-4 text-sm text-primary-foreground" onClick={() => void save()}>
              {t("chat.save_edit")}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="h-9 rounded-md border border-border px-3 text-sm hover:bg-accent" onClick={() => setEditing({ handle: "", name: "", members: [] })}>
          {t("chatadmin.groups_add")}
        </button>
      )}
    </section>
  );
}

export function EmojiAdmin() {
  const t = useXT();
  const [emoji, setEmoji] = useState<{ name: string; updated: number }[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setEmoji((await call<{ emoji: { name: string; updated: number }[] }>("GET", "/api/chat/emoji")).emoji);
    } catch (err) {
      setError(errorText(t, err));
    }
  }, [t]);
  useEffect(() => {
    void load();
  }, [load]);
  const upload = async (file: File) => {
    setError(null);
    const label = (name || file.name.replace(/\.[^.]+$/, "")).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 32);
    try {
      const data = btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer())));
      setEmoji((await call<{ emoji: { name: string; updated: number }[] }>("POST", "/api/admin/chat/emoji", { name: label, data })).emoji);
      setName("");
    } catch (err) {
      setError(errorText(t, err));
    }
  };
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-labelledby="chat-emoji-title">
      <h2 id="chat-emoji-title" className="text-base font-semibold">
        {t("chatadmin.emoji_title")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("chatadmin.emoji_intro")}</p>
      {error && <Notice kind="error">{error}</Notice>}
      <ul className="flex flex-wrap gap-2">
        {emoji?.map((e) => (
          <li key={e.name} className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-sm">
            <img src={emojiUrl(e.name, e.updated)} alt="" width={20} height={20} className="object-contain" />:{e.name}:
            <button type="button" aria-label={t("chatadmin.emoji_delete", { name: e.name })} className="rounded p-0.5 text-muted-foreground hover:text-destructive" onClick={() => void call("DELETE", `/api/admin/chat/emoji/${e.name}`).then(load, (err: unknown) => setError(errorText(t, err)))}>
              <IconTrash size={13} />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("chatadmin.emoji_name")} aria-label={t("chatadmin.emoji_name")} className="h-9 w-48 rounded-md border border-input bg-transparent px-2 text-sm" />
        <label className="flex h-9 cursor-pointer items-center rounded-md border border-border px-3 text-sm hover:bg-accent">
          {t("chatadmin.emoji_upload")}
          <input
            type="file"
            accept="image/png,image/gif,image/webp,image/jpeg"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </label>
        <span className="text-xs text-muted-foreground">{t("chatadmin.emoji_limits")}</span>
      </div>
    </section>
  );
}
