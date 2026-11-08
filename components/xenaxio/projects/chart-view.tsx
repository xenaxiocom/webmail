"use client";

// Step 125 B, C: the "Chart" view of a type — what to group by and measure, the chart, the
// numbers as a table, saved views (one's own, shared ones by the company's admin). The chart
// the person set up last is kept on the server (rule 10); a click on a group opens the list.
import { useEffect, useMemo, useState } from "react";
import { Share2, Trash } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/xenaxio/ui";
import { cn } from "@/lib/utils";
import { errorText } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";
import { type AggregateResult, type ChartConfig, type ChartKind, type FieldFilter, type GroupBy, type GroupSpec, asValueField, local, type Measure, type ObjectType, type ObjectView, type Period, projectsApi } from "@/lib/xenaxio/projects";
import { toast } from "@/stores/toast-store";
import { selectClass } from "./bits";
import { Chart, ChartTable, type ChartText } from "./chart";

const GROUPABLE = ["text", "select", "multiselect", "user", "checkbox", "ref", "refs", "date", "email", "url", "phone"];
const CHARTS: ChartKind[] = ["bar", "barH", "stacked", "line", "donut", "number"];
const PERIODS: Period[] = ["day", "week", "month", "quarter", "year"];

/** A grouping as one select value: "status", "owner", "created", "due" or "field:<key>". */
const specValue = (g: GroupSpec) => (g.by === "field" ? `field:${g.field ?? ""}` : g.by);
function specOf(value: string, period?: Period): GroupSpec {
  if (value.startsWith("field:")) return { by: "field", field: value.slice(6), ...(period ? { period } : {}) };
  return { by: value as GroupBy, ...(period ? { period } : {}) };
}

