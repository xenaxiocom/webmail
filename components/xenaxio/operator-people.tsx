"use client";

// Step 106, part A: every person on the installation — which companies they
// are in, when they came, signed in and were last active. One email can be in
// several companies (XenRooms), so a row is one email with all its accounts.
import { Fragment, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Notice, Spinner } from "@/components/xenaxio/ui";
import {
  errorKey,
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
      <Tile label={t("operator.people_disabled")} value={s.disabledAccounts} />
      <Tile label={t("operator.people_companies")} value={s.companies} sub={t("operator.people_companies_sub", { workspace: s.workspaceCompanies, free: s.roomsFreeCompanies, paid: s.roomsPaidCompanies })} />
      <Tile label={t("operator.people_signups")} value={s.freeSignups7} sub={t("operator.people_in_30", { count: s.freeSignups30 })} />
    </div>
  );
}

function AccountStatus({ a }: { a: OperatorPersonAccount }) {
  const t = useXT();
  if (a.status === "disabled") return <span className="text-destructive">{t("operator.person_disabled")}</span>;
  if (a.invited) return <span className="text-muted-foreground">{t("operator.person_invited")}</span>;
  return <span>{t("operator.person_active")}</span>;
}

function productLabel(a: OperatorPersonAccount): string {
  if (a.product === "workspace") return "Xenaxio";
  return a.plan === "free" ? "XenRooms Free" : "XenRooms";
}

function PersonCard({ email }: { email: string }) {
  const t = useXT();
  const date = useDate();
  const [person, setPerson] = useState<OperatorPerson | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    xenaxio.operator.person(email).then(setPerson, (err) => setError(t(errorKey(err))));
  }, [email, t]);
  if (error) return <Notice kind="error">{error}</Notice>;
  if (!person) return <Spinner label={t("operator.loading")} />;
  return (
    <div className="space-y-3 text-sm">
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
    </div>
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

  useEffect(() => {
    xenaxio.operator.peopleSummary().then(setSummary, (err) => setError(t(errorKey(err))));
  }, [t]);

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
  }, [filter, t]);

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
                        <td className="px-3 py-2">{disabled ? <span className="text-destructive">{t("operator.person_disabled")}</span> : <AccountStatus a={first} />}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{date(p.createdAt)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{date(p.lastSeenAt)}</td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={6} className="bg-muted/30 px-3 py-3">
                            <PersonCard email={p.email} />
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
