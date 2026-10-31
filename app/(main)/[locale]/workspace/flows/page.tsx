"use client";

// Step F1: Xenaxio Agent Flows. Step F1.1: flows are set up by their owners in
// their own section (/flows); the company's admin keeps here how long journals
// stay and sees every flow of the company, with a pause and a link to open it.
import { useCallback, useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Field, Notice, Spinner } from "@/components/xenaxio/ui";
import { WorkspaceShell } from "@/components/xenaxio/workspace-shell";
import { errorText, type FlowsAdminOverview, xenaxio } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";

const select = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
type Msg = { kind: "error" | "success"; text: string } | null;

function FlowsAdminView() {
  const t = useXT();
  const [data, setData] = useState<FlowsAdminOverview | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const reload = useCallback(async () => {
    try {
      setData(await xenaxio.flows.adminOverview());
    } catch (err) {
      setMsg({ kind: "error", text: errorText(t, err) });
    }
  }, [t]);
  useEffect(() => {
    void reload();
  }, [reload]);
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
  if (!data) return msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : <Spinner label={t("flows.title")} />;
  if (!data.enabled) return <Notice kind="info">{t("flows.disabled")}</Notice>;
  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">{t("flows.admin_intro")}</p>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t("flows.all_flows")}</h2>
          <Link href="/flows" className="text-sm underline">
            {t("flows.open_section")}
          </Link>
        </div>
        {data.installations.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("flows.none_company")}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border text-sm">
            {data.installations.map((inst) => (
              <li key={inst.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0">
                  <span className="block font-medium">{inst.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {inst.owners.map((o) => o.name).join(", ") || t("flows.owner_none")} · {t(`flows.status_${inst.status}`)}
                  </span>
                </span>
                <span className="flex gap-2">
                  {inst.status === "active" && (
                    <Button size="sm" variant="outline" onClick={() => void act(() => xenaxio.flows.update(inst.id, { status: "paused" }), t("flows.paused"))}>
                      {t("flows.pause")}
                    </Button>
                  )}
                  <Link href={`/flows?flow=${encodeURIComponent(inst.id)}`} className="inline-flex h-8 items-center rounded-md px-3 text-sm underline">
                    {t("flows.open")}
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
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

export default function FlowsAdminPage() {
  const t = useXT();
  return (
    <WorkspaceShell title={t("flows.title")}>
      <FlowsAdminView />
    </WorkspaceShell>
  );
}
