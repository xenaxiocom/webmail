// Step 101: the report under an answer ("Was ich getan habe"), as the panel
// shows it. The platform builds it from the tool calls; here it is grouped:
// reading in one line, each change or proposal on its own, and at the end
// what changed — or "nothing changed".
import type { ActionReport } from "./assistant";

/** What became of a step that writes, as the user sees it now. */
export type StepState = "done" | "failed" | "unknown" | "waiting" | "confirmed" | "rejected" | "expired" | "decided" | "proposal_failed";

export interface ReadLine {
  tool: string;
  calls: number;
  /** Objects found or read (emails, files, events), when the tools said. */
  count: number;
  /** Search words and the like, at most three. */
  words: string[];
  failed: boolean;
}

export interface ReportView {
  reads: ReadLine[];
  /** Steps that write (or tried to), in order. */
  actions: { tool: string; state: StepState }[];
  /** Tools that changed something (ran, or a proposal the user confirmed). */
  changed: string[];
  /** Proposals still waiting for the user. */
  waiting: number;
  steps: number;
  /** The answer claims something was done although nothing was changed or proposed. */
  warn: boolean;
}

/** Arguments worth showing for a read: what was searched or opened, not ids. */
const WORD_KEYS = ["query", "q", "text", "from", "to", "folder", "path", "name", "room", "channel", "what"];
const MAX_WORDS = 3;

function wordsOf(args: Record<string, unknown> | undefined): string[] {
  if (!args) return [];
  const out: string[] = [];
  for (const key of WORD_KEYS) {
    const v = args[key];
    if (typeof v === "string" && v.trim() && v.length <= 60) out.push(v.trim());
  }
  return out;
}

/** A proposal's state in the panel right now (live card), mapped to what the report says. */
function fromLive(state: string): StepState | undefined {
  if (state === "done" || state === "done_invited" || state === "invite_failed") return "confirmed";
  if (state === "rejected") return "rejected";
  if (state === "expired") return "expired";
  if (state === "already") return "decided";
  if (state === "failed" || state === "memory_full" || state === "memory_off" || state === "schedule_limit") return "proposal_failed";
  if (state === "pending" || state === "running") return "waiting";
  return undefined;
}

const FROM_OUTCOME: Record<string, StepState> = { done: "confirmed", rejected: "rejected", expired: "expired", failed: "proposal_failed", pending: "waiting" };

/**
 * The report as the panel shows it. `live`: states of the proposal cards of
 * this answer (by proposal id); they win over what the chat stored.
 */
export function reportView(report: ActionReport, live: Record<string, string> = {}): ReportView {
  const reads = new Map<string, ReadLine>();
  const actions: ReportView["actions"] = [];
  for (const step of report.steps) {
    if (step.kind === "read") {
      const line = reads.get(step.tool) ?? { tool: step.tool, calls: 0, count: 0, words: [], failed: false };
      line.calls++;
      line.count += step.count ?? 0;
      for (const w of wordsOf(step.args)) if (line.words.length < MAX_WORDS && !line.words.includes(w)) line.words.push(w);
      if (step.status === "error") line.failed = true;
      reads.set(step.tool, line);
      continue;
    }
    let state: StepState;
    if (step.kind === "unknown") state = "unknown";
    else if (step.status === "error") state = "failed";
    else if (step.status === "ok") state = "done";
    else state = (step.proposalId && fromLive(live[step.proposalId] ?? "")) || (step.outcome ? FROM_OUTCOME[step.outcome] : undefined) || "waiting";
    actions.push({ tool: step.tool, state });
  }
  const changed = [...new Set(actions.filter((a) => a.state === "done" || a.state === "confirmed").map((a) => a.tool))];
  return {
    reads: [...reads.values()],
    actions,
    changed,
    waiting: actions.filter((a) => a.state === "waiting").length,
    steps: report.steps.length,
    warn: report.claimMismatch && changed.length === 0,
  };
}
