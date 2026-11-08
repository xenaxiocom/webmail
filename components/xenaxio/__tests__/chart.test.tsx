import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AggregateResult } from "@/lib/xenaxio/projects";
import { Chart, ChartTable, type ChartText, niceTicks, seriesOf, valueFormat } from "../projects/chart";

// Step 125 B: the SVG chart of summaries.
const text: ChartText = { none: "—", other: "Other", records: (n) => `${n} records`, recordsTitle: "Records", total: "Total" };

const data = (over: Partial<AggregateResult> = {}): AggregateResult => ({
  type: "deal",
  measure: { op: "sum", field: "amount" },
  kind: "money",
  currency: "EUR",
  groups: [
    { key: "lead", label: "Lead", value: 400, count: 2 },
    { key: "won", label: "Won", value: 1000, count: 1 },
    { key: null, value: 50, count: 1 },
  ],
  other: null,
  total: { value: 1450, count: 4 },
  ...over,
});

describe("chart helpers", () => {
  it("makes round ticks from zero", () => {
    expect(niceTicks(0, 1000)).toEqual([0, 250, 500, 750, 1000]);
    expect(niceTicks(0, 7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(-30, 100)[0]).toBeLessThanOrEqual(-30);
    expect(niceTicks(0, 0)).toEqual([0, 1]);
  });

  it("formats money in its currency and counts without decimals", () => {
    expect(valueFormat("money", "EUR", "en")(1450)).toBe("€1,450.00");
    expect(valueFormat("count", null, "de")(1234)).toBe("1.234");
  });

  it("keeps the theme's five colours and folds further series into Other", () => {
    const split = Array.from({ length: 7 }, (_, i) => ({ key: `s${i}`, value: 1, count: 1 }));
    const { series, folded } = seriesOf([{ key: "a", value: 7, count: 7, split }], text);
    expect(series.map((s) => s.label)).toEqual(["s0", "s1", "s2", "s3", "Other"]);
    expect(series.at(-1)!.color).toBe(-1);
    expect([...folded]).toEqual(["s4", "s5", "s6"]);
  });
});

describe("Chart", () => {
  it("draws a bar per group in theme colours; a click on a group picks it", () => {
    const onPick = vi.fn();
    const { container } = render(<Chart data={data()} chart="bar" locale="en" text={text} onPick={onPick} pickable={(k) => k !== null} />);
    const bars = [...container.querySelectorAll("rect[rx]")];
    expect(bars).toHaveLength(3);
    expect(bars.every((b) => b.getAttribute("fill") === "var(--color-chart-1)")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^Won: €1,000.00, 1 records$/ }));
    expect(onPick).toHaveBeenCalledWith("won");
    // The group without a value is not a link.
    expect(screen.getByRole("img", { name: /^—: / })).toBeTruthy();
  });

  it("shows the value in a tooltip on hover", () => {
    render(<Chart data={data()} chart="bar" locale="en" text={text} />);
    fireEvent.mouseMove(screen.getByRole("img", { name: /^Lead:/ }));
    expect(screen.getByText("€400.00 · 2 records")).toBeTruthy();
  });

  it("stacks split values with a legend", () => {
    const d = data({ groups: [{ key: "web", label: "Web", value: 3, count: 3, split: [{ key: "lead", label: "Lead", value: 2, count: 2 }, { key: "won", label: "Won", value: 1, count: 1 }] }], kind: "count", measure: { op: "count" }, currency: null });
    const { container } = render(<Chart data={d} chart="stacked" locale="en" text={text} />);
    expect(screen.getByText("Lead")).toBeTruthy();
    expect([...container.querySelectorAll("rect[rx]")].map((r) => r.getAttribute("fill"))).toEqual(["var(--color-chart-1)", "var(--color-chart-2)"]);
  });

  it("draws a donut with shares and a big number", () => {
    const { container, rerender } = render(<Chart data={data()} chart="donut" locale="en" text={text} />);
    expect(container.querySelectorAll("path")).toHaveLength(3);
    expect(screen.getByText("69 %")).toBeTruthy();
    rerender(<Chart data={data()} chart="number" locale="en" text={text} />);
    expect(screen.getByText("€1,450.00")).toBeTruthy();
    expect(screen.getByText("4 records")).toBeTruthy();
  });

  it("lists the same numbers as a table with the total", () => {
    render(<ChartTable data={data()} locale="en" text={text} groupTitle="Stage" valueTitle="Sum: Amount" />);
    expect(screen.getByRole("columnheader", { name: "Records" })).toBeTruthy();
    const total = screen.getByText("Total").closest("tr")!;
    expect(total.textContent).toContain("€1,450.00");
    expect(total.textContent).toContain("4");
  });
});

describe("date groups", () => {
  it("are named for their period", async () => {
    const { dateLabel } = await import("../projects/chart-view");
    expect(dateLabel("2026-11-01", "quarter", "de")).toBe("Q4 2026");
    expect(dateLabel("2026-01-01", "year", "en")).toBe("2026");
    expect(dateLabel("2026-11-01", "month", "en")).toBe("Nov 2026");
    expect(dateLabel("not a date", "month", "en")).toBe("not a date");
  });
});
