"use client";

// Step 85, part B: the card of a proposal to change one of the user's own
// settings — the signature or the out-of-office reply — with the value as it
// was and as it will be. Nothing changes until the user confirms.
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Check, PalmtreeIcon, PenLine } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { ProposalSummary } from "@/lib/xenaxio/assistant";
import { useXT } from "@/lib/xenaxio/i18n";
import { formatRun } from "./schedule-card";

interface OutOfOffice {
  enabled: boolean;
  from: string | null;
  until: string | null;
  subject: string | null;
  text: string | null;
}

interface SettingSummary {
  setting: "signature" | "out_of_office";
  email?: string;
  text?: string | null;
  enabled?: boolean;
  from?: string | null;
  until?: string | null;
  subject?: string | null;
  before?: { text?: string } & Partial<OutOfOffice>;
}

export interface SettingProposal {
  id: string;
  tool: string;
  summary: ProposalSummary;
  state: string;
}

/** The proposal is a change of one of the user's own settings. */
export function isSettingProposal(summary: ProposalSummary): boolean {
  const setting = (summary as { setting?: unknown }).setting;
  return setting === "signature" || setting === "out_of_office";
}

/** When the reply applies, in words. */
export function periodText(t: (key: string, values?: Record<string, string>) => string, locale: string, from: string | null | undefined, until: string | null | undefined): string {
  const f = from ? formatRun(from, locale) : "";
  const u = until ? formatRun(until, locale) : "";
  if (f && u) return t("assistant.setting.from_until", { from: f, until: u });
  if (f) return t("assistant.setting.from_only", { from: f });
  if (u) return t("assistant.setting.until_only", { until: u });
  return t("assistant.setting.always");
}

function Text({ value, old }: { value: string | null | undefined; old?: boolean }) {
  const t = useXT();
  return (
    <p className={cn("border-l-2 pl-2 break-words whitespace-pre-wrap", old ? "border-border text-muted-foreground line-through" : "border-primary/40 text-sm")}>
      {value?.trim() ? value : t("assistant.setting.empty")}
    </p>
  );
}

export function SettingCard({ proposal, locale, onDecide }: { proposal: SettingProposal; locale: string; onDecide: (confirm: boolean) => void }) {
  const t = useXT();
  const s = proposal.summary as unknown as SettingSummary;
  const signature = s.setting === "signature";
  const settled = proposal.state !== "pending" && proposal.state !== "running";
  const done = proposal.state === "done";
  const title = signature ? t(s.text ? "assistant.setting.signature_title" : "assistant.setting.signature_remove") : t(s.enabled ? "assistant.setting.out_on" : "assistant.setting.out_off");
  const doneText = signature ? t("assistant.setting.signature_done") : t(s.enabled ? "assistant.setting.out_on_done" : "assistant.setting.out_off_done");
  const stateText = done ? doneText : proposal.state === "failed" ? t("assistant.setting.failed") : t(`assistant.proposal.${proposal.state}`);
  const changedText = !signature && s.before && s.before.text !== s.text;

  return (
    <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-sm">
        {signature ? <PenLine className="h-4 w-4 text-primary" /> : <PalmtreeIcon className="h-4 w-4 text-primary" />}
        {title}
      </p>
      {signature ? (
        <>
          <p className="text-muted-foreground">{t("assistant.setting.for", { email: s.email ?? "" })}</p>
          {s.text ? <Text value={s.text} /> : null}
          {s.before?.text?.trim() && s.before.text !== s.text && (
            <>
              <p className="text-muted-foreground">{t("assistant.setting.before")}</p>
              <Text value={s.before.text} old />
            </>
          )}
        </>
      ) : (
        s.enabled && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
            <dt className="text-muted-foreground">{t("assistant.setting.period")}</dt>
            <dd>{periodText(t, locale, s.from, s.until)}</dd>
            <dt className="text-muted-foreground">{t("assistant.setting.subject")}</dt>
            <dd className="break-words">{s.subject?.trim() ? s.subject : t("assistant.setting.empty")}</dd>
            <dt className="text-muted-foreground">{t("assistant.setting.text")}</dt>
            <dd>
              <Text value={s.text} />
              {changedText && s.before?.text?.trim() && <Text value={s.before.text} old />}
            </dd>
          </dl>
        )
      )}
      {settled ? (
        <p className={cn(done ? "text-primary" : "text-muted-foreground", "flex items-center gap-1")}>
          {done && <Check className="h-3.5 w-3.5" />}
          {stateText}
        </p>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" disabled={proposal.state === "running"} onClick={() => onDecide(true)}>
            {proposal.state === "running" ? t("assistant.setting.running") : t("assistant.proposal.confirm")}
          </Button>
          <Button size="sm" variant="outline" disabled={proposal.state === "running"} onClick={() => onDecide(false)}>
            {t("assistant.proposal.reject")}
          </Button>
        </div>
      )}
      <Link href={signature ? "/settings/account" : "/settings/vacation"} className="inline-block text-muted-foreground underline hover:text-foreground">
        {t("assistant.setting.link")}
      </Link>
    </div>
  );
}
