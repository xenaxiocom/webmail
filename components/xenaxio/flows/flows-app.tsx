"use client";

// xenaxio step F1.1: the "Flows" section next to mail, calendar, chat and
// meetings. Any employee of a company with flows creates a flow from a template
// and owns it (owners can add others); a flow has its own title, language,
// people, Telegram bot, directories and runs. The company's admin may open all
// flows of the company. (Step F1 had this as an admin page in the workspace.)
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Plus } from "@/components/icons";
import { InlineAppView } from "@/components/layout/inline-app-view";
import { MvTopBar } from "@/components/layout/mv-top-bar";
import { NavigationRail } from "@/components/layout/navigation-rail";
import { SidebarAppsModal } from "@/components/layout/sidebar-apps-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Notice, Spinner, TextField } from "@/components/xenaxio/ui";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useIsEmbedded } from "@/hooks/use-is-embedded";
import { withBasePath } from "@/lib/browser-navigation";
import { useIsMobile } from "@/hooks/use-media-query";
import { useMountainViewShell } from "@/hooks/use-mountain-view-shell";
import { useSidebarApps } from "@/hooks/use-sidebar-apps";
import { cn } from "@/lib/utils";
import {
  errorText,
  type FlowConnection,
  type FlowDetail,
  type FlowInstallation,
  type FlowParamDef,
  type FlowRunDetail,
  type FlowRunSummary,
  type FlowTask,
  type FlowsOverview,
  type FlowTexts,
  XenaxioApiError,
  xenaxio,
} from "@/lib/xenaxio/api";
import { setFlowsNavEnabled, setFlowsWaiting } from "@/lib/xenaxio/flows-nav";
import { useXT } from "@/lib/xenaxio/i18n";
import { redirectToLogin, saveRedirectAfterLogin, useAuthStore } from "@/stores/auth-store";
import { useEmailStore } from "@/stores/email-store";

const select = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
const FLOW_LANGUAGES = ["de", "en", "uk", "ru"];
type Msg = { kind: "error" | "success" | "info"; text: string } | null;

function pick(t: FlowTexts | null | undefined, locale: string, fallback = ""): string {
  if (!t) return fallback;
  if (typeof t === "string") return t;
  return t[locale] ?? t.en ?? Object.values(t)[0] ?? fallback;
}

/** A parameter value as the form edits it (people and mailboxes by id). */
function formValue(def: FlowParamDef, v: unknown): string {
  if (v === undefined || v === null) return def.type === "boolean" ? String(def.default ?? false) : "";
  if (typeof v === "object" && v !== null && "id" in v) return String((v as { id: string }).id);
  return String(v);
}

function apiValue(def: FlowParamDef, s: string): unknown {
  if (s === "") return null;
  if (def.type === "number" || def.type === "integer") return Number(s);
  if (def.type === "boolean") return s === "true";
  return s;
}

/** The mailbox a flow has, even when the one looking at it may not send from it (then it cannot be chosen anew). */
function mailboxOptions(overview: FlowsOverview, stored: unknown): [string, string][] {
  const list: [string, string][] = overview.mailboxes.map((m) => [m.id, m.email]);
  if (stored && typeof stored === "object" && "id" in stored && !list.some(([id]) => id === (stored as { id: string }).id)) {
    const s = stored as { id: string; address?: string };
    list.unshift([s.id, s.address ?? s.id]);
  }
  return list;
}

function ParamInput({ name, def, value, onChange, flow, overview }: { name: string; def: FlowParamDef; value: string; onChange: (v: string) => void; flow: FlowDetail; overview: FlowsOverview }) {
  const t = useXT();
  const locale = useLocale();
  const id = `param-${flow.id}-${name}`;
  const label = `${pick(def.label, locale, name)}${def.required ? " *" : ""}`;
  let hint = def.note ? pick(def.note, locale) : def.default !== undefined && def.default !== null ? String(def.default) : undefined;
  const options = (items: [string, string][]) => (
    <select id={id} className={select} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t("flows.choose")}</option>
      {items.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
  if (def.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input id={id} type="checkbox" className="h-4 w-4" checked={value === "true"} onChange={(e) => onChange(String(e.target.checked))} />
        {label}
      </label>
    );
  }
  let control;
  if (def.type === "person") {
    control = options(flow.people.map((p) => [p.id, p.name]));
    if (flow.people.length === 0) hint = t("flows.param_person_hint");
  } else if (def.type === "mailbox") {
    control = options(mailboxOptions(overview, flow.params[name]));
    hint = t("flows.param_mailbox_hint");
  } else if (def.type === "enum") control = options((def.values ?? []).map((v) => [v, v]));
  else if (def.type === "confirm_mode")
    control = options([
      ["never", t("flows.confirm_never")],
      ["always", t("flows.confirm_always")],
      ["new_recipient", t("flows.confirm_new_recipient")],
      ["low_confidence", t("flows.confirm_low_confidence")],
      ["first:5", t("flows.confirm_first", { n: 5 })],
    ]);
  else
    control = (
      <Input
        id={id}
        type={def.type === "number" || def.type === "integer" ? "number" : def.type === "email" ? "email" : "text"}
        placeholder={def.type === "duration" ? "24h" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  return (
    <Field label={label} hint={hint || undefined} htmlFor={id}>
      {control}
    </Field>
  );
}

function LanguageSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <select id={id} className={select} value={value} onChange={(e) => onChange(e.target.value)}>
      {FLOW_LANGUAGES.map((l) => (
        <option key={l} value={l}>
          {l}
        </option>
      ))}
    </select>
  );
}

