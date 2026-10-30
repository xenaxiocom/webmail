"use client";

// Step F1: Xenaxio Agent Flows for the company's admin. Install a template,
// set its parameters, connect a Telegram bot, import directories, link people
// with one-time codes, and follow runs with their journal.
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Notice, Spinner, TextField } from "@/components/xenaxio/ui";
import { WorkspaceShell } from "@/components/xenaxio/workspace-shell";
import {
  errorText,
  type FlowInstallation,
  type FlowJournalEntry,
  type FlowParamDef,
  type FlowPerson,
  type FlowRunSummary,
  type FlowsOverview,
  type FlowTexts,
  xenaxio,
} from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";

const select = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
const LANGUAGES = ["de", "en", "uk", "ru"];
type Msg = { kind: "error" | "success"; text: string } | null;

function pick(t: FlowTexts | undefined, locale: string, fallback = ""): string {
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

function ParamInput({ name, def, value, onChange, overview }: { name: string; def: FlowParamDef; value: string; onChange: (v: string) => void; overview: FlowsOverview }) {
  const t = useXT();
  const locale = useLocale();
  const id = `param-${name}`;
  const label = `${pick(def.label, locale, name)}${def.required ? " *" : ""}`;
  const hint = def.note ? pick(def.note, locale) : def.default !== undefined && def.default !== null ? String(def.default) : undefined;
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
  if (def.type === "person") control = options(overview.people.map((p) => [p.id, p.name]));
  else if (def.type === "mailbox") control = options(overview.mailboxes.map((m) => [m.id, m.email]));
  else if (def.type === "enum") control = options((def.values ?? []).map((v) => [v, v]));
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

function Settings({ inst, overview, onSaved }: { inst: FlowInstallation; overview: FlowsOverview; onSaved: () => Promise<void> }) {
  const t = useXT();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(inst.paramDefs).map(([n, d]) => [n, formValue(d, inst.params[n])])));
  const [language, setLanguage] = useState(inst.language);
  const [perHour, setPerHour] = useState(String(inst.sendsPerHour));
  const [msg, setMsg] = useState<Msg>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const params = Object.fromEntries(Object.entries(inst.paramDefs).map(([n, d]) => [n, apiValue(d, values[n] ?? "")]));
      await xenaxio.flows.update(inst.id, { params, language, sendsPerHour: Number(perHour) });
      setMsg({ kind: "success", text: t("flows.saved") });
      await onSaved();
    } catch (err) {
      setMsg({ kind: "error", text: errorText(t, err) });
    }
  };
  return (
    <form onSubmit={save} className="space-y-3" noValidate>
      <h3 className="text-sm font-medium">{t("flows.settings")}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(inst.paramDefs).map(([name, def]) => (
          <ParamInput key={name} name={name} def={def} overview={overview} value={values[name] ?? ""} onChange={(v) => setValues({ ...values, [name]: v })} />
        ))}
        <Field label={t("flows.language")} htmlFor={`lang-${inst.id}`}>
          <select id={`lang-${inst.id}`} className={select} value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <TextField label={t("flows.sends_per_hour")} type="number" min={1} max={2000} value={perHour} onChange={(e) => setPerHour(e.target.value)} />
      </div>
      <Button type="submit" size="sm">
        {t("flows.save")}
      </Button>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </form>
  );
}

function Telegram({ inst, onSaved }: { inst: FlowInstallation; onSaved: () => Promise<void> }) {
  const t = useXT();
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const run = async (action: () => Promise<string>) => {
    setMsg(null);
    try {
      setMsg({ kind: "success", text: await action() });
      setToken("");
      await onSaved();
    } catch (err) {
      setMsg({ kind: "error", text: errorText(t, err) });
    }
  };
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{t("flows.telegram")}</h3>
      {inst.hasBot ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>@{inst.botName}</span>
          <Button size="sm" variant="outline" onClick={() => void run(async () => (await xenaxio.flows.disconnectTelegram(inst.id), t("flows.disconnected")))}>
            {t("flows.disconnect")}
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => t("flows.connected", { name: (await xenaxio.flows.connectTelegram(inst.id, token)).botName }));
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

function Directory({ inst, name }: { inst: FlowInstallation; name: string }) {
  const t = useXT();
  const locale = useLocale();
  const def = inst.directories[name]!;
  const fields = Object.keys(def.fields);
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [csv, setCsv] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const load = async () => setRows((await xenaxio.flows.directory(inst.id, name)).rows);
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
            .importDirectory(inst.id, name, csv)
            .then(async (r) => {
              setMsg({ kind: "success", text: t("flows.directory_imported", { count: r.rows }) });
              setCsv("");
              if (rows) await load();
            })
            .catch((err) => setMsg({ kind: "error", text: errorText(t, err) }));
        }}
      >
        <Field label={t("flows.directory_import")} hint={t("flows.directory_import_hint", { fields: fields.join(", ") })} htmlFor={`csv-${inst.id}-${name}`}>
          <textarea id={`csv-${inst.id}-${name}`} className="min-h-24 w-full rounded-md border border-input bg-background p-2 font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={fields.join(";")} />
        </Field>
        <Button type="submit" size="sm" variant="outline" disabled={!csv.trim()}>
          {t("flows.directory_save")}
        </Button>
      </form>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </div>
  );
}

