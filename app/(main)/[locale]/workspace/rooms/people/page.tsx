"use client";

// Step 96: people of a company without email (XenRooms). The admin invites
// colleagues by their own work email; they set a password with the link from
// the invitation. Block, unblock, remove; the chat follows.
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Plus } from "@/components/icons";
import { Notice, TextField } from "@/components/xenaxio/ui";
import { useMe, WorkspaceShell } from "@/components/xenaxio/workspace-shell";
import { errorText, type RoomsPerson, type RoomsPlanInfo, xenaxio } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";

/** Gigabytes with one decimal (Free: 5 GB). */
const gb = (bytes: number) => (bytes / 1024 ** 3).toLocaleString(undefined, { maximumFractionDigits: 1 });

function Person({ person, isSelf, onChanged, onMessage }: {
  person: RoomsPerson;
  isSelf: boolean;
  onChanged: () => Promise<void>;
  onMessage: (m: { kind: "error" | "success"; text: string }) => void;
}) {
  const t = useXT();
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    try {
      await action();
      if (success) onMessage({ kind: "success", text: success });
      await onChanged();
    } catch (err) {
      onMessage({ kind: "error", text: errorText(t, err) });
    } finally {
      setBusy(false);
    }
  };
  const blocked = person.status === "disabled";

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="font-medium truncate">
          {person.displayName}
          {person.role === "admin" && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">{t("rooms.people_admin")}</span>}
          {person.invited && <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-normal text-amber-700 dark:text-amber-400">{t("rooms.people_invited")}</span>}
          {blocked && <span className="ml-2 rounded bg-destructive/15 px-1.5 py-0.5 text-xs font-normal text-destructive">{t("rooms.people_blocked")}</span>}
        </p>
        <p className="text-sm text-muted-foreground truncate">{person.email}</p>
        {person.chatAddress && <p className="text-xs text-muted-foreground truncate font-mono">{person.chatAddress}</p>}
      </div>
      {!isSelf && (
        <div className="flex flex-wrap gap-2">
          {person.invited && !blocked && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => xenaxio.roomsResend(person.id), t("rooms.people_resent", { email: person.email }))}>
              {t("rooms.people_resend")}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className={blocked ? "" : "text-destructive"}
            disabled={busy}
            onClick={() => {
              if (!blocked && !window.confirm(t("rooms.people_block_confirm", { email: person.email }))) return;
              void run(() => xenaxio.roomsSetStatus(person.id, blocked ? "active" : "disabled"));
            }}
          >
            {blocked ? t("rooms.people_unblock") : t("rooms.people_block")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(t("rooms.people_remove_confirm", { email: person.email }))) return;
              void run(() => xenaxio.roomsRemove(person.id), t("rooms.people_removed", { email: person.email }));
            }}
          >
            {t("rooms.people_remove")}
          </Button>
        </div>
      )}
    </li>
  );
}

function People() {
  const t = useXT();
  const me = useMe();
  const [data, setData] = useState<{ people: RoomsPerson[]; limit: number | null; chatDomain: string | null; plan?: RoomsPlanInfo | null } | null>(null);
  const [form, setForm] = useState({ email: "", displayName: "", admin: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await xenaxio.roomsPeople());
    } catch (err) {
      setMessage({ kind: "error", text: errorText(t, err) });
    }
  }, [t]);
  useEffect(() => {
    void load();
  }, [load]);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const person = await xenaxio.roomsInvite({ email: form.email.trim(), displayName: form.displayName.trim(), ...(form.admin ? { role: "admin" as const } : {}) });
      setMessage({ kind: "success", text: t("rooms.people_invite_sent", { email: person.email }) });
      setForm({ email: "", displayName: "", admin: false });
      await load();
    } catch (err) {
      setMessage({ kind: "error", text: errorText(t, err) });
    } finally {
      setBusy(false);
    }
  };

  if (me.tenant.product !== "rooms") return <Notice kind="info">{t("rooms.people_not_rooms")}</Notice>;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {t("rooms.people_intro")}
        {data?.chatDomain && (
          <>
            {" "}
            {t("rooms.people_chat_domain", { domain: data.chatDomain })}
          </>
        )}
      </p>
      {message && <Notice kind={message.kind}>{message.text}</Notice>}
      {/* Step 97: XenRooms Free — what is used, and the way to more. */}
      {data?.plan?.plan === "free" && (
        <section className="rounded-lg border border-border bg-card p-4 text-sm">
          <h2 className="font-medium">{t("rooms.plan_free_title")}</h2>
          <p className="mt-1 text-muted-foreground">
            {t("rooms.plan_free_usage", {
              people: data.people.length,
              maxPeople: data.plan.maxPeople ?? 0,
              used: gb(data.plan.usedBytes),
              storage: gb(data.plan.storageBytes ?? 0),
            })}
          </p>
          {data.plan.federationAfter && <p className="mt-1 text-muted-foreground">{t("rooms.plan_free_federation", { date: new Date(data.plan.federationAfter).toLocaleDateString() })}</p>}
          <p className="mt-2">
            <a className="text-primary hover:underline" href="https://xenrooms.com/request-access/" target="_blank" rel="noopener">
              {t("rooms.plan_free_more")} →
            </a>
          </p>
        </section>
      )}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 font-medium">{t("rooms.people_invite")}</h2>
        <form onSubmit={invite} className="grid gap-3 sm:grid-cols-2">
          <TextField label={t("rooms.people_name")} value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} autoComplete="off" required />
          <TextField label={t("rooms.work_email")} type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} autoComplete="off" required />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={form.admin} onChange={(e) => setForm((f) => ({ ...f, admin: e.target.checked }))} />
            {t("rooms.people_make_admin")}
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy || !form.displayName.trim() || !form.email.includes("@")}>
              <Plus className="mr-1.5 h-4 w-4" />
              {t("rooms.people_invite_submit")}
            </Button>
          </div>
        </form>
      </section>
      {data && (
        <section>
          <h2 className="mb-2 font-medium">
            {t("rooms.people_list")} {data.limit ? <span className="text-sm font-normal text-muted-foreground">({t("rooms.people_count", { count: data.people.length, limit: data.limit })})</span> : null}
          </h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {data.people.map((p) => (
              <Person key={p.id} person={p} isSelf={p.id === me.user.id} onChanged={load} onMessage={setMessage} />
            ))}
          </ul>
        </section>
      )}
      <p className="text-sm">
        <Link href="/workspace/chat" className="text-primary hover:underline">
          {t("rooms.people_chat_settings")} →
        </Link>
      </p>
    </div>
  );
}

export default function RoomsPeoplePage() {
  const t = useXT();
  return (
    <WorkspaceShell title={t("rooms.people_title")} requireAdmin>
      <People />
    </WorkspaceShell>
  );
}
