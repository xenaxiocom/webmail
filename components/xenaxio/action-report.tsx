"use client";

// Step 101: "Was ich getan habe" under every answer of the assistant — built
// by the platform from the tool calls, not from the model's words. One line
// when closed ("3 Schritte · Nichts geändert"); it opens by itself when the
// answer claims something was done although nothing was changed.
import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { ActionReport } from "@/lib/xenaxio/assistant";
import { reportView, type StepState } from "@/lib/xenaxio/action-report";
import { useXT } from "@/lib/xenaxio/i18n";
import { useToolLabel } from "./tool-permissions";

const STATE_CLASS: Partial<Record<StepState, string>> = {
  done: "text-green-700 dark:text-green-400",
  confirmed: "text-green-700 dark:text-green-400",
  failed: "text-destructive",
  proposal_failed: "text-destructive",
  unknown: "text-destructive",
};

export function ActionReportView({ report, live }: { report: ActionReport; live?: Record<string, string> }) {
  const t = useXT();
  const label = useToolLabel();
  const view = reportView(report, live);
  const [open, setOpen] = useState(view.warn);
  const names = (tools: string[]) => tools.map(label).join(", ");
  const outcome = view.changed.length
    ? t("assistant.actions.changed", { what: names(view.changed) })
    : view.waiting
      ? t("assistant.actions.waiting")
      : t("assistant.actions.nothing_changed");
  const steps = view.steps === 0 ? t("assistant.actions.no_tools") : view.steps === 1 ? t("assistant.actions.one_step") : t("assistant.actions.steps", { count: String(view.steps) });

  return (
    <div className={cn("rounded-md border text-xs", view.warn ? "border-destructive/50 bg-destructive/5" : "border-border")} data-testid="action-report">
      <button
        type="button"
        className="flex w-full items-center gap-1 px-2 py-1 text-left text-muted-foreground hover:text-foreground"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="h-3 w-3 shrink-0" aria-hidden /> : <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />}
        <span className="font-medium">{t("assistant.actions.title")}</span>
        <span aria-hidden>·</span>
        <span>{steps}</span>
        <span aria-hidden>·</span>
        <span className={cn(view.changed.length && "text-green-700 dark:text-green-400")}>{outcome}</span>
      </button>
      {open && (
        <div className="space-y-1 border-t border-border px-2 py-1.5">
          {view.warn && (
            <p className="flex items-start gap-1.5 font-medium text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {t("assistant.actions.warning")}
            </p>
          )}
          <ul className="space-y-0.5">
            {view.reads.map((r) => (
              <li key={r.tool} className={cn(r.failed && "text-destructive")}>
                {label(r.tool)}
                {r.calls > 1 && ` ×${r.calls}`}
                {r.words.length > 0 && `: ${r.words.map((w) => `„${w}“`).join(", ")}`}
                {r.count > 0 && ` — ${t("assistant.actions.found", { count: String(r.count) })}`}
                {r.failed && ` — ${t("assistant.actions.state_failed")}`}
              </li>
            ))}
            {view.actions.map((a, i) => (
              <li key={`${a.tool}-${i}`} className={STATE_CLASS[a.state]}>
                {a.state === "unknown" ? t("assistant.actions.state_unknown", { tool: a.tool }) : `${label(a.tool)}: ${t(`assistant.actions.state_${a.state}`)}`}
              </li>
            ))}
          </ul>
          <p className={cn("font-medium", view.changed.length ? "text-green-700 dark:text-green-400" : "text-foreground")}>{outcome}</p>
        </div>
      )}
    </div>
  );
}