/** The name of a date group ("2026-11-01") for its period: "Nov. 2026", "Q4 2026", "2026", a day. */
export function dateLabel(key: string, period: Period, locale: string): string {
  const d = new Date(`${key.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return key;
  const y = d.getUTCFullYear();
  if (period === "year") return String(y);
  if (period === "quarter") return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${y}`;
  if (period === "month") return d.toLocaleDateString(locale, { month: "short", year: "numeric", timeZone: "UTC" });
  return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** A sensible first chart: by stage if the type has stages, else by owner. */
export function defaultChart(type: ObjectType): ChartConfig {
  return { kind: "chart", chart: "bar", groupBy: type.statuses.length ? { by: "status" } : { by: "owner" }, measure: { op: "count" } };
}

/** Keeps a stored chart only when it still fits the type (fields may have been removed). */
export function validChart(type: ObjectType, raw: unknown): ChartConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<ChartConfig>;
  if (c.kind !== "chart" || !CHARTS.includes(c.chart as ChartKind) || !c.groupBy || !c.measure) return null;
  const fieldOk = (g: GroupSpec) => g.by !== "field" || type.fields.some((f) => f.key === g.field && !f.sensitive && GROUPABLE.includes(asValueField(f).type));
  if (!fieldOk(c.groupBy) || (c.splitBy && !fieldOk(c.splitBy))) return null;
  if (c.measure.op !== "count" && !type.fields.some((f) => f.key === c.measure!.field && ["number", "money"].includes(asValueField(f).type) && !f.sensitive)) return null;
  return c as ChartConfig;
}

export function ChartView({
  type,
  locale,
  scope,
  admin,
  config,
  onConfig,
  viewId,
  onViewId,
  views,
  onViews,
  onPick,
}: {
  type: ObjectType;
  locale: string;
  /** The list's filters: only these records count. */
  scope: { mine: boolean; archived: boolean; status?: string; filters: FieldFilter[] };
  admin: boolean;
  config: ChartConfig;
  onConfig: (c: ChartConfig) => void;
  viewId: string | null;
  onViewId: (id: string | null) => void;
  views: ObjectView[];
  onViews: (v: ObjectView[]) => void;
  /** A click on a group: open the list of its records. */
  onPick?: (group: GroupSpec, key: string | null) => void;
}) {
  const t = useXT();
  const [data, setData] = useState<AggregateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [table, setTable] = useState(false);
  const [saving, setSaving] = useState<null | { name: string; shared: boolean; asNew: boolean }>(null);
  const [deleting, setDeleting] = useState<ObjectView | null>(null);
  const view = views.find((v) => v.id === viewId) ?? null;

  const groupOptions = useMemo(() => {
    const out: { value: string; label: string; date?: boolean }[] = [];
    if (type.statuses.length) out.push({ value: "status", label: t("projects.field.status") });
    out.push({ value: "owner", label: t("projects.field.owner") });
    out.push({ value: "created", label: t("objects.chart.created"), date: true });
    out.push({ value: "due", label: t("projects.field.due"), date: true });
    for (const f of type.fields) if (!f.sensitive && GROUPABLE.includes(asValueField(f).type)) out.push({ value: `field:${f.key}`, label: local(f.label, locale), date: asValueField(f).type === "date" });
    return out;
  }, [type, locale, t]);
  const numberFields = useMemo(() => type.fields.filter((f) => ["number", "money"].includes(asValueField(f).type) && !f.sensitive), [type]);
  const isDate = (g?: GroupSpec) => !!g && !!groupOptions.find((o) => o.value === specValue(g))?.date;

  const key = JSON.stringify([type.key, config.groupBy, config.chart === "stacked" ? config.splitBy : null, config.measure, scope]);
  useEffect(() => {
    let live = true;
    setError(null);
    projectsApi
      .aggregate({
        type: type.key,
        groupBy: config.groupBy,
        ...(config.chart === "stacked" && config.splitBy ? { splitBy: config.splitBy } : {}),
        measure: config.measure,
        mine: scope.mine,
        archived: scope.archived,
        ...(scope.status ? { status: scope.status } : {}),
        ...(scope.filters.length ? { filters: scope.filters } : {}),
      })
      .then((r) => live && setData(r))
      .catch((err: unknown) => live && setError(errorText(t, err)));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` covers the request.
  }, [key, t]);

  // Dates are named for their period in the person's language.
  const shown = useMemo(() => {
    if (!data) return null;
    const name = (g: GroupSpec | undefined) => (g && isDate(g) ? (k: string | null) => (k ? dateLabel(k, g.period ?? "month", locale) : undefined) : () => undefined);
    const n1 = name(config.groupBy);
    const n2 = name(config.chart === "stacked" ? config.splitBy : undefined);
    return {
      ...data,
      groups: data.groups.map((g) => ({ ...g, ...(n1(g.key) ? { label: n1(g.key)! } : {}), ...(g.split ? { split: g.split.map((x) => ({ ...x, ...(n2(x.key) ? { label: n2(x.key)! } : {}) })) } : {}) })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isDate follows groupOptions.
  }, [data, config.groupBy, config.splitBy, config.chart, locale, groupOptions]);

  const text: ChartText = useMemo(
    () => ({
      none: "—",
      other: t("objects.chart.other"),
      records: (n: number) => t("objects.chart.records", { n }),
      recordsTitle: t("objects.chart.records_title"),
      total: t("objects.chart.total"),
    }),
    [t],
  );
  const set = (change: Partial<ChartConfig>) => onConfig({ ...config, ...change });
  const setGroup = (value: string) => set({ groupBy: specOf(value, groupOptions.find((o) => o.value === value)?.date ? (config.groupBy.period ?? "month") : undefined) });
  const setSplit = (value: string) => {
    if (!value) {
      const { splitBy: _drop, ...rest } = config;
      onConfig(rest);
      return;
    }
    set({ splitBy: specOf(value, groupOptions.find((o) => o.value === value)?.date ? "month" : undefined) });
  };
  const setMeasure = (value: string) => {
    if (value === "count") return set({ measure: { op: "count" } });
    const [op, field] = value.split(":") as [Measure["op"], string];
    set({ measure: { op, field } });
  };
  const measureValue = config.measure.op === "count" ? "count" : `${config.measure.op}:${config.measure.field ?? ""}`;
  const measureField = numberFields.find((f) => f.key === config.measure.field);
  const measureLabel = config.measure.op === "count" || !measureField ? t("objects.chart.count") : t(`objects.chart.op_${config.measure.op}`, { field: local(measureField.label, locale) });
  const changed = view ? JSON.stringify(view.config) !== JSON.stringify(config) : false;

  const save = async () => {
    if (!saving) return;
    try {
      const out = await projectsApi.saveView({ ...(view && !saving.asNew ? { id: view.id } : {}), type: type.key, name: saving.name.trim(), shared: saving.shared, config });
      onViews(view && !saving.asNew ? views.map((v) => (v.id === out.id ? out : v)) : [...views, out]);
      onViewId(out.id);
      setSaving(null);
      toast.success(t("objects.chart.saved"));
    } catch (err) {
      toast.error(errorText(t, err));
    }
  };
  const remove = async (v: ObjectView) => {
    try {
      await projectsApi.deleteView(v.id);
      onViews(views.filter((x) => x.id !== v.id));
      if (viewId === v.id) onViewId(null);
    } catch (err) {
      toast.error(errorText(t, err));
    }
  };

  const pickable = (k: string | null) => {
    if (!onPick || k === null) return false;
    if (config.groupBy.by === "status") return true;
    const f = config.groupBy.by === "field" ? type.fields.find((x) => x.key === config.groupBy.field) : undefined;
    return f?.type === "select" || f?.type === "multiselect";
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className={cn(selectClass, "h-8 w-auto")} aria-label={t("objects.chart.kind")} value={config.chart} onChange={(e) => set({ chart: e.target.value as ChartKind })}>
          {CHARTS.map((c) => (
            <option key={c} value={c}>
              {t(`objects.chart.kind_${c}`)}
            </option>
          ))}
        </select>
        {config.chart !== "number" && (
          <>
            <select className={cn(selectClass, "h-8 w-auto")} aria-label={t("objects.chart.group")} value={specValue(config.groupBy)} onChange={(e) => setGroup(e.target.value)}>
              {groupOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {t("objects.chart.group")}: {o.label}
                </option>
              ))}
            </select>
            {isDate(config.groupBy) && (
              <select className={cn(selectClass, "h-8 w-auto")} aria-label={t("objects.chart.period")} value={config.groupBy.period ?? "month"} onChange={(e) => set({ groupBy: { ...config.groupBy, period: e.target.value as Period } })}>
                {PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {t(`objects.chart.period_${p}`)}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
        {config.chart === "stacked" && (
          <select className={cn(selectClass, "h-8 w-auto")} aria-label={t("objects.chart.split")} value={config.splitBy ? specValue(config.splitBy) : ""} onChange={(e) => setSplit(e.target.value)}>
            <option value="">{t("objects.chart.split_none")}</option>
            {groupOptions
              .filter((o) => o.value !== specValue(config.groupBy))
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {t("objects.chart.split")}: {o.label}
                </option>
              ))}
          </select>
        )}
        <select className={cn(selectClass, "h-8 w-auto")} aria-label={t("objects.chart.measure")} value={measureValue} onChange={(e) => setMeasure(e.target.value)}>
          <option value="count">{t("objects.chart.count")}</option>
          {numberFields.flatMap((f) =>
            (["sum", "avg", "min", "max"] as const).map((op) => (
              <option key={`${op}:${f.key}`} value={`${op}:${f.key}`}>
                {t(`objects.chart.op_${op}`, { field: local(f.label, locale) })}
              </option>
            )),
          )}
        </select>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" className="text-sm text-primary hover:underline" aria-pressed={table} onClick={() => setTable((x) => !x)}>
            {table ? t("objects.chart.as_chart") : t("objects.chart.as_table")}
          </button>
          {view?.can.edit && changed && (
            <Button size="sm" variant="outline" onClick={() => setSaving({ name: view.name, shared: view.shared, asNew: false })}>
              {t("objects.chart.update")}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setSaving({ name: view && !view.can.edit ? view.name : "", shared: false, asNew: true })}>
            {t("objects.chart.save")}
          </Button>
          {view?.can.edit && (
            <button type="button" className="rounded p-1 text-muted-foreground hover:text-destructive" aria-label={t("objects.chart.delete")} title={t("objects.chart.delete")} onClick={() => setDeleting(view)}>
              <Trash className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {saving && (
        <form
          className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Input autoFocus className="h-8 w-full min-w-0 sm:w-64" maxLength={80} value={saving.name} onChange={(e) => setSaving({ ...saving, name: e.target.value })} placeholder={t("objects.chart.name")} aria-label={t("objects.chart.name")} />
          {admin && (
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={saving.shared} onChange={(e) => setSaving({ ...saving, shared: e.target.checked })} />
              <Share2 className="h-3.5 w-3.5" />
              {t("objects.chart.shared")}
            </label>
          )}
          <Button size="sm" type="submit" disabled={!saving.name.trim()}>
            {t("objects.chart.save_ok")}
          </Button>
          <Button size="sm" type="button" variant="ghost" onClick={() => setSaving(null)}>
            {t("objects.chart.cancel")}
          </Button>
        </form>
      )}

      {error && <Notice kind="error">{error}</Notice>}
      {shown && !error && (
        <div className="rounded-lg border border-border bg-card p-3 text-card-foreground sm:p-4">
          {table ? (
            <ChartTable data={shown} locale={locale} text={text} groupTitle={groupOptions.find((o) => o.value === specValue(config.groupBy))?.label ?? ""} valueTitle={measureLabel} />
          ) : (
            <Chart data={shown} chart={config.chart} locale={locale} text={text} pickable={pickable} onPick={onPick ? (k) => onPick(config.groupBy, k) : undefined} />
          )}
        </div>
      )}
      {data && data.groups.length === 0 && config.chart !== "number" && <p className="mt-2 text-sm text-muted-foreground">{t("objects.chart.empty")}</p>}

      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) void remove(deleting);
          setDeleting(null);
        }}
        title={t("objects.chart.delete")}
        message={t("objects.chart.delete_confirm", { name: deleting?.name ?? "" })}
        confirmText={t("objects.chart.delete")}
        variant="destructive"
      />
    </div>
  );
}
