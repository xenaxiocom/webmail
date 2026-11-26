"use client";

// Step 153: the company admin's list of outgoing mail — when, who (person and login), from which
// address, over which channel (SMTP or Xenaxio), to whom and whether it arrived. No subject or
// content: the platform does not keep them. The filters a person applied are kept on the
// platform (rule 10); colours only from the theme (rule 11).
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Notice, Spinner } from "@/components/xenaxio/ui";
import { withBasePath } from "@/lib/browser-navigation";
import { cn } from "@/lib/utils";
import { errorKey, type OutgoingEntry, type OutgoingFilter, type OutgoingState, outgoingQuery, type WorkspaceUser, xenaxio } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";
import { useViewPrefs } from "@/lib/xenaxio/view-prefs";

const select = "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm";
const CHANNELS = ["smtp", "xenaxio"] as const;
const STATUSES = ["failed", "deferred", "pending", "delivered"] as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The stored filter, with anything unknown or old dropped. */
export function parseOutgoingFilter(raw: Record<string, unknown>): OutgoingFilter {
  const text = (v: unknown) => (typeof v === "string" && v.trim() && v.length <= 320 ? v.trim() : undefined);
  const out: OutgoingFilter = {};
  const userId = text(raw.userId);
  if (userId) out.userId = userId;
  const sender = text(raw.sender);
  if (sender) out.sender = sender;
  const recipient = text(raw.recipient);
  if (recipient) out.recipient = recipient;
  if (CHANNELS.includes(raw.channel as (typeof CHANNELS)[number])) out.channel = raw.channel as OutgoingFilter["channel"];
  if (STATUSES.includes(raw.status as (typeof STATUSES)[number])) out.status = raw.status as OutgoingFilter["status"];
  if (typeof raw.from === "string" && DAY.test(raw.from)) out.from = raw.from;
  if (typeof raw.to === "string" && DAY.test(raw.to)) out.to = raw.to;
  return out;
}

const parsePrefs = (raw: Record<string, unknown>) => ({ filter: parseOutgoingFilter((raw.filter as Record<string, unknown> | undefined) ?? {}) });

const stateClass: Record<OutgoingState, string> = {
  delivered: "text-success",
  deferred: "text-warning",
  failed: "text-destructive",
  pending: "text-muted-foreground",
};

