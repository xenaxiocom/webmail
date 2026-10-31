"use client";

// Step 106, part A: every person on the installation — which companies they
// are in, when they came, signed in and were last active. One email can be in
// several companies (XenRooms), so a row is one email with all its accounts.
// Part B: the operator blocks a person (every account or one), keeps addresses
// and mail domains from signing up again, and sees what was done (part D).
import { type FormEvent, Fragment, useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Notice, Spinner } from "@/components/xenaxio/ui";
import {
  type BlockedSignup,
  errorKey,
  type OperatorAction,
  type OperatorPeopleFilter,
  type OperatorPeopleSummary,
  type OperatorPerson,
  type OperatorPersonAccount,
  type OperatorPersonRow,
  peopleQuery,
  xenaxio,
} from "@/lib/xenaxio/api";
import { withBasePath } from "@/lib/browser-navigation";
import { useXT } from "@/lib/xenaxio/i18n";

const SELECT = "h-9 rounded-md border border-input bg-background px-2 text-sm";

function useDate() {
  const locale = useLocale();
  return (s: string | null) => (s ? new Date(s).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : "—");
}

function Tile({ label, value, sub }: { label: string; value: number; sub?: string }) {
  const locale = useLocale();
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value.toLocaleString(locale)}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function PeopleSummaryTiles({ s }: { s: OperatorPeopleSummary }) {
  const t = useXT();
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Tile label={t("operator.people_total")} value={s.people} sub={t("operator.people_accounts", { count: s.accounts })} />
      <Tile label={t("operator.people_workspace")} value={s.workspacePeople} sub={t("operator.people_rooms", { count: s.roomsPeople })} />
      <Tile label={t("operator.people_new")} value={s.new7} sub={t("operator.people_in_30", { count: s.new30 })} />
      <Tile label={t("operator.people_active")} value={s.active7} sub={t("operator.people_in_30", { count: s.active30 })} />
      <Tile label={t("operator.people_never")} value={s.neverSignedIn} />
      <Tile label={t("operator.people_disabled")} value={s.disabledAccounts} sub={t("operator.people_operator_blocked", { count: s.operatorBlockedAccounts ?? 0 })} />
      <Tile label={t("operator.people_companies")} value={s.companies} sub={t("operator.people_companies_sub", { workspace: s.workspaceCompanies, free: s.roomsFreeCompanies, paid: s.roomsPaidCompanies })} />
      <Tile label={t("operator.people_signups")} value={s.freeSignups7} sub={t("operator.people_in_30", { count: s.freeSignups30 })} />
    </div>
  );
}

function AccountStatus({ a }: { a: OperatorPersonAccount }) {
  const t = useXT();
  if (a.operatorBlockedAt) return <span className="text-destructive" title={a.operatorBlockReason ?? undefined}>{t("operator.person_operator_blocked")}</span>;
  if (a.status === "disabled") return <span className="text-destructive">{t("operator.person_disabled")}</span>;
  if (a.invited) return <span className="text-muted-foreground">{t("operator.person_invited")}</span>;
  return <span>{t("operator.person_active")}</span>;
}

function productLabel(a: OperatorPersonAccount): string {
  if (a.product === "workspace") return "Xenaxio";
  return a.plan === "free" ? "XenRooms Free" : "XenRooms";
}

/** What the operator did with this address (part D). */
function ActionLine({ a }: { a: OperatorAction }) {
  const t = useXT();
  const date = useDate();
  const scope = a.details.scope === "account" ? t("operator.action_scope_account") : "";
  return (
    <li>
      {date(a.createdAt)} · {t(`operator.action_${a.action}`)}
      {scope && ` (${scope})`} · {a.operator}
      {a.reason && <span className="text-muted-foreground"> — {a.reason}</span>}
    </li>
  );
}

