"use client";

// Step 125 B: a small SVG chart for summaries of records and tasks — bars (vertical, horizontal,
// stacked), line, donut and a big number. Colours come from the theme (--color-chart-1…5), so
// themes, company colours and dark mode apply (rule 11); identity never rests on colour alone:
// a legend for several series, values in the tooltip and the table under the chart.
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { AggregateGroup, AggregateResult, ChartKind } from "@/lib/xenaxio/projects";

/** Series colours the theme defines; more series fold into "Other". */
export const CHART_COLORS = 5;
const color = (i: number) => (i < 0 ? "var(--color-muted-foreground)" : `var(--color-chart-${(i % CHART_COLORS) + 1})`);

export interface ChartText {
  none: string;
  other: string;
  records: (n: number) => string;
  recordsTitle: string;
  total: string;
}

/** Formats values of the measure: money in its currency, numbers with up to two decimals. */
export function valueFormat(kind: AggregateResult["kind"], currency: string | null, locale: string): (v: number) => string {
  if (kind === "money" && currency) {
    const f = new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 });
    return (v) => f.format(v);
  }
  const f = new Intl.NumberFormat(locale, { maximumFractionDigits: kind === "count" ? 0 : 2 });
  return (v) => f.format(v);
}

/** Short numbers for the value axis: "60k €" style in the person's language. */
export function axisFormat(kind: AggregateResult["kind"], currency: string | null, locale: string): (v: number) => string {
  const f = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1, ...(kind === "money" && currency ? { style: "currency", currency } : {}) });
  return (v) => f.format(v);
}

/** Round axis ticks from 0 (or the smallest negative value) to at least the largest value. */
export function niceTicks(min: number, max: number, count = 4, whole = false): number[] {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  if (hi === lo) return [0, 1];
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const nice = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw && (!whole || Number.isInteger(m * mag))) ?? 10) * mag;
  const step = whole ? Math.max(1, Math.ceil(nice)) : nice;
  const start = Math.floor(lo / step) * step;
  const out: number[] = [];
  for (let v = start; out.length < 50; v += step) {
    out.push(Math.round(v * 1e9) / 1e9);
    if (v >= hi - step * 1e-9) break;
  }
  return out;
}

export interface Series {
  key: string | null;
  label: string;
  /** Index of the theme colour; -1 for "Other". */
  color: number;
}

/** The series of a split chart in their first order; beyond the theme's colours, the rest is "Other". */
export function seriesOf(groups: AggregateGroup[], text: ChartText): { series: Series[]; folded: Set<string | null> } {
  const seen = new Map<string | null, string>();
  for (const g of groups) for (const s of g.split ?? []) if (!seen.has(s.key)) seen.set(s.key, s.label ?? s.key ?? text.none);
  const all = [...seen.entries()];
  if (all.length <= CHART_COLORS) return { series: all.map(([key, label], i) => ({ key, label, color: i })), folded: new Set() };
  const kept = all.slice(0, CHART_COLORS - 1);
  return {
    series: [...kept.map(([key, label], i) => ({ key, label, color: i })), { key: "\u0000other", label: text.other, color: -1 }],
    folded: new Set(all.slice(CHART_COLORS - 1).map(([k]) => k)),
  };
}

/** The value of one series in a group (folded series summed for "Other"). */
function splitValue(g: AggregateGroup, s: Series, folded: Set<string | null>): number {
  const parts = (g.split ?? []).filter((x) => (s.key === "\u0000other" ? folded.has(x.key) : x.key === s.key));
  return parts.reduce((a, x) => a + x.value, 0);
}

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.max(240, Math.floor(w)));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, width];
}

interface Tip {
  x: number;
  y: number;
  title: string;
  lines: { color?: number; text: string }[];
}

function clip(s: string, chars: number): string {
  return s.length > chars ? `${s.slice(0, Math.max(1, chars - 1))}…` : s;
}

