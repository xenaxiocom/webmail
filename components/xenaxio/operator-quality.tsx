"use client";

// xenaxio step 146 (Xenacore, stage 9, part D): "Assistant quality" in the
// operator console — anonymous daily numbers for the whole platform: per tool,
// calls, bad arguments from the model, failures and declined proposals; per
// day, answers, "not helpful" and answers that hit their budget. No company,
// person or text is in them. We use them to fix tool descriptions and
// prompts. Counting starts only when switched on here, after the line in the
// privacy policy is live.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice, Spinner } from "@/components/xenaxio/ui";
import { errorKey, type QualityReport, xenaxio } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";

const DAYS = 30;
export const PRIVACY_URL = "https://xenaxio.com/de/datenschutz/";

/** A share as a whole percent; "–" when there is nothing to share. */
export function share(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)} %` : "–";
}

export function OperatorQuality() {
  const t = useXT();
  const [data, setData] = useState<QualityReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    xenaxio.operator
      .quality(DAYS)
      .then(setData)
      .catch((err) => setError(t(errorKey(err))));
  }, [t]);
  useEffect(load, [load]);

  const toggle = async (on: boolean) => {
    if (on && !window.confirm(t("quality.confirm_on"))) return;
    setBusy(true);
    setError(null);
    try {
      await xenaxio.operator.setQuality(on);
      load();
    } catch (err) {
      setError(t(errorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  if (!data) return error ? <Notice kind="error">{error}</Notice> : <Spinner label={t("common.loading")} />;
  const totals = data.days.reduce((a, d) => ({ answers: a.answers + d.answers, bad: a.bad + d.bad, budget: a.budget + d.budget }), { answers: 0, bad: 0, budget: 0 });

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="font-medium">{t("quality.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("quality.intro")}</p>
        <p className="text-sm">
          {data.on ? t("quality.on_since", { date: new Date(data.since ?? Date.now()).toLocaleDateString() }) : t("quality.off")}{" "}
          <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">
            {t("quality.privacy_link")}
          </a>
        </p>
        {!data.on && <Notice kind="info">{t("quality.privacy_first")}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
        <Button size="sm" variant={data.on ? "outline" : "default"} disabled={busy} onClick={() => void toggle(!data.on)}>
          {data.on ? t("quality.switch_off") : t("quality.switch_on")}
        </Button>
      </section>

      <section className="space-y-2 rounded-lg border border-border bg-card p-4">
        <h2 className="font-medium">{t("quality.answers_title", { days: DAYS })}</h2>
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">{t("quality.answers")}</dt>
            <dd className="text-lg font-medium">{totals.answers}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("quality.bad")}</dt>
            <dd className="text-lg font-medium">{share(totals.bad, totals.answers)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("quality.budget")}</dt>
            <dd className="text-lg font-medium">{share(totals.budget, totals.answers)}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-2 rounded-lg border border-border bg-card p-4">
        <h2 className="font-medium">{t("quality.tools_title", { days: DAYS })}</h2>
        {data.tools.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("quality.none")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-normal">{t("quality.tool")}</th>
                  <th className="py-1 pr-3 text-right font-normal">{t("quality.calls")}</th>
                  <th className="py-1 pr-3 text-right font-normal">{t("quality.invalid")}</th>
                  <th className="py-1 pr-3 text-right font-normal">{t("quality.failed")}</th>
                  <th className="py-1 text-right font-normal">{t("quality.declined")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.tools.map((r) => (
                  <tr key={r.tool}>
                    <td className="py-1 pr-3 font-mono text-xs">{r.tool === "external" ? t("quality.external") : r.tool === "unknown" ? t("quality.unknown") : r.tool}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{r.calls}</td>
                    <td className={`py-1 pr-3 text-right tabular-nums ${r.calls >= 20 && r.invalid / r.calls >= 0.1 ? "text-warning" : ""}`}>{share(r.invalid, r.calls)}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{share(r.failed, r.calls)}</td>
                    <td className="py-1 text-right tabular-nums">{r.proposed ? share(r.declined, r.proposed) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">{t("quality.legend")}</p>
      </section>
    </div>
  );
}
