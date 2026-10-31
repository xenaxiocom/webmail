import { describe, expect, it } from "vitest";
import { reportView } from "../action-report";
import type { ActionReport } from "../assistant";

// Step 101: the report under an answer, grouped as the panel shows it.
describe("reportView", () => {
  const report: ActionReport = {
    steps: [
      { tool: "search_mail", kind: "read", status: "ok", args: { query: "Müller" }, count: 3 },
      { tool: "search_mail", kind: "read", status: "ok", args: { query: "Angebot", id: "e1" }, count: 1 },
      { tool: "get_email", kind: "read", status: "ok", args: { id: "e1" }, count: 1 },
      { tool: "create_draft", kind: "write-safe", status: "ok", count: 2 },
      { tool: "set_signature", kind: "write-confirm", status: "proposed", proposalId: "p1" },
      { tool: "set_display_name", kind: "unknown", status: "error" },
    ],
    changed: true,
    claimMismatch: false,
  };

  it("puts reading in one line per tool with its words, and writes on their own", () => {
    const view = reportView(report);
    expect(view.reads).toEqual([
      { tool: "search_mail", calls: 2, count: 4, words: ["Müller", "Angebot"], failed: false },
      { tool: "get_email", calls: 1, count: 1, words: [], failed: false },
    ]);
    expect(view.actions).toEqual([
      { tool: "create_draft", state: "done" },
      { tool: "set_signature", state: "waiting" },
      { tool: "set_display_name", state: "unknown" },
    ]);
    expect(view).toMatchObject({ changed: ["create_draft"], waiting: 1, steps: 6, warn: false });
  });

  it("a confirmed proposal counts as a change: the live card wins over what the chat stored", () => {
    const stored: ActionReport = { ...report, steps: report.steps.map((s) => (s.proposalId ? { ...s, outcome: "rejected" as const } : s)) };
    expect(reportView(stored).actions[1]).toEqual({ tool: "set_signature", state: "rejected" });
    const view = reportView(stored, { p1: "done" });
    expect(view.actions[1]).toEqual({ tool: "set_signature", state: "confirmed" });
    expect(view.changed).toEqual(["create_draft", "set_signature"]);
    expect(reportView(stored, { p1: "memory_full" }).actions[1]!.state).toBe("proposal_failed");
  });

  it("warns only while nothing was changed", () => {
    expect(reportView({ steps: [], changed: false, claimMismatch: true })).toMatchObject({ warn: true, changed: [], steps: 0 });
    expect(reportView({ ...report, claimMismatch: true }).warn).toBe(false);
  });
});