function Runs({ inst }: { inst: FlowInstallation }) {
  const t = useXT();
  const locale = useLocale();
  const [runs, setRuns] = useState<FlowRunSummary[] | null>(null);
  const [open, setOpen] = useState<(FlowRunSummary & { branches: FlowRunSummary[]; journal: FlowJournalEntry[] }) | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => {
    xenaxio.flows
      .runs(inst.id)
      .then((r) => setRuns(r.runs))
      .catch((err) => setMsg({ kind: "error", text: errorText(t, err) }));
  }, [inst.id, t]);
  const status = (r: FlowRunSummary) => `${t(`flows.run_status_${r.status}`)}${r.result && r.status === "done" ? ` · ${r.result}` : ""}${r.waiting ? ` · ${t("flows.run_waiting", { what: r.waiting })}` : ""}`;
  const when = (iso: string) => new Date(iso).toLocaleString(locale);
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{t("flows.runs")}</h3>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {runs === null ? (
        <Spinner label={t("flows.runs")} />
      ) : runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("flows.runs_none")}</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {runs.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="font-medium">№{r.number}</span> · {r.initiator ?? "—"} · <span className="text-muted-foreground">{when(r.createdAt)}</span>
                <span className="block text-xs text-muted-foreground">{status(r)}</span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => void xenaxio.flows.run(r.id).then(setOpen).catch((err) => setMsg({ kind: "error", text: errorText(t, err) }))}>
                {t("flows.run_open")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div className="space-y-2 rounded-md bg-muted/50 p-3 text-sm">
          <p className="font-medium">
            №{open.number} · {status(open)}
          </p>
          {open.branches.length > 0 && (
            <div>
              <p className="text-xs font-medium">{t("flows.branches")}</p>
              <ul className="text-xs">
                {open.branches.map((b) => (
                  <li key={b.id}>
                    №{b.number} · {status(b)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs font-medium">{t("flows.journal")}</p>
          <ol className="space-y-1 text-xs">
            {open.journal.map((e, i) => (
              <li key={i} className="grid grid-cols-[auto_1fr] gap-2">
                <span className="text-muted-foreground">{new Date(e.at).toLocaleTimeString(locale)}</span>
                <span>
                  {t(`flows.actor_${e.actor.kind}`)} · {e.what}
                  {e.step ? ` · ${e.step}` : ""}
                  {e.detail ? <span className="text-muted-foreground"> {JSON.stringify(e.detail).slice(0, 160)}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function Installation({ inst, overview, reload }: { inst: FlowInstallation; overview: FlowsOverview; reload: () => Promise<void> }) {
  const t = useXT();
  const locale = useLocale();
  const [msg, setMsg] = useState<Msg>(null);
  const title = pick(inst.title, locale, inst.flow);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ kind: "success", text: ok });
      await reload();
    } catch (err) {
      setMsg({ kind: "error", text: errorText(t, err) });
    }
  };
  return (
    <details className="rounded-lg border border-border bg-card p-4">
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{title}</span>
        <span className={inst.status === "active" ? "text-sm text-green-700 dark:text-green-400" : "text-sm text-muted-foreground"}>{t(`flows.status_${inst.status}`)}</span>
      </summary>
      <div className="mt-4 space-y-6">
        <div className="flex flex-wrap gap-2">
          {inst.status === "active" ? (
            <Button size="sm" variant="outline" onClick={() => void act(() => xenaxio.flows.update(inst.id, { status: "paused" }), t("flows.paused"))}>
              {t("flows.pause")}
            </Button>
          ) : (
            <Button size="sm" onClick={() => void act(() => xenaxio.flows.update(inst.id, { status: "active" }), t("flows.started"))}>
              {t("flows.start")}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (window.confirm(t("flows.remove_confirm", { name: title }))) void act(() => xenaxio.flows.remove(inst.id), t("flows.removed"));
            }}
          >
            {t("flows.remove")}
          </Button>
        </div>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <Settings inst={inst} overview={overview} onSaved={reload} />
        <Telegram inst={inst} onSaved={reload} />
        {Object.keys(inst.directories).length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">{t("flows.directories")}</h3>
            {Object.keys(inst.directories).map((d) => (
              <Directory key={d} inst={inst} name={d} />
            ))}
          </div>
        )}
        <Runs inst={inst} />
      </div>
    </details>
  );
}

function People({ people, reload }: { people: FlowPerson[]; reload: () => Promise<void> }) {
  const t = useXT();
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("");
  const [codes, setCodes] = useState<Record<string, { code: string; link: string | null }>>({});
  const [msg, setMsg] = useState<Msg>(null);
  const fail = (err: unknown) => setMsg({ kind: "error", text: errorText(t, err) });
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{t("flows.people")}</h2>
      <p className="text-sm text-muted-foreground">{t("flows.people_hint")}</p>
      <ul className="divide-y divide-border text-sm">
        {people.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="min-w-0">
              <span className="block">{p.name}</span>
              <span className="block text-xs text-muted-foreground">{p.telegramChatId ? t("flows.person_linked") : t("flows.person_not_linked")}</span>
              {codes[p.id] && (
                <span className="block text-xs">
                  {t("flows.person_code_text", { code: codes[p.id]!.code })}
                  {codes[p.id]!.link && (
                    <>
                      {" "}
                      <a className="underline" href={codes[p.id]!.link!} target="_blank" rel="noreferrer">
                        {codes[p.id]!.link}
                      </a>
                    </>
                  )}
                </span>
              )}
            </span>
            <span className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void xenaxio.flows.personCode(p.id).then((c) => setCodes({ ...codes, [p.id]: c })).catch(fail)}>
                {t("flows.person_code")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void xenaxio.flows.removePerson(p.id).then(reload).catch(fail)}>
                {t("flows.person_remove")}
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void xenaxio.flows
            .addPerson(name.trim(), language || null)
            .then(async () => {
              setName("");
              await reload();
            })
            .catch(fail);
        }}
      >
        <div className="min-w-0 flex-1">
          <TextField label={t("flows.person_name")} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <select aria-label={t("flows.language")} className={`${select} w-24`} value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="">—</option>
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={!name.trim()}>
          {t("flows.person_add")}
        </Button>
      </form>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </section>
  );
}

function FlowsView() {
  const t = useXT();
  const locale = useLocale();
  const [data, setData] = useState<FlowsOverview | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [language, setLanguage] = useState(LANGUAGES.includes(locale) ? locale : "en");
  const reload = useCallback(async () => {
    try {
      setData(await xenaxio.flows.overview());
    } catch (err) {
      setMsg({ kind: "error", text: errorText(t, err) });
    }
  }, [t]);
  useEffect(() => {
    void reload();
  }, [reload]);
  if (!data) return msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : <Spinner label={t("flows.title")} />;
  if (!data.enabled) return <Notice kind="info">{t("flows.disabled")}</Notice>;
  const install = async (flow: string, name: string) => {
    setMsg(null);
    try {
      await xenaxio.flows.install(flow, language);
      setMsg({ kind: "success", text: t("flows.installed", { name }) });
      await reload();
    } catch (err) {
      setMsg({ kind: "error", text: errorText(t, err) });
    }
  };
  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">{t("flows.intro")}</p>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("flows.installations")}</h2>
        {data.installations.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("flows.none")}</p>
        ) : (
          data.installations.map((inst) => <Installation key={inst.id} inst={inst} overview={data} reload={reload} />)
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("flows.templates")}</h2>
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="flow-language">{t("flows.language")}</label>
          <select id="flow-language" className={`${select} w-24`} value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <ul className="grid gap-3">
          {data.templates.map((tpl) => {
            const name = pick(tpl.title, locale, tpl.flow);
            return (
              <li key={tpl.flow} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{name}</span>
                  <span className="block text-sm text-muted-foreground">{pick(tpl.description, locale)}</span>
                </span>
                <Button size="sm" onClick={() => void install(tpl.flow, name)}>
                  {t("flows.install")}
                </Button>
              </li>
            );
          })}
        </ul>
      </section>
      <People people={data.people} reload={reload} />
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("flows.retention")}</h2>
        <Field label={t("flows.retention")} hint={t("flows.retention_hint")} htmlFor="flow-retention">
          <select
            id="flow-retention"
            className={`${select} w-40`}
            value={data.journalYears}
            onChange={(e) =>
              void xenaxio.flows
                .setJournalYears(Number(e.target.value))
                .then(reload)
                .catch((err) => setMsg({ kind: "error", text: errorText(t, err) }))
            }
          >
            {[1, 2, 3, 5, 6, 8, 10, 15, 20, 30].map((n) => (
              <option key={n} value={n}>
                {t("flows.retention_years", { n })}
              </option>
            ))}
          </select>
        </Field>
      </section>
    </div>
  );
}

export default function FlowsPage() {
  const t = useXT();
  return (
    <WorkspaceShell title={t("flows.title")}>
      <FlowsView />
    </WorkspaceShell>
  );
}