export function OutgoingMailView() {
  const t = useXT();
  const locale = useLocale();
  const [prefs, setPrefs] = useViewPrefs("workspace.outgoing", parsePrefs);
  const applied = prefs.filter;
  const [draft, setDraft] = useState<OutgoingFilter>(applied);
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [entries, setEntries] = useState<OutgoingEntry[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (f: OutgoingFilter, append: boolean) => {
      setError(null);
      try {
        const res = await xenaxio.outgoing(f);
        setEntries((prev) => (append && prev ? [...prev, ...res.entries] : res.entries));
        setNext(res.next);
      } catch (err) {
        setError(t(errorKey(err)));
      }
    },
    [t],
  );

  useEffect(() => {
    void xenaxio.users().then((r) => setUsers(r.users), () => setUsers([]));
  }, []);

  // The applied filter comes from the platform (it may arrive after the first render).
  const appliedKey = outgoingQuery(applied);
  useEffect(() => {
    setDraft(applied);
    void load(applied, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- appliedKey stands for the filter.
  }, [appliedKey, load]);

  const apply = (e: FormEvent) => {
    e.preventDefault();
    const f = parseOutgoingFilter(draft as Record<string, unknown>);
    if (outgoingQuery(f) === appliedKey) void load(f, false);
    else setPrefs({ filter: f });
  };
  const reset = () => {
    setDraft({});
    setPrefs({ filter: {} });
  };

  const set = (k: keyof OutgoingFilter, v: string) => setDraft((f) => ({ ...f, [k]: v || undefined }));
  const time = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
  const filtered = appliedKey !== "";

  return (
    <div className="space-y-4">
      <form onSubmit={apply} className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-3 lg:grid-cols-7">
        <label className="space-y-1 text-xs font-medium">
          {t("outgoing.filter_person")}
          <select className={select} value={draft.userId ?? ""} onChange={(e) => set("userId", e.target.value)}>
            <option value="">{t("outgoing.all")}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium">
          {t("outgoing.filter_sender")}
          <input className={select} value={draft.sender ?? ""} onChange={(e) => set("sender", e.target.value)} placeholder="info@" maxLength={320} />
        </label>
        <label className="space-y-1 text-xs font-medium">
          {t("outgoing.filter_recipient")}
          <input className={select} value={draft.recipient ?? ""} onChange={(e) => set("recipient", e.target.value)} placeholder="example.com" maxLength={320} />
        </label>
        <label className="space-y-1 text-xs font-medium">
          {t("outgoing.filter_channel")}
          <select className={select} value={draft.channel ?? ""} onChange={(e) => set("channel", e.target.value)}>
            <option value="">{t("outgoing.all")}</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {t(`outgoing.channel_${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium">
          {t("outgoing.filter_status")}
          <select className={select} value={draft.status ?? ""} onChange={(e) => set("status", e.target.value)}>
            <option value="">{t("outgoing.all")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`outgoing.status_${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium">
          {t("outgoing.filter_from")}
          <input type="date" className={select} value={draft.from ?? ""} onChange={(e) => set("from", e.target.value)} />
        </label>
        <label className="space-y-1 text-xs font-medium">
          {t("outgoing.filter_to")}
          <input type="date" className={select} value={draft.to ?? ""} onChange={(e) => set("to", e.target.value)} />
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-3 lg:col-span-7">
          <Button type="submit" size="sm">
            {t("outgoing.apply")}
          </Button>
          {filtered && (
            <Button type="button" size="sm" variant="ghost" onClick={reset}>
              {t("outgoing.reset")}
            </Button>
          )}
          <a className="whitespace-nowrap text-sm text-primary hover:underline" href={withBasePath(`/api/admin/outgoing.csv${appliedKey}`)} download>
            {t("outgoing.csv")}
          </a>
        </div>
      </form>
      <p className="text-xs text-muted-foreground">{t("outgoing.note")}</p>
      {error && <Notice kind="error">{error}</Notice>}
      {!entries ? (
        <Spinner label={t("common.loading")} />
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("outgoing.empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-3 py-2 font-medium">{t("outgoing.col_time")}</th>
                <th className="px-3 py-2 font-medium">{t("outgoing.col_person")}</th>
                <th className="px-3 py-2 font-medium">{t("outgoing.col_sender")}</th>
                <th className="px-3 py-2 font-medium">{t("outgoing.col_channel")}</th>
                <th className="px-3 py-2 font-medium">{t("outgoing.col_recipients")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{time(e.at)}</td>
                  <td className="max-w-[14rem] px-3 py-2">
                    {e.user ? <div className="truncate">{e.user.name || e.user.email}</div> : <div className="text-muted-foreground">{t("outgoing.person_unknown")}</div>}
                    {/* The SMTP login when there was one, else the person's address. */}
                    {e.login ? (
                      <div className="truncate text-xs text-muted-foreground">{t("outgoing.login", { login: e.login })}</div>
                    ) : (
                      e.user && e.user.name && <div className="truncate text-xs text-muted-foreground">{e.user.email}</div>
                    )}
                  </td>
                  <td className="max-w-[14rem] truncate px-3 py-2" title={e.sender}>
                    {e.sender}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{e.channel ? t(`outgoing.channel_${e.channel}`) : "–"}</td>
                  <td className="px-3 py-2">
                    <ul className="space-y-1">
                      {e.recipients.map((r) => (
                        <li key={r.address} className="text-xs" title={r.reply}>
                          <span className="break-all">{r.address}</span>
                          <span className={cn("ml-2 whitespace-nowrap font-medium", stateClass[r.state])}>{t(`outgoing.state_${r.state}`)}</span>
                          {r.reason && r.state === "failed" && <div className="text-muted-foreground">{t(`delivery.reason.${r.reason}`)}</div>}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {next && (
        <Button variant="outline" size="sm" onClick={() => load({ ...applied, before: next }, true)}>
          {t("outgoing.more")}
        </Button>
      )}
    </div>
  );
}
