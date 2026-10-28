"use client";

// Step 69: the assistant proposes to delete a draft it saved (delete_draft);
// nothing happens until the user confirms it here.
import { Button } from "@/components/ui/button";
import { Check, Paperclip, Trash2 } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { ProposalSummary } from "@/lib/xenaxio/assistant";
import { useXT } from "@/lib/xenaxio/i18n";

export interface DraftProposal {
  id: string;
  tool: string;
  summary: ProposalSummary;
  state: string;
}

export function DraftDeleteCard({ proposal, onDecide }: { proposal: DraftProposal; onDecide: (p: DraftProposal, confirm: boolean) => void }) {
  const t = useXT();
  const s = proposal.summary;
  const label = (key: string) => t(`assistant.draft.${key}`);
  const settled = proposal.state !== "pending" && proposal.state !== "running";
  const done = proposal.state === "done";
  const stateText = done ? label("done") : proposal.state === "failed" ? label("failed") : t(`assistant.proposal.${proposal.state}`);
  const to = s.to ?? [];
  const attachments = s.attachments ?? [];
  return (
    <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-sm">
        <Trash2 className="h-4 w-4 text-destructive" />
        {label("title_delete")}
      </p>
      <p className={cn("font-medium text-sm break-words", done && "line-through")}>{s.subject || label("no_subject")}</p>
      <dl className="grid grid-cols-[auto,1fr] gap-x-2 gap-y-1">
        {to.length > 0 ? (
          <>
            <dt className="text-muted-foreground">{label("to")}</dt>
            <dd className="break-words">{to.join(", ")}</dd>
          </>
        ) : null}
        {attachments.length > 0 ? (
          <>
            <dt className="text-muted-foreground">{label("attachments")}</dt>
            <dd className="flex min-w-0 items-start gap-1 break-words">
              <Paperclip className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{attachments.join(", ")}</span>
            </dd>
          </>
        ) : null}
      </dl>
      {s.preview ? <p className="line-clamp-3 border-l-2 border-border pl-2 whitespace-pre-line break-words text-muted-foreground">{s.preview}</p> : null}
      {proposal.state === "pending" && <p className="text-muted-foreground">{label("note")}</p>}
      {settled ? (
        <p className={cn(done ? "text-primary" : "text-muted-foreground", "flex items-center gap-1")}>
          {done && <Check className="h-3.5 w-3.5" />}
          {stateText}
        </p>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" variant="destructive" disabled={proposal.state === "running"} onClick={() => onDecide(proposal, true)}>
            {proposal.state === "running" ? label("running") : label("confirm")}
          </Button>
          <Button size="sm" variant="outline" disabled={proposal.state === "running"} onClick={() => onDecide(proposal, false)}>
            {t("assistant.proposal.reject")}
          </Button>
        </div>
      )}
    </div>
  );
}