function Settings({ flow, overview, onSaved }: { flow: FlowDetail; overview: FlowsOverview; onSaved: (f: FlowDetail) => void }) {
  const t = useXT();
  const [title, setTitle] = useState(flow.title);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(flow.paramDefs).map(([n, d]) => [n, formValue(d, flow.params[n])])));
  const [language, setLanguage] = useState(flow.language);
  const [perHour, setPerHour] = useState(String(flow.sendsPerHour));
  const [msg, setMsg] = useState<Msg>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const params = Object.fromEntries(Object.entries(flow.paramDefs).map(([n, d]) => [n, apiValue(d, values[n] ?? "")]));
      onSaved(await xenaxio.flows.update(flow.id, { title, params, language, sendsPerHour: Number(perHour) }));
      setMsg({ kind: "success", text: t("flows.saved") });
    } catch (err) {
      setMsg({ kind: "error", text: errorText(t, err) });
    }
  };
  return (
    <form onSubmit={save} className="space-y-3" noValidate>
      <h3 className="text-sm font-medium">{t("flows.settings")}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={t("flows.flow_title")} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        <Field label={t("flows.language")} hint={t("flows.language_hint")} htmlFor={`lang-${flow.id}`}>
          <LanguageSelect id={`lang-${flow.id}`} value={language} onChange={setLanguage} />
        </Field>
        {Object.entries(flow.paramDefs).map(([name, def]) => (
          <ParamInput key={name} name={name} def={def} flow={flow} overview={overview} value={values[name] ?? ""} onChange={(v) => setValues({ ...values, [name]: v })} />
        ))}
        <TextField label={t("flows.sends_per_hour")} type="number" min={1} max={2000} value={perHour} onChange={(e) => setPerHour(e.target.value)} />
      </div>
      <Button type="submit" size="sm" disabled={!title.trim()}>
        {t("flows.save")}
      </Button>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </form>
  );
}

function People({ flow, overview, onChanged }: { flow: FlowDetail; overview: FlowsOverview; onChanged: () => Promise<void> }) {
  const t = useXT();
  const [employee, setEmployee] = useState("");
  const [name, setName] = useState("");
  const [language, setLanguage] = useState(flow.language);
  const [codes, setCodes] = useState<Record<string, { code: string; link: string | null }>>({});
  const [msg, setMsg] = useState<Msg>(null);
  const fail = (err: unknown) => setMsg({ kind: "error", text: errorText(t, err) });
  const free = overview.employees.filter((e) => !flow.people.some((p) => p.userId === e.id));
  const add = (person: { name?: string; userId?: string }) => {
    setMsg(null);
    void xenaxio.flows
      .addPerson(flow.id, { ...person, language })
      .then(async () => {
        setEmployee("");
        setName("");
        await onChanged();
      })
      .catch(fail);
  };
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{t("flows.people")}</h3>
      <p className="text-xs text-muted-foreground">{t("flows.people_hint")}</p>
      {flow.people.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {flow.people.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="block">
                  {p.name}
                  {p.userId ? <span className="text-xs text-muted-foreground"> · {t("flows.person_employee")}</span> : null}
                </span>
                <span className="block text-xs text-muted-foreground">{p.linked ? t("flows.person_linked") : t("flows.person_not_linked")}</span>
                {codes[p.id] && (
                  <span className="block text-xs">
                    {t("flows.person_code_text", { code: codes[p.id]!.code })}
                    {codes[p.id]!.link ? (
                      <>
                        {" "}
                        <a className="break-all underline" href={codes[p.id]!.link!} target="_blank" rel="noreferrer">
                          {codes[p.id]!.link}
                        </a>
                      </>
                    ) : (
                      <> {t("flows.person_code_no_bot")}</>
                    )}
                  </span>
                )}
              </span>
              <span className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => void xenaxio.flows.personCode(flow.id, p.id).then((c) => setCodes({ ...codes, [p.id]: c })).catch(fail)}>
                  {t("flows.person_code")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void xenaxio.flows.removePerson(flow.id, p.id).then(onChanged).catch(fail)}>
                  {t("flows.person_remove")}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem]">
        <Field label={t("flows.person_from_team")} htmlFor={`person-employee-${flow.id}`}>
          <div className="flex gap-2">
            <select id={`person-employee-${flow.id}`} className={select} value={employee} onChange={(e) => setEmployee(e.target.value)}>
              <option value="">{t("flows.choose")}</option>
              {free.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {e.email}
                </option>
              ))}
            </select>
            <Button size="sm" type="button" disabled={!employee} onClick={() => add({ userId: employee })}>
              {t("flows.person_add")}
            </Button>
          </div>
        </Field>
        <Field label={t("flows.person_only_telegram")} htmlFor={`person-name-${flow.id}`}>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) add({ name: name.trim() });
            }}
          >
            <Input id={`person-name-${flow.id}`} value={name} placeholder={t("flows.person_name")} onChange={(e) => setName(e.target.value)} />
            <Button size="sm" type="submit" disabled={!name.trim()}>
              {t("flows.person_add")}
            </Button>
          </form>
        </Field>
        <Field label={t("flows.person_language")} htmlFor={`person-language-${flow.id}`}>
          <LanguageSelect id={`person-language-${flow.id}`} value={language} onChange={setLanguage} />
        </Field>
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </div>
  );
}