/** Part B: block every account of the address or one of them, with a reason. */
function BlockForm({ person, onDone }: { person: OperatorPerson; onDone: (message: string) => void }) {
  const t = useXT();
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<string>("all");
  const [blockSignup, setBlockSignup] = useState(true);
  const [blockDomain, setBlockDomain] = useState(false);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const domain = person.email.split("@")[1] ?? "";
  const open = person.accounts.filter((a) => !a.operatorBlockedAt);
  if (!open.length) return null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!window.confirm(t("operator.person_block_confirm", { email: person.email }))) return;
    setBusy(true);
    setError(null);
    try {
      const res = await xenaxio.operator.blockPerson({
        email: person.email,
        ...(scope === "all" ? {} : { userId: scope }),
        reason: reason.trim(),
        blockSignup,
        blockDomain,
        notify,
      });
      onDone(t("operator.blocked_done", { count: res.blocked }));
    } catch (err) {
      setError(t(errorKey(err)));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-2 rounded-md border border-destructive/40 p-3">
      <div className="text-xs font-medium text-destructive">{t("operator.block_title")}</div>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">{t("operator.block_reason")}</span>
        <textarea
          required
          minLength={3}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
          placeholder={t("operator.block_reason_hint")}
        />
      </label>
      <select aria-label={t("operator.block_scope")} className={SELECT} value={scope} onChange={(e) => setScope(e.target.value)}>
        <option value="all">{t("operator.block_all", { count: person.accounts.length })}</option>
        {open.map((a) => (
          <option key={a.userId} value={a.userId}>
            {t("operator.block_one", { company: a.company })}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={blockSignup} onChange={(e) => setBlockSignup(e.target.checked)} />
        {t("operator.block_signup")}
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={blockDomain} onChange={(e) => setBlockDomain(e.target.checked)} />
        {t("operator.block_domain", { domain })}
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        {t("operator.block_notify")}
      </label>
      {error && <Notice kind="error">{error}</Notice>}
      <Button type="submit" size="sm" variant="destructive" disabled={busy || reason.trim().length < 3}>
        {t("operator.person_block")}
      </Button>
    </form>
  );
}

function PersonCard({ email, onChanged }: { email: string; onChanged: () => void }) {
  const t = useXT();
  const date = useDate();
  const [person, setPerson] = useState<OperatorPerson | null>(null);
  const [actions, setActions] = useState<OperatorAction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    xenaxio.operator.person(email).then(setPerson, (err) => setError(t(errorKey(err))));
    xenaxio.operator.actions(email).then(setActions, () => setActions([]));
  }, [email, t]);
  useEffect(load, [load]);
  const changed = (text: string) => {
    setMessage(text);
    load();
    onChanged();
  };
  const unblock = async () => {
    if (!window.confirm(t("operator.unblock_confirm", { email }))) return;
    setBusy(true);
    try {
      const res = await xenaxio.operator.unblockPerson({ email });
      changed(t("operator.unblocked_done", { count: res.unblocked }));
    } catch (err) {
      setError(t(errorKey(err)));
    } finally {
      setBusy(false);
    }
  };
  if (error) return <Notice kind="error">{error}</Notice>;
  if (!person) return <Spinner label={t("operator.loading")} />;
  const blockedAny = person.accounts.some((a) => a.operatorBlockedAt);
  return (
    <div className="space-y-3 text-sm">
      {message && <Notice kind="success">{message}</Notice>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1 pr-3 font-medium">{t("operator.col_company")}</th>
              <th className="py-1 pr-3 font-medium">{t("operator.person_product")}</th>
              <th className="py-1 pr-3 font-medium">{t("operator.person_role")}</th>
              <th className="py-1 pr-3 font-medium">{t("operator.col_status")}</th>
              <th className="py-1 pr-3 font-medium">{t("operator.person_created")}</th>
              <th className="py-1 pr-3 font-medium">{t("operator.person_last_login")}</th>
              <th className="py-1 font-medium">{t("operator.person_last_seen")}</th>
            </tr>
          </thead>
          <tbody>
            {person.accounts.map((a) => (
              <tr key={a.userId}>
                <td className="py-1 pr-3">
                  {a.company} {a.slug && <span className="text-xs text-muted-foreground">{a.slug}</span>}
                  {a.companyStatus !== "active" && <span className="ml-1 text-xs text-destructive">({t(`operator.status_${a.companyStatus}`)})</span>}
                </td>
                <td className="py-1 pr-3">
                  {productLabel(a)} <span className="text-xs text-muted-foreground">{a.kind === "mailbox" ? t("operator.person_mailbox") : t("operator.person_chat_only")}</span>
                </td>
                <td className="py-1 pr-3">{a.role === "admin" ? t("operator.person_admin") : t("operator.person_user")}</td>
                <td className="py-1 pr-3">
                  <AccountStatus a={a} />
                </td>
                <td className="py-1 pr-3">{date(a.createdAt)}</td>
                <td className="py-1 pr-3">{date(a.lastLoginAt)}</td>
                <td className="py-1">{date(a.lastSeenAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <div className="text-xs font-medium text-muted-foreground">{t("operator.person_last_login")}</div>
        {person.lastLogin ? (
          <div>
            {date(person.lastLogin.at)} · IP {person.lastLogin.ip ?? "—"}
            {person.lastLogin.country && ` · ${person.lastLogin.country}`}
          </div>
        ) : (
          <div className="text-muted-foreground">{t("operator.person_never_signed_in")}</div>
        )}
      </div>
      <div>
        <div className="text-xs font-medium text-muted-foreground">{t("operator.person_devices")}</div>
        {person.devices.length === 0 ? (
          <div className="text-muted-foreground">{t("operator.person_no_devices")}</div>
        ) : (
          <ul className="space-y-0.5">
            {person.devices.map((d, i) => (
              <li key={i}>
                {[d.browser, d.os].filter(Boolean).join(" · ") || t("operator.person_unknown_device")} — {d.company} · {t("operator.person_device_seen", { at: date(d.lastSeenAt) })}
              </li>
            ))}
          </ul>
        )}
      </div>
      {person.signupBlocked && <div className="text-xs text-destructive">{t("operator.person_signup_blocked")}</div>}
      <div className="flex flex-wrap gap-2">
        {blockedAny && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void unblock()}>
            {t("operator.person_unblock")}
          </Button>
        )}
      </div>
      <BlockForm person={person} onDone={changed} />
      {actions.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground">{t("operator.person_history")}</div>
          <ul className="space-y-0.5">
            {actions.map((a) => (
              <ActionLine key={a.id} a={a} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Part B: addresses and mail domains that may not sign up or be invited. */
function BlockedSignups() {
  const t = useXT();
  const date = useDate();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<BlockedSignup[] | null>(null);
  const [kind, setKind] = useState<"email" | "domain">("email");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open && !list) xenaxio.operator.blockedSignups().then(setList, (err) => setError(t(errorKey(err))));
  }, [open, list, t]);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      setList(await xenaxio.operator.addBlockedSignup(kind, value.trim(), reason.trim() || undefined));
      setValue("");
      setReason("");
    } catch (err) {
      setError(t(errorKey(err)));
    }
  };
  const remove = async (b: BlockedSignup) => {
    if (!window.confirm(t("operator.signup_allow_confirm", { value: b.value }))) return;
    try {
      setList(await xenaxio.operator.removeBlockedSignup(b.id));
    } catch (err) {
      setError(t(errorKey(err)));
    }
  };
  return (
    <details className="rounded-lg border border-border bg-card" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{t("operator.signups_blocked_title")}</summary>
      <div className="space-y-3 px-3 pb-3 text-sm">
        <p className="text-xs text-muted-foreground">{t("operator.signups_blocked_hint")}</p>
        <form onSubmit={add} className="flex flex-wrap items-end gap-2">
          <select aria-label={t("operator.signups_kind")} className={SELECT} value={kind} onChange={(e) => setKind(e.target.value as "email" | "domain")}>
            <option value="email">{t("operator.signups_kind_email")}</option>
            <option value="domain">{t("operator.signups_kind_domain")}</option>
          </select>
          <input
            required
            aria-label={t("operator.signups_value")}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={kind === "email" ? "name@example.com" : "example.com"}
            className="h-9 min-w-[180px] flex-1 rounded-md border border-input bg-background px-3 text-sm"
          />
          <input
            aria-label={t("operator.block_reason")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("operator.block_reason")}
            className="h-9 min-w-[160px] flex-1 rounded-md border border-input bg-background px-3 text-sm"
          />
          <Button type="submit" size="sm" variant="outline">
            {t("operator.signups_add")}
          </Button>
        </form>
        {error && <Notice kind="error">{error}</Notice>}
        {list && list.length === 0 && <p className="text-muted-foreground">{t("operator.signups_none")}</p>}
        {list && list.length > 0 && (
          <ul className="divide-y divide-border">
            {list.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span>
                  <span className="font-medium break-all">{b.kind === "domain" ? `@${b.value}` : b.value}</span>
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · {date(b.createdAt)}
                    {b.createdBy && ` · ${b.createdBy}`}
                    {b.reason && ` — ${b.reason}`}
                  </span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => void remove(b)}>
                  {t("operator.signups_remove")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

export function OperatorPeople() {
  const t = useXT();
  const date = useDate();
  const locale = useLocale();
  const [summary, setSummary] = useState<OperatorPeopleSummary | null>(null);
  const [filter, setFilter] = useState<OperatorPeopleFilter>({ sort: "created", page: 1 });
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<{ people: OperatorPersonRow[]; total: number; pageSize: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [version, setVersion] = useState(0);
  // After a block or unblock: counters and the list again.
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    xenaxio.operator.peopleSummary().then(setSummary, (err) => setError(t(errorKey(err))));
  }, [t, version]);

  // The search waits until typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setFilter((f) => (f.q === (search.trim() || undefined) ? f : { ...f, q: search.trim() || undefined, page: 1 })), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let current = true;
    setError(null);
    xenaxio.operator.people(filter).then(
      (r) => current && setRows(r),
      (err) => current && setError(t(errorKey(err))),
    );
    return () => {
      current = false;
    };
  }, [filter, t, version]);

  const set = <K extends keyof OperatorPeopleFilter>(key: K, value: OperatorPeopleFilter[K] | "") =>
    setFilter((f) => ({ ...f, [key]: value === "" ? undefined : value, page: 1 }));
  const page = filter.page ?? 1;
  const pages = rows ? Math.max(1, Math.ceil(rows.total / rows.pageSize)) : 1;
  const { page: _page, ...csvFilter } = filter;

  return (
    <div className="space-y-4">
      {summary && <PeopleSummaryTiles s={summary} />}

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[200px] flex-1 space-y-1 text-sm font-medium">
          <span className="block">{t("operator.people_search")}</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("operator.people_search_hint")}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </label>
        <select aria-label={t("operator.person_product")} className={SELECT} value={filter.product ?? ""} onChange={(e) => set("product", e.target.value as OperatorPeopleFilter["product"] | "")}>
          <option value="">{t("operator.people_all_products")}</option>
          <option value="workspace">Xenaxio</option>
          <option value="rooms">XenRooms</option>
        </select>
        <select aria-label={t("operator.people_plan")} className={SELECT} value={filter.plan ?? ""} onChange={(e) => set("plan", e.target.value as OperatorPeopleFilter["plan"] | "")}>
          <option value="">{t("operator.people_all_plans")}</option>
          <option value="free">Free</option>
          <option value="paid">{t("operator.people_paid")}</option>
        </select>
        <select aria-label={t("operator.person_role")} className={SELECT} value={filter.role ?? ""} onChange={(e) => set("role", e.target.value as OperatorPeopleFilter["role"] | "")}>
          <option value="">{t("operator.people_all_roles")}</option>
          <option value="admin">{t("operator.person_admin")}</option>
          <option value="user">{t("operator.person_user")}</option>
        </select>
        <select aria-label={t("operator.col_status")} className={SELECT} value={filter.status ?? ""} onChange={(e) => set("status", e.target.value as OperatorPeopleFilter["status"] | "")}>
          <option value="">{t("operator.people_all_statuses")}</option>
          <option value="active">{t("operator.person_active")}</option>
          <option value="disabled">{t("operator.person_disabled")}</option>
          <option value="operator_blocked">{t("operator.person_operator_blocked")}</option>
        </select>
        <select
          aria-label={t("operator.people_inactive")}
          className={SELECT}
          value={filter.inactiveDays ?? ""}
          onChange={(e) => set("inactiveDays", e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">{t("operator.people_any_activity")}</option>
          {[7, 30, 90].map((d) => (
            <option key={d} value={d}>
              {t("operator.people_inactive_days", { days: d })}
            </option>
          ))}
        </select>
        <select aria-label={t("operator.people_sort")} className={SELECT} value={filter.sort ?? "created"} onChange={(e) => set("sort", e.target.value as OperatorPeopleFilter["sort"])}>
          <option value="created">{t("operator.people_sort_created")}</option>
          <option value="seen">{t("operator.people_sort_seen")}</option>
          <option value="name">{t("operator.people_sort_name")}</option>
          <option value="email">{t("operator.people_sort_email")}</option>
        </select>
        <a className="pb-2 text-sm text-primary hover:underline" href={withBasePath(`/api/operator/people.csv${peopleQuery(csvFilter)}`)} download>
          {t("operator.download_csv")}
        </a>
      </div>

      <BlockedSignups />
      {error && <Notice kind="error">{error}</Notice>}
      {!rows && !error && <Spinner label={t("operator.loading")} />}
      {rows && (
        <>
          <p className="text-xs text-muted-foreground">{t("operator.people_found", { count: rows.total.toLocaleString(locale) })}</p>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 font-medium">{t("operator.person_name")}</th>
                  <th className="px-3 py-2 font-medium">{t("operator.col_company")}</th>
                  <th className="px-3 py-2 font-medium">{t("operator.person_product")}</th>
                  <th className="px-3 py-2 font-medium">{t("operator.col_status")}</th>
                  <th className="px-3 py-2 font-medium">{t("operator.person_created")}</th>
                  <th className="px-3 py-2 font-medium">{t("operator.person_last_seen")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.people.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                      {t("operator.people_none")}
                    </td>
                  </tr>
                )}
                {rows.people.map((p) => {
                  const first = p.accounts[0] as OperatorPersonAccount;
                  const disabled = p.accounts.every((a) => a.status === "disabled");
                  const expanded = open === p.email;
                  return (
                    <Fragment key={p.email}>
                      <tr className="cursor-pointer hover:bg-muted/50" onClick={() => setOpen(expanded ? null : p.email)} aria-expanded={expanded}>
                        <td className="px-3 py-2">
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground break-all">{p.email}</div>
                        </td>
                        <td className="px-3 py-2">
                          {first.company}
                          {p.accounts.length > 1 && <span className="ml-1 text-xs text-muted-foreground">{t("operator.people_more", { count: p.accounts.length - 1 })}</span>}
                        </td>
                        <td className="px-3 py-2">{[...new Set(p.accounts.map((a) => productLabel(a)))].join(", ")}</td>
                        <td className="px-3 py-2">
                          {p.accounts.some((a) => a.operatorBlockedAt) ? (
                            <span className="text-destructive">{t("operator.person_operator_blocked")}</span>
                          ) : disabled ? (
                            <span className="text-destructive">{t("operator.person_disabled")}</span>
                          ) : (
                            <AccountStatus a={first} />
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{date(p.createdAt)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{date(p.lastSeenAt)}</td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={6} className="bg-muted/30 px-3 py-3">
                            <PersonCard email={p.email} onChanged={reload} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between gap-2 text-sm">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setFilter((f) => ({ ...f, page: page - 1 }))}>
                {t("operator.people_prev")}
              </Button>
              <span className="text-muted-foreground">{t("operator.people_page", { page, pages })}</span>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setFilter((f) => ({ ...f, page: page + 1 }))}>
                {t("operator.people_next")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
