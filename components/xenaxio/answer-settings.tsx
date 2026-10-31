"use client";

// Step 83: in "Verwaltung → KI" the company's admin sets how far the assistant
// may go in one answer (steps and input tokens), within the platform's ceilings.
// The limits apply on the Xenacore engine; "Weiter" picks up after a limit.
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/xenaxio/schedule-settings";
import { Notice } from "@/components/xenaxio/ui";
import { type AnswerSettings as Settings, errorText, xenaxio } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";

export function AnswerSettings({ value, onSaved }: { value: Settings; onSaved: () => Promise<void> }) {
  const t = useXT();
  const { defaults, caps } = value;
  const [steps, setSteps] = useState(value.maxToolCalls ?? defaults.toolCalls);
  const [tokens, setTokens] = useState(value.inputTokens ?? defaults.inputTokens);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const store = async (maxToolCalls: number | null, inputTokens: number | null) => {
    setBusy(true);
    setMessage(null);
    try {
      await xenaxio.saveAnswerSettings({ maxToolCalls, inputTokens });
      setMessage({ kind: "success", text: t("aiadmin.saved") });
      await onSaved();
    } catch (err) {
      setMessage({ kind: "error", text: errorText(t, err) });
    } finally {
      setBusy(false);
    }
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    // The default is stored as "none", so a later change of the default reaches the company.
    void store(steps === defaults.toolCalls ? null : steps, tokens === defaults.inputTokens ? null : tokens);
  };
  const reset = () => {
    setSteps(defaults.toolCalls);
    setTokens(defaults.inputTokens);
    void store(null, null);
  };

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4" aria-labelledby="ai-answers-title">
      <div className="space-y-1">
        <h2 id="ai-answers-title" className="font-medium">
          {t("aiadmin.answers_title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("aiadmin.answers_intro")}</p>
        {value.engine === "classic" && <p className="text-xs text-muted-foreground">{t("aiadmin.answers_classic")}</p>}
      </div>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            id="ai-answers-steps"
            label={t("aiadmin.answers_steps")}
            hint={t("aiadmin.answers_range", { min: caps.toolCalls.min, max: caps.toolCalls.max, def: defaults.toolCalls })}
            value={steps}
            min={caps.toolCalls.min}
            max={caps.toolCalls.max}
            disabled={busy}
            onChange={setSteps}
          />
          <NumberField
            id="ai-answers-tokens"
            label={t("aiadmin.answers_tokens")}
            hint={t("aiadmin.answers_range", { min: caps.inputTokens.min.toLocaleString(), max: caps.inputTokens.max.toLocaleString(), def: defaults.inputTokens.toLocaleString() })}
            value={tokens}
            min={caps.inputTokens.min}
            max={caps.inputTokens.max}
            disabled={busy}
            onChange={setTokens}
          />
        </div>
        {message && <Notice kind={message.kind}>{message.text}</Notice>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            {t("aiadmin.answers_save")}
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={reset}>
            {t("aiadmin.answers_default")}
          </Button>
        </div>
      </form>
    </section>
  );
}