function Owners({ flow, overview, onSaved }: { flow: FlowDetail; overview: FlowsOverview; onSaved: (f: FlowDetail) => void }) {
  const t = useXT();
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const fail = (err: unknown) => setMsg({ kind: "error", text: errorText(t, err) });
  const free = overview.employees.filter((e) => !flow.owners.some((o) => o.id === e.id));
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{t("flows.owners")}</h3>
      <p className="text-xs text-muted-foreground">{t("flows.owners_hint")}</p>
      <ul className="divide-y divide-border text-sm">
        {flow.owners.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="min-w-0 truncate">
              {o.name} <span className="text-xs text-muted-foreground">· {o.email}</span>
            </span>
            <Button size="sm" variant="ghost" disabled={flow.owners.length < 2} onClick={() => void xenaxio.flows.removeOwner(flow.id, o.id).then(onSaved).catch(fail)}>
              {t("flows.owner_remove")}
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <select aria-label={t("flows.owner_add")} className={select} value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">{t("flows.choose")}</option>
          {free.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} · {e.email}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={!userId}
          onClick={() =>
            void xenaxio.flows
              .addOwner(flow.id, userId)
              .then((f) => {
                setUserId("");
                onSaved(f);
              })
              .catch(fail)
          }
        >
          {t("flows.owner_add")}
        </Button>
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </div>
  );
}

/** Stage E2 (B1): where the flow's outside APIs are and their keys (written here, never shown again). */
function Connection({ flow, conn, onSaved }: { flow: FlowDetail; conn: FlowConnection; onSaved: (f: FlowDetail) => void }) {
  const t = useXT();
  const locale = useLocale();
  const [baseUrl, setBaseUrl] = useState(conn.baseUrl ?? "");
  const [secret, setSecret] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Msg>(null);
  const fields: [string, string, string][] =
    conn.auth === "api_key"
      ? [["header", t("flows.conn_header"), "X-API-Key"], ["value", t("flows.conn_key"), ""]]
      : conn.auth === "basic"
        ? [["user", t("flows.conn_user"), ""], ["password", t("flows.conn_password"), ""]]
        : conn.auth === "bearer"
          ? [["token", t("flows.conn_token"), ""]]
          : [];
  const typed = Object.values(secret).some((v) => v.trim());
  const save = (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    xenaxio.flows
      .setConnection(flow.id, conn.name, { baseUrl: baseUrl.trim(), ...(typed ? { secret } : {}) })
      .then((f) => {
        setSecret({});
        setMsg({ kind: "success", text: t("flows.saved") });
        onSaved(f);
      })
      .catch((err) => setMsg({ kind: "error", text: errorText(t, err) }));
  };
  return (
    <form onSubmit={save} className="space-y-2 rounded-md border border-border p-3" noValidate>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{pick(conn.label, locale, conn.name)}</span>
        <span className="text-xs text-muted-foreground">{conn.baseUrl ? (conn.hasSecret || conn.auth === "none" ? t("flows.conn_ready") : t("flows.conn_no_key")) : t("flows.conn_not_set")}</span>
      </div>
      {conn.note && <p className="text-xs text-muted-foreground">{pick(conn.note, locale)}</p>}
      {conn.kind === "mcp" && <p className="text-xs text-muted-foreground">{t("flows.conn_mcp")}</p>}
      <TextField label={t("flows.conn_url")} hint={t("flows.conn_hosts", { hosts: conn.hosts.join(", ") })} value={baseUrl} placeholder={`https://${conn.hosts[0]?.replace(/^\*\./, "") ?? ""}`} onChange={(e) => setBaseUrl(e.target.value)} />
      {conn.auth === "oauth2" ? (
        <Notice kind="info">{t("flows.conn_oauth_later")}</Notice>
      ) : (
        fields.map(([key, label, placeholder]) => (
          <TextField
            key={key}
            label={label}
            type={key === "header" || key === "user" ? "text" : "password"}
            autoComplete="off"
            placeholder={conn.hasSecret && key !== "header" ? t("flows.conn_key_kept") : placeholder}
            value={secret[key] ?? ""}
            onChange={(e) => setSecret({ ...secret, [key]: e.target.value })}
          />
        ))
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!baseUrl.trim() || conn.auth === "oauth2"}>
          {t("flows.save")}
        </Button>
        {conn.baseUrl && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              void xenaxio.flows
                .removeConnection(flow.id, conn.name)
                .then((f) => {
                  setBaseUrl("");
                  onSaved(f);
                })
                .catch((err) => setMsg({ kind: "error", text: errorText(t, err) }))
            }
          >
            {t("flows.conn_remove")}
          </Button>
        )}
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </form>
  );
}