export function Chart({
  data,
  chart,
  locale,
  text,
  onPick,
  pickable,
  height = 280,
}: {
  data: AggregateResult;
  chart: ChartKind;
  locale: string;
  text: ChartText;
  onPick?: (key: string | null) => void;
  pickable?: (key: string | null) => boolean;
  height?: number;
}) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState<Tip | null>(null);
  const fmt = useMemo(() => valueFormat(data.kind, data.currency, locale), [data.kind, data.currency, locale]);
  const label = (g: AggregateGroup) => g.label ?? g.key ?? text.none;
  const groups = data.groups;
  const canPick = (k: string | null) => !!onPick && (pickable ? pickable(k) : true);
  const pick = (k: string | null) => canPick(k) && onPick?.(k);
  const { series, folded } = useMemo(() => seriesOf(groups, text), [groups, text]);
  const stacked = chart === "stacked" && series.length > 0;

  const show = (e: React.MouseEvent | React.FocusEvent, g: AggregateGroup) => {
    const box = ref.current?.getBoundingClientRect();
    const target = (e.currentTarget as Element).getBoundingClientRect();
    const x = (("clientX" in e ? e.clientX : target.left + target.width / 2) - (box?.left ?? 0));
    const y = target.top - (box?.top ?? 0);
    setTip({
      x,
      y,
      title: label(g),
      lines: stacked
        ? series.map((s): Tip["lines"][number] => ({ color: s.color, text: `${s.label}: ${fmt(splitValue(g, s, folded))}` })).concat([{ text: `${text.total}: ${fmt(g.value)} · ${text.records(g.count)}` }])
        : [{ text: `${fmt(g.value)} · ${text.records(g.count)}` }],
    });
  };
  const hide = () => setTip(null);
  const bind = (g: AggregateGroup) => ({
    onMouseMove: (e: React.MouseEvent) => show(e, g),
    onMouseLeave: hide,
    onFocus: (e: React.FocusEvent) => show(e, g),
    onBlur: hide,
    onClick: () => pick(g.key),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pick(g.key);
      }
    },
    tabIndex: 0,
    role: canPick(g.key) ? "button" : "img",
    "aria-label": `${label(g)}: ${fmt(g.value)}, ${text.records(g.count)}`,
    className: cn("outline-none focus-visible:opacity-80", canPick(g.key) && "cursor-pointer"),
  });

  let body: ReactNode;
  if (chart === "number" || groups.length === 0) {
    body = (
      <div className="flex flex-col items-center justify-center gap-1 py-10">
        <div className="text-4xl font-semibold tabular-nums sm:text-5xl">{fmt(data.measure.op === "count" ? data.total.count : data.total.value)}</div>
        <div className="text-sm text-muted-foreground">{text.records(data.total.count)}</div>
      </div>
    );
  } else if (chart === "donut" && groups.every((g) => g.value >= 0) && (data.measure.op === "count" || data.measure.op === "sum")) {
    const size = Math.min(width, 260);
    const r = size / 2 - 8;
    const inner = r * 0.62;
    const sum = groups.reduce((a, g) => a + g.value, 0) || 1;
    const shown = groups.slice(0, CHART_COLORS);
    const rest = groups.slice(CHART_COLORS);
    const slices = [...shown.map((g, i) => ({ g, color: i })), ...(rest.length ? [{ g: { key: "\u0000other", label: text.other, value: rest.reduce((a, x) => a + x.value, 0), count: rest.reduce((a, x) => a + x.count, 0) } as AggregateGroup, color: -1 }] : [])];
    let angle = -Math.PI / 2;
    const arc = (a0: number, a1: number) => {
      const big = a1 - a0 > Math.PI ? 1 : 0;
      const p = (rad: number, a: number) => `${size / 2 + rad * Math.cos(a)} ${size / 2 + rad * Math.sin(a)}`;
      return `M ${p(r, a0)} A ${r} ${r} 0 ${big} 1 ${p(r, a1)} L ${p(inner, a1)} A ${inner} ${inner} 0 ${big} 0 ${p(inner, a0)} Z`;
    };
    body = (
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="group" aria-label={text.total}>
          {slices.map(({ g, color: c }) => {
            const a0 = angle;
            const a1 = angle + (g.value / sum) * Math.PI * 2 - (slices.length > 1 ? 0.0001 : 0);
            angle = a1;
            if (g.value <= 0) return null;
            const full = slices.length === 1 || g.value >= sum;
            return full ? (
              <g key={String(g.key)} {...bind(g)}>
                <circle cx={size / 2} cy={size / 2} r={(r + inner) / 2} fill="none" stroke={color(c)} strokeWidth={r - inner} />
              </g>
            ) : (
              <path key={String(g.key)} d={arc(a0, a1)} fill={color(c)} stroke="var(--color-card)" strokeWidth={2} {...bind(g)} />
            );
          })}
          <text x={size / 2} y={size / 2 - 4} textAnchor="middle" className="fill-foreground text-base font-semibold tabular-nums">
            {fmt(data.total.value)}
          </text>
          <text x={size / 2} y={size / 2 + 14} textAnchor="middle" className="fill-muted-foreground text-xs">
            {text.records(data.total.count)}
          </text>
        </svg>
        <ul className="space-y-1 text-sm">
          {slices.map(({ g, color: c }) => (
            <li key={String(g.key)} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color(c) }} aria-hidden />
              <span className="min-w-0 truncate">{label(g)}</span>
              <span className="ml-auto pl-3 tabular-nums text-muted-foreground">{Math.round((g.value / sum) * 100)} %</span>
            </li>
          ))}
        </ul>
      </div>
    );
  } else if (chart === "barH") {
    const row = 28;
    const labelW = Math.min(180, Math.floor(width * 0.32));
    const valueW = 90;
    const plotW = Math.max(40, width - labelW - valueW - 8);
    const max = Math.max(...groups.map((g) => g.value), 0) || 1;
    body = (
      <svg width={width} height={groups.length * row + 4} role="group" aria-label={text.total}>
        {groups.map((g, i) => {
          const w = Math.max(0, (g.value / max) * plotW);
          const y = i * row + 4;
          return (
            <g key={String(g.key)} {...bind(g)}>
              <rect x={0} y={y - 2} width={width} height={row} fill="transparent" />
              <text x={labelW - 8} y={y + row / 2} dominantBaseline="middle" textAnchor="end" className="fill-foreground text-xs">
                {clip(label(g), Math.floor(labelW / 7))}
              </text>
              <rect x={labelW} y={y + 4} width={w} height={row - 12} rx={4} fill={color(0)} />
              <text x={labelW + w + 6} y={y + row / 2} dominantBaseline="middle" className="fill-muted-foreground text-xs tabular-nums">
                {fmt(g.value)}
              </text>
            </g>
          );
        })}
      </svg>
    );
  } else {
    // Vertical bars, stacked bars and the line share one value axis.
    const bottom = 36;
    const top = 8;
    const plotH = height - top - bottom;
    const values = stacked ? groups.map((g) => series.reduce((a, s) => a + Math.max(0, splitValue(g, s, folded)), 0)) : groups.map((g) => g.value);
    const ticks = niceTicks(Math.min(...values), Math.max(...values), 4, data.kind === "count");
    const axis = axisFormat(data.kind, data.currency, locale);
    const left = Math.min(96, 16 + Math.max(...ticks.map((v) => axis(v).length)) * 7);
    const plotW = Math.max(60, width - left - 8);
    const lo = ticks[0]!;
    const hi = ticks[ticks.length - 1]!;
    const yOf = (v: number) => top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
    const band = plotW / groups.length;
    const barW = Math.max(2, Math.min(48, band * 0.62));
    const every = Math.max(1, Math.ceil((groups.length * 64) / plotW));
    const xLabel = (g: AggregateGroup, i: number) =>
      i % every === 0 ? (
        <text key={`x${i}`} x={left + band * i + band / 2} y={height - bottom + 16} textAnchor="middle" className="fill-muted-foreground text-xs">
          {clip(label(g), Math.max(3, Math.floor((band * every) / 7)))}
        </text>
      ) : null;
    const points = groups.map((g, i) => [left + band * i + band / 2, yOf(g.value)] as const);
    body = (
      <svg width={width} height={height} role="group" aria-label={text.total}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={left} x2={left + plotW} y1={yOf(v)} y2={yOf(v)} stroke="var(--color-border)" strokeWidth={1} />
            <text x={left - 6} y={yOf(v)} dominantBaseline="middle" textAnchor="end" className="fill-muted-foreground text-xs tabular-nums">
              {axis(v)}
            </text>
          </g>
        ))}
        {chart === "line" ? (
          <>
            <polyline points={points.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke={color(0)} strokeWidth={2} strokeLinejoin="round" />
            {groups.map((g, i) => (
              <g key={String(g.key)} {...bind(g)}>
                <rect x={left + band * i} y={top} width={band} height={plotH} fill="transparent" />
                <circle cx={points[i]![0]} cy={points[i]![1]} r={4} fill={color(0)} stroke="var(--color-card)" strokeWidth={2} />
              </g>
            ))}
          </>
        ) : (
          groups.map((g, i) => {
            const x = left + band * i + (band - barW) / 2;
            if (!stacked) {
              const y0 = yOf(Math.max(0, g.value));
              const h = Math.abs(yOf(g.value) - yOf(0));
              return (
                <g key={String(g.key)} {...bind(g)}>
                  <rect x={left + band * i} y={top} width={band} height={plotH} fill="transparent" />
                  <rect x={x} y={y0} width={barW} height={Math.max(h, 1)} rx={Math.min(4, barW / 2)} fill={color(0)} />
                </g>
              );
            }
            let acc = 0;
            return (
              <g key={String(g.key)} {...bind(g)}>
                <rect x={left + band * i} y={top} width={band} height={plotH} fill="transparent" />
                {series.map((s) => {
                  const v = Math.max(0, splitValue(g, s, folded));
                  if (v === 0) return null;
                  const y1 = yOf(acc + v);
                  const y2 = yOf(acc);
                  acc += v;
                  return <rect key={String(s.key)} x={x} y={y1} width={barW} height={Math.max(1, y2 - y1 - 2)} rx={2} fill={color(s.color)} />;
                })}
              </g>
            );
          })
        )}
        <line x1={left} x2={left + plotW} y1={yOf(0)} y2={yOf(0)} stroke="var(--color-muted-foreground)" strokeWidth={1} />
        {groups.map(xLabel)}
      </svg>
    );
  }

  return (
    <div ref={ref} className="relative w-full min-w-0" onMouseLeave={hide}>
      {stacked && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label={text.total}>
          {series.map((s) => (
            <li key={String(s.key)} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color(s.color) }} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      {body}
      {data.other && chart !== "number" && <p className="mt-1 text-xs text-muted-foreground">{`${text.other}: ${fmt(data.other.value)} · ${text.records(data.other.count)}`}</p>}
      {tip && (
        <div className="pointer-events-none absolute z-10 max-w-[240px] -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md" style={{ left: Math.min(Math.max(tip.x, 60), width - 60), top: Math.max(tip.y - 6, 0) }}>
          <div className="font-medium">{tip.title}</div>
          {tip.lines.map((l, i) => (
            <div key={i} className="flex items-center gap-1.5 tabular-nums">
              {l.color !== undefined && <span className="h-2 w-2 rounded-sm" style={{ background: color(l.color) }} aria-hidden />}
              {l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The same numbers as a table (accessibility and a check of the chart). */
export function ChartTable({ data, locale, text, groupTitle, valueTitle }: { data: AggregateResult; locale: string; text: ChartText; groupTitle: string; valueTitle: string }) {
  const fmt = valueFormat(data.kind, data.currency, locale);
  const series = seriesOf(data.groups, text);
  const split = series.series.length > 0;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th className="py-1.5 pr-2 font-medium">{groupTitle}</th>
            {split && series.series.map((s) => <th key={String(s.key)} className="px-2 py-1.5 text-right font-medium">{s.label}</th>)}
            <th className="px-2 py-1.5 text-right font-medium">{valueTitle}</th>
            <th className="py-1.5 pl-2 text-right font-medium">{text.recordsTitle}</th>
          </tr>
        </thead>
        <tbody>
          {data.groups.map((g) => (
            <tr key={String(g.key)} className="border-b border-border/60">
              <td className="py-1.5 pr-2">{g.label ?? g.key ?? text.none}</td>
              {split && series.series.map((s) => <td key={String(s.key)} className="px-2 py-1.5 text-right tabular-nums">{fmt(splitValue(g, s, series.folded))}</td>)}
              <td className="px-2 py-1.5 text-right tabular-nums">{fmt(g.value)}</td>
              <td className="py-1.5 pl-2 text-right tabular-nums">{g.count}</td>
            </tr>
          ))}
          {data.other && (
            <tr className="border-b border-border/60 text-muted-foreground">
              <td className="py-1.5 pr-2">{text.other}</td>
              {split && series.series.map((s) => <td key={String(s.key)} />)}
              <td className="px-2 py-1.5 text-right tabular-nums">{fmt(data.other.value)}</td>
              <td className="py-1.5 pl-2 text-right tabular-nums">{data.other.count}</td>
            </tr>
          )}
          <tr className="font-medium">
            <td className="py-1.5 pr-2">{text.total}</td>
            {split && series.series.map((s) => <td key={String(s.key)} />)}
            <td className="px-2 py-1.5 text-right tabular-nums">{fmt(data.total.value)}</td>
            <td className="py-1.5 pl-2 text-right tabular-nums">{data.total.count}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
