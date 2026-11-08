"use client";

// Step 125 C: the tasks of a project counted by column, assignee, priority, label or state —
// the chart in a project's "Overview". The grouping a person picked is kept on the server (rule 10).
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { errorText } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";
import { type AggregateResult, projectsApi, type TaskGroupBy } from "@/lib/xenaxio/projects";
import { useViewPrefs } from "@/lib/xenaxio/view-prefs";
import { selectClass } from "./bits";
import { Chart, type ChartText } from "./chart";

const BYS: TaskGroupBy[] = ["column", "assignee", "priority", "label", "done"];
const parse = (v: Record<string, unknown>) => ({ by: BYS.includes(v.by as TaskGroupBy) ? (v.by as TaskGroupBy) : ("column" as TaskGroupBy) });

export function TaskChart({ projectId, reloadKey = 0 }: { projectId: string; reloadKey?: number }) {
  const t = useXT();
  const locale = useLocale();
  const [prefs, setPrefs] = useViewPrefs("taskchart", parse);
  const [data, setData] = useState<AggregateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    projectsApi
      .taskSummary(projectId, prefs.by)
      .then((r) => {
        if (!live) return;
        const name = (key: string | null) =>
          prefs.by === "priority" && key ? t(`projects.priority.${key}`) : prefs.by === "done" && key ? t(key === "done" ? "objects.chart.tasks_closed" : "objects.chart.tasks_open") : undefined;
        setData({
          type: "task",
          measure: { op: "count" },
          kind: "count",
          currency: null,
          groups: r.groups.map((g) => ({ ...g, ...(name(g.key) ? { label: name(g.key)! } : {}) })),
          other: null,
          total: { value: r.total, count: r.total },
        });
        setError(null);
      })
      .catch((err: unknown) => live && setError(errorText(t, err)));
    return () => {
      live = false;
    };
  }, [projectId, prefs.by, reloadKey, t]);

  const text: ChartText = useMemo(
    () => ({ none: "—", other: t("objects.chart.other"), records: (n: number) => t("objects.chart.records", { n }), recordsTitle: t("objects.chart.records_title"), total: t("objects.chart.total") }),
    [t],
  );

  if (data && data.total.count === 0) return null;
  return (
    <div className="space-y-2 text-sm sm:col-span-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{t("objects.chart.tasks_title")}</span>
        <select className={cn(selectClass, "h-7 w-auto text-xs")} aria-label={t("objects.chart.tasks_by")} value={prefs.by} onChange={(e) => setPrefs({ by: e.target.value as TaskGroupBy })}>
          {BYS.map((b) => (
            <option key={b} value={b}>
              {t("objects.chart.tasks_by")}: {t(`objects.chart.tasks_${b}`)}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-destructive">{error}</p>}
      {data && <Chart data={data} chart="barH" locale={locale} text={text} />}
    </div>
  );
}