function Telegram({ flow, onChanged }: { flow: FlowDetail; onChanged: () => Promise<void> }) {
  const t = useXT();
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const run = async (action: () => Promise<string>) => {
    setMsg(null);
    try {
      setMsg({ kind: "success", text: await action() });
      setToken("");
      await onChanged();
    } catch (err) {
      setMsg({ kind: "error", text: errorText(t, err) });
    }
  };
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{t("flows.telegram")}</h3>
      {flow.hasBot ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>@{flow.botName}</span>
          <Button size="sm" variant="outline" onClick={() => void run(async () => (await xenaxio.flows.disconnectTelegram(flow.id), t("flows.disconnected")))}>
            {t("flows.disconnect")}
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => t("flows.connected", { name: (await xenaxio.flows.connectTelegram(flow.id, token)).botName }));
          }}
        >
          <div className="min-w-0 flex-1">
            <TextField label={t("flows.telegram_token")} hint={t("flows.telegram_hint")} value={token} autoComplete="off" onChange={(e) => setToken(e.target.value)} />
          </div>
          <Button type="submit" size="sm" disabled={token.trim().length < 20}>
            {t("flows.connect")}
          </Button>
        </form>
      )}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </div>
  );
}

function Directory({ flow, name }: { flow: FlowDetail; name: string }) {
  const t = useXT();
  const locale = useLocale();
  const def = flow.directories[name]!;
  const fields = Object.keys(def.fields);
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [csv, setCsv] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const load = async () => setRows((await xenaxio.flows.directory(flow.id, name)).rows);
  const show = (v: unknown): string =>
    v === null || v === undefined ? "" : Array.isArray(v) ? v.map(show).join("; ") : typeof v === "object" ? String((v as { name?: string; id?: string }).name ?? (v as { id?: string }).id ?? "") : String(v);
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{pick(def.label, locale, name)}</span>
        <Button size="sm" variant="ghost" onClick={() => (rows ? setRows(null) : void load().catch((err) => setMsg({ kind: "error", text: errorText(t, err) })))}>
          {rows ? t("flows.directory_hide") : t("flows.directory_show")}
        </Button>
      </div>
      {rows && (
        <div className="overflow-x-auto">
          <p className="text-xs text-muted-foreground">{t("flows.directory_rows", { count: rows.length })}</p>
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                {fields.map((f) => (
                  <th key={f} className="px-1 py-1 font-medium">
                    {f}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={String(r._id ?? i)} className="border-t border-border">
                  {fields.map((f) => (
                    <td key={f} className="px-1 py-1">
                      {show(r[f])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          xenaxio.flows
            .importDirectory(flow.id, name, csv)
            .then(async (r) => {
              setMsg({ kind: "success", text: t("flows.directory_imported", { count: r.rows }) });
              setCsv("");
              if (rows) await load();
            })
            .catch((err) => setMsg({ kind: "error", text: errorText(t, err) }));
        }}
      >
        <Field label={t("flows.directory_import")} hint={t("flows.directory_import_hint", { fields: fields.join(", ") })} htmlFor={`csv-${flow.id}-${name}`}>
          <textarea id={`csv-${flow.id}-${name}`} className="min-h-24 w-full rounded-md border border-input bg-background p-2 font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={fields.join(";")} />
        </Field>
        <Button type="submit" size="sm" variant="outline" disabled={!csv.trim()}>
          {t("flows.directory_save")}
        </Button>
      </form>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </div>
  );
}

/** A value of a run's card, short: lists and objects as readable text. */
function cardValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(cardValue).join("; ");
  const o = v as Record<string, unknown>;
  if (typeof o.name === "string" && typeof o.id === "string") return o.name;
  return Object.entries(o)
    .filter(([k]) => k !== "id" && k !== "file" && k !== "files")
    .map(([k, x]) => `${k}: ${cardValue(x)}`)
    .join(", ");
}

function CardFields({ card }: { card: Record<string, unknown> }) {
  const entries = Object.entries(card);
  if (entries.length === 0) return null;
  return (
    <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 gap-y-1 text-xs">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words whitespace-pre-wrap">{cardValue(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Stage E2, part C: the card of a run — fields, documents, branches and journal. */
function RunCard({ run, status }: { run: FlowRunDetail; status: (r: FlowRunSummary) => string }) {
  const t = useXT();
  const locale = useLocale();
  return (
    <div className="space-y-3 rounded-md bg-muted/50 p-3 text-sm">
      <p className="font-medium">
        №{run.number} · {status(run)}
      </p>
      <CardFields card={run.card} />
      {run.files.length > 0 && (
        <div>
          <p className="text-xs font-medium">{t("flows.documents")}</p>
          <ul className="text-xs">
            {run.files.map((f) => (
              <li key={f.n}>
                <a className="underline" href={withBasePath(xenaxio.flows.fileUrl(run.id, f.n))} target="_blank" rel="noopener noreferrer">
                  {f.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {run.branches.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium">{t("flows.branches")}</p>
          {run.branches.map((b) => (
            <div key={b.id} className="space-y-1 rounded border border-border p-2">
              <p className="text-xs font-medium">
                №{b.number} · {status(b)}
              </p>
              <CardFields card={b.card} />
            </div>
          ))}
        </div>
      )}
      <p className="text-xs font-medium">{t("flows.journal")}</p>
      <ol className="space-y-1 text-xs">
        {run.journal.map((e, i) => (
          <li key={i} className="grid grid-cols-[auto_1fr] gap-2">
            <span className="text-muted-foreground">{new Date(e.at).toLocaleString(locale)}</span>
            <span>
              {t(`flows.actor_${e.actor.kind}`)} · {e.what}
              {e.step ? ` · ${e.step}` : ""}
              {e.detail ? <span className="text-muted-foreground"> {JSON.stringify(e.detail).slice(0, 160)}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Runs of a flow: tabs by step, "only mine", and the card of the run opened. */
function Runs({ flowId, openRunId }: { flowId: string; openRunId?: string | null }) {
  const t = useXT();
  const locale = useLocale();
  const [mine, setMine] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [runs, setRuns] = useState<FlowRunSummary[] | null>(null);
  const [open, setOpen] = useState<FlowRunDetail | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const openRun = useCallback(
    (id: string) =>
      void xenaxio.flows
        .run(id)
        .then(setOpen)
        .catch((err) => setMsg({ kind: "error", text: errorText(t, err) })),
    [t],
  );
  useEffect(() => {
    xenaxio.flows
      .runs(flowId, mine)
      .then((r) => setRuns(r.runs))
      .catch((err) => setMsg({ kind: "error", text: errorText(t, err) }));
  }, [flowId, mine, t]);
  useEffect(() => {
    if (openRunId) openRun(openRunId);
  }, [openRunId, openRun]);
  const status = (r: FlowRunSummary) => `${t(`flows.run_status_${r.status}`)}${r.result && r.status === "done" ? ` · ${r.result}` : ""}${r.waiting ? ` · ${t("flows.run_waiting", { what: r.waiting })}` : ""}`;
  const when = (iso: string) => new Date(iso).toLocaleString(locale);
  const steps = [...new Set((runs ?? []).filter((r) => r.status === "running" || r.status === "waiting").map((r) => r.step))];
  const shown = (runs ?? []).filter((r) => !step || r.step === step);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t("flows.runs")}</h3>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          {t("flows.runs_mine")}
        </label>
      </div>
      {steps.length > 1 && (
        <div role="tablist" className="flex flex-wrap gap-1">
          {[null, ...steps].map((s) => (
            <Button key={s ?? "all"} role="tab" aria-selected={step === s} size="sm" variant={step === s ? "outline" : "ghost"} onClick={() => setStep(s)}>
              {s ?? t("flows.runs_all_steps")}
            </Button>
          ))}
        </div>
      )}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {runs === null ? (
        <Spinner label={t("flows.runs")} />
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("flows.runs_none")}</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {shown.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="font-medium">№{r.number}</span> · {r.initiator ?? "—"} · <span className="text-muted-foreground">{when(r.createdAt)}</span>
                {r.waitingForMe && <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">{t("flows.waiting_for_me")}</span>}
                <span className="block text-xs text-muted-foreground">
                  {status(r)} · {t("flows.run_updated", { when: when(r.updatedAt) })}
                </span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => openRun(r.id)}>
                {t("flows.run_open")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {open && <RunCard run={open} status={status} />}
    </div>
  );
}

/** Stage E2, part C: decisions and confirmations waiting for me, from every flow, with the same buttons as in Telegram. */
function Waiting({ onOpenRun }: { onOpenRun: (flowId: string, runId: string) => void }) {
  const t = useXT();
  const [tasks, setTasks] = useState<FlowTask[] | null>(null);
  const [comment, setComment] = useState<{ key: string; option: string; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(async () => {
    try {
      const r = await xenaxio.flows.tasks();
      setTasks(r.tasks);
      setFlowsWaiting(r.count);
    } catch (err) {
      setMsg({ kind: "error", text: errorText(t, err) });
    }
  }, [t]);
  useEffect(() => {
    void load();
  }, [load]);
  const answer = async (task: FlowTask, option: string, text?: string) => {
    setBusy(task.key);
    setMsg(null);
    try {
      await xenaxio.flows.answerTask(task.key, option, text);
      setComment(null);
      setMsg({ kind: "success", text: t("flows.task_answered", { number: task.runNumber }) });
    } catch (err) {
      if (err instanceof XenaxioApiError && err.code === "flow_task_closed") setMsg({ kind: "info", text: t("flows.task_closed") });
      else setMsg({ kind: "error", text: errorText(t, err) });
    } finally {
      setBusy(null);
      await load();
    }
  };
  if (tasks === null && !msg) return null;
  return (
    <section className="space-y-3" aria-labelledby="flows-waiting">
      <h2 id="flows-waiting" className="text-lg font-semibold">
        {t("flows.waiting")}
        {tasks && tasks.length > 0 ? ` (${tasks.length})` : ""}
      </h2>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {tasks?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("flows.waiting_none")}</p>
      ) : (
        tasks?.map((task) => (
          <article key={task.key} className="space-y-2 rounded-lg border border-border bg-card p-4 text-sm">
            <p className="text-xs text-muted-foreground">
              {task.flowTitle} · №{task.runNumber} · {t(`flows.task_kind_${task.kind}`)}
            </p>
            <p className="font-medium">{task.title}</p>
            {task.text && <p className="whitespace-pre-wrap">{task.text}</p>}
            <CardFields card={task.show} />
            {comment?.key === task.key ? (
              <form
                className="space-y-2"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  if (comment.text.trim()) void answer(task, comment.option, comment.text.trim());
                }}
              >
                <label className="block text-xs font-medium" htmlFor={`comment-${task.key}`}>
                  {t("flows.task_comment")}
                </label>
                <textarea
                  id={`comment-${task.key}`}
                  className="min-h-20 w-full rounded-md border border-input bg-background p-2 text-sm"
                  value={comment.text}
                  maxLength={4000}
                  onChange={(e) => setComment({ ...comment, text: e.target.value })}
                />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={busy === task.key || !comment.text.trim()}>
                    {t("flows.task_send")}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setComment(null)}>
                    {t("flows.cancel")}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap gap-2">
                {task.options.map((o) => (
                  <Button
                    key={o.id}
                    size="sm"
                    variant={o.comment ? "outline" : "default"}
                    disabled={busy === task.key}
                    onClick={() => (o.comment ? setComment({ key: task.key, option: o.id, text: "" }) : void answer(task, o.id))}
                  >
                    {o.label}
                  </Button>
                ))}
                <Button size="sm" variant="ghost" onClick={() => onOpenRun(task.flowId, task.runId)}>
                  {t("flows.run_open")}
                </Button>
              </div>
            )}
          </article>
        ))
      )}
    </section>
  );
}

/** Stage E2, part C: a flow I work in without owning it — its runs, not its settings. */
function WorkingItem({ flow, openRunId }: { flow: { id: string; title: string; status: "active" | "paused" }; openRunId: string | null }) {
  const t = useXT();
  const [open, setOpen] = useState(!!openRunId);
  useEffect(() => {
    if (openRunId) setOpen(true);
  }, [openRunId]);
  return (
    <details id={`flow-${flow.id}`} className="rounded-lg border border-border bg-card p-4" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{flow.title}</span>
        <span className={flow.status === "active" ? "text-sm text-green-700 dark:text-green-400" : "text-sm text-muted-foreground"}>{t(`flows.status_${flow.status}`)}</span>
      </summary>
      {open && (
        <div className="mt-3">
          <Runs flowId={flow.id} openRunId={openRunId} />
        </div>
      )}
    </details>
  );
}

/** One flow, loaded when opened. */
function FlowPanel({ id, overview, onListChanged, openRunId }: { id: string; overview: FlowsOverview; onListChanged: () => Promise<void>; openRunId: string | null }) {
  const t = useXT();
  const [flow, setFlow] = useState<FlowDetail | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(async () => {
    try {
      setFlow(await xenaxio.flows.flow(id));
    } catch (err) {
      setMsg({ kind: "error", text: errorText(t, err) });
    }
  }, [id, t]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!flow) return msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : <Spinner label={t("flows.title")} />;
  const saved = (f: FlowDetail) => {
    setFlow(f);
    void onListChanged();
  };
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ kind: "success", text: ok });
      await load();
      await onListChanged();
    } catch (err) {
      setMsg({ kind: "error", text: errorText(t, err) });
    }
  };
  return (
    <div className="mt-4 space-y-6">
      <div className="flex flex-wrap gap-2">
        {flow.status === "active" ? (
          <Button size="sm" variant="outline" onClick={() => void act(() => xenaxio.flows.update(flow.id, { status: "paused" }), t("flows.paused"))}>
            {t("flows.pause")}
          </Button>
        ) : (
          <Button size="sm" onClick={() => void act(() => xenaxio.flows.update(flow.id, { status: "active" }), t("flows.started"))}>
            {t("flows.start")}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (window.confirm(t("flows.remove_confirm", { name: flow.title }))) void act(() => xenaxio.flows.remove(flow.id), t("flows.removed"));
          }}
        >
          {t("flows.remove")}
        </Button>
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <Settings key={`s-${flow.people.length}`} flow={flow} overview={overview} onSaved={saved} />
      <People flow={flow} overview={overview} onChanged={load} />
      <Telegram flow={flow} onChanged={load} />
      {Object.keys(flow.directories).length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">{t("flows.directories")}</h3>
          {Object.keys(flow.directories).map((d) => (
            <Directory key={d} flow={flow} name={d} />
          ))}
        </div>
      )}
      {flow.connections.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">{t("flows.connections")}</h3>
          <p className="text-xs text-muted-foreground">{t("flows.connections_hint")}</p>
          {flow.connections.map((c) => (
            <Connection key={c.name} flow={flow} conn={c} onSaved={saved} />
          ))}
        </div>
      )}
      <Owners flow={flow} overview={overview} onSaved={saved} />
      <Runs flowId={flow.id} openRunId={openRunId} />
    </div>
  );
}

/** Stage E2: whether flows may send letters in my name from my own mailbox (and read the replies to them). */
function SendAs() {
  const t = useXT();
  const [on, setOn] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => {
    xenaxio.flows
      .sendAs()
      .then((s) => setOn(s.on))
      .catch(() => setOn(false));
  }, []);
  if (on === null) return null;
  const change = (next: boolean) => {
    setMsg(null);
    xenaxio.flows
      .setSendAs(next)
      .then((s) => {
        setOn(s.on);
        setMsg({ kind: "success", text: s.on ? t("flows.send_as_on") : t("flows.send_as_off") });
      })
      .catch((err) => setMsg({ kind: "error", text: errorText(t, err) }));
  };
  return (
    <section className="space-y-2 rounded-lg border border-border p-4">
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={on} onChange={(e) => change(e.target.checked)} />
        <span>
          <span className="block font-medium">{t("flows.send_as")}</span>
          <span className="block text-xs text-muted-foreground">{t("flows.send_as_hint")}</span>
        </span>
      </label>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </section>
  );
}

function FlowItem({
  inst,
  overview,
  initiallyOpen,
  onListChanged,
  openRunId,
}: {
  inst: FlowInstallation;
  overview: FlowsOverview;
  initiallyOpen: boolean;
  onListChanged: () => Promise<void>;
  openRunId: string | null;
}) {
  const t = useXT();
  const [open, setOpen] = useState(initiallyOpen);
  useEffect(() => {
    if (initiallyOpen) setOpen(true);
  }, [initiallyOpen]);
  return (
    <details id={`flow-${inst.id}`} className="rounded-lg border border-border bg-card p-4" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="block font-medium">{inst.title}</span>
          <span className="block text-xs text-muted-foreground">{inst.owners.map((o) => o.name).join(", ") || t("flows.owner_none")}</span>
        </span>
        <span className={inst.status === "active" ? "text-sm text-green-700 dark:text-green-400" : "text-sm text-muted-foreground"}>{t(`flows.status_${inst.status}`)}</span>
      </summary>
      {open && <FlowPanel id={inst.id} overview={overview} onListChanged={onListChanged} openRunId={openRunId} />}
    </details>
  );
}

function NewFlow({ overview, onCreated, onCancel }: { overview: FlowsOverview; onCreated: (f: FlowDetail) => void; onCancel: () => void }) {
  const t = useXT();
  const locale = useLocale();
  const [flow, setFlow] = useState(overview.templates[0]?.flow ?? "");
  const tpl = overview.templates.find((x) => x.flow === flow);
  const [language, setLanguage] = useState(FLOW_LANGUAGES.includes(locale) ? locale : "en");
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const create = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      onCreated(await xenaxio.flows.install(flow, language, title.trim() || undefined));
    } catch (err) {
      setMsg({ kind: "error", text: errorText(t, err) });
    }
  };
  if (overview.templates.length === 0) return <Notice kind="info">{t("flows.templates_none")}</Notice>;
  return (
    <form onSubmit={create} className="space-y-4 rounded-lg border border-border bg-card p-4">
      <h2 className="text-lg font-semibold">{t("flows.new")}</h2>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("flows.template")}</legend>
        {overview.templates.map((x) => (
          <label key={x.flow} className={cn("flex cursor-pointer gap-3 rounded-md border p-3", flow === x.flow ? "border-primary" : "border-border")}>
            <input type="radio" name="flow-template" className="mt-1" checked={flow === x.flow} onChange={() => setFlow(x.flow)} />
            <span className="min-w-0">
              <span className="block font-medium">{pick(x.title, locale, x.flow)}</span>
              <span className="block text-sm text-muted-foreground">{pick(x.description, locale)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={t("flows.flow_title")} value={title} maxLength={120} placeholder={tpl ? pick(tpl.title, language, tpl.flow) : ""} onChange={(e) => setTitle(e.target.value)} />
        <Field label={t("flows.language")} hint={t("flows.language_hint")} htmlFor="new-flow-language">
          <LanguageSelect id="new-flow-language" value={language} onChange={setLanguage} />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!flow}>
          {t("flows.create")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t("flows.cancel")}
        </Button>
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </form>
  );
}

/** The section inside the app shell (exported for tests). */
export function FlowsSection() {
  const t = useXT();
  const [all, setAll] = useState(false);
  const [data, setData] = useState<FlowsOverview | null>(null);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const reload = useCallback(async () => {
    try {
      setData(await xenaxio.flows.overview(all));
      setFlowsNavEnabled(true);
    } catch (err) {
      if (err instanceof XenaxioApiError && err.code === "flows_disabled") {
        setFlowsNavEnabled(false);
        setData({ enabled: false, admin: false, templates: [], installations: [], employees: [], mailboxes: [] });
      } else setMsg({ kind: "error", text: errorText(t, err) });
    }
  }, [all, t]);
  useEffect(() => {
    void reload();
  }, [reload]);
  // The admin's page links here with ?flow=<id>: open that one.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("flow");
    if (id) {
      setOpenId(id);
      setAll(true);
    }
  }, []);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">{t("flows.title")}</h1>
          {data?.enabled && !creating && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-4 w-4" />
              {t("flows.new")}
            </Button>
          )}
        </div>
        {!data ? (
          msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : <Spinner label={t("flows.title")} />
        ) : !data.enabled ? (
          <Notice kind="info">{t("flows.disabled")}</Notice>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t("flows.intro")}</p>
            {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
            <Waiting
              onOpenRun={(flowId, runId) => {
                setOpenId(flowId);
                setOpenRun(runId);
                window.setTimeout(() => document.getElementById(`flow-${flowId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
              }}
            />
            <SendAs />
            {creating && (
              <NewFlow
                overview={data}
                onCancel={() => setCreating(false)}
                onCreated={(f) => {
                  setCreating(false);
                  setOpenId(f.id);
                  setMsg({ kind: "success", text: t("flows.created", { name: f.title }) });
                  void reload();
                }}
              />
            )}
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{all ? t("flows.all_flows") : t("flows.installations")}</h2>
                {data.admin && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4" checked={all} onChange={(e) => setAll(e.target.checked)} />
                    {t("flows.show_all")}
                  </label>
                )}
              </div>
              {data.installations.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("flows.none")}</p>
              ) : (
                data.installations.map((inst) => (
                  <FlowItem key={inst.id} inst={inst} overview={data} initiallyOpen={inst.id === openId} openRunId={inst.id === openId ? openRun : null} onListChanged={reload} />
                ))
              )}
            </section>
            {(data.working ?? []).length > 0 && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">{t("flows.working")}</h2>
                {data.working!.map((w) => (
                  <WorkingItem key={w.id} flow={w} openRunId={w.id === openId ? openRun : null} />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function FlowsApp() {
  const t = useXT();
  useDocumentTitle(t("flows.title"));
  const { logout, checkAuth } = useAuthStore();
  const { quota, isPushConnected } = useEmailStore();
  const { showAppsModal, inlineApp, loadedApps, handleManageApps, handleInlineApp, closeInlineApp, closeAppsModal } = useSidebarApps();
  const [signedIn, setSignedIn] = useState(false);
  const isMobile = useIsMobile();
  const isEmbedded = useIsEmbedded();
  const mvShell = useMountainViewShell(isEmbedded);

  useEffect(() => {
    let cancelled = false;
    xenaxio
      .me()
      .then(() => !cancelled && setSignedIn(true))
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof XenaxioApiError && err.status === 401) {
          saveRedirectAfterLogin();
          redirectToLogin();
        } else setSignedIn(true);
      });
    if (!useAuthStore.getState().isAuthenticated) void checkAuth().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [checkAuth]);

  if (!signedIn) return null;

  return (
    <div data-app-shell="" className={cn("flex flex-col overflow-hidden pt-[env(safe-area-inset-top)]", mvShell ? "bg-[var(--mv-canvas)]" : "bg-background", isEmbedded ? "h-full" : "h-dvh")}>
      {mvShell && <MvTopBar showMenuButton={false} onManageApps={handleManageApps} onInlineApp={handleInlineApp} onCloseInlineApp={closeInlineApp} activeAppId={inlineApp?.id ?? null} />}
      <div data-mv-card={mvShell ? "" : undefined} className={cn("flex min-h-0 flex-1 overflow-hidden", mvShell && "mx-4 mb-4 bg-background")}>
        {!isMobile && !isEmbedded && !mvShell && (
          <div data-app-rail="" className="flex w-14 flex-shrink-0 flex-col bg-secondary" style={{ borderRight: "1px solid rgba(128, 128, 128, 0.3)" }}>
            <NavigationRail collapsed quota={quota} isPushConnected={isPushConnected} onLogout={logout} onManageApps={handleManageApps} onInlineApp={handleInlineApp} onCloseInlineApp={closeInlineApp} activeAppId={inlineApp?.id ?? null} />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          {inlineApp && <InlineAppView apps={loadedApps} activeAppId={inlineApp.id} onClose={closeInlineApp} />}
          <div className={cn("flex min-h-0 flex-1", inlineApp && "hidden")}>
            <FlowsSection />
          </div>
          {isMobile && !isEmbedded && <NavigationRail orientation="horizontal" onManageApps={handleManageApps} onInlineApp={handleInlineApp} onCloseInlineApp={closeInlineApp} activeAppId={inlineApp?.id ?? null} />}
        </div>
      </div>
      <SidebarAppsModal isOpen={showAppsModal} onClose={closeAppsModal} />
    </div>
  );
}
