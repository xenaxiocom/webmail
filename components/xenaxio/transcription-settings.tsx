"use client";

// Step 86: in "Verwaltung → KI" the admin chooses how audio files in Files are
// transcribed: the platform's speech model (Mistral Voxtral, EU), a speech model
// on the company's own server (the connection of its own model), or not at all.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/xenaxio/ui";
import { errorText, type TranscriptionMode, xenaxio } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";

export function TranscriptionSettings({
  value,
  hasOwnServer,
  onSaved,
}: {
  value: { mode: TranscriptionMode; platformModel: string | null; customModel: string | null };
  /** The company stored its own model's connection (step 44). */
  hasOwnServer: boolean;
  onSaved: () => Promise<void>;
}) {
  const t = useXT();
  const [mode, setMode] = useState<TranscriptionMode>(value.mode);
  const [model, setModel] = useState(value.customModel ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  useEffect(() => {
    setMode(value.mode);
    setModel(value.customModel ?? "");
  }, [value.mode, value.customModel]);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await xenaxio.setTranscription(mode === "custom" ? { mode, model: model.trim() || null } : { mode });
      setMessage({ kind: "success", text: t("aiadmin.saved") });
      await onSaved();
    } catch (err) {
      setMessage({ kind: "error", text: errorText(t, err) });
    } finally {
      setBusy(false);
    }
  };

  const options: { mode: TranscriptionMode; label: string; hint: string; disabled?: boolean }[] = [
    { mode: "xenaxio", label: t("aiadmin.transcription_xenaxio"), hint: t("aiadmin.transcription_xenaxio_hint", { model: value.platformModel ?? "—" }), disabled: !value.platformModel },
    { mode: "custom", label: t("aiadmin.transcription_custom"), hint: t(hasOwnServer ? "aiadmin.transcription_custom_hint" : "aiadmin.transcription_custom_missing"), disabled: !hasOwnServer },
    { mode: "off", label: t("aiadmin.transcription_off"), hint: t("aiadmin.transcription_off_hint") },
  ];
  const changed = mode !== value.mode || (mode === "custom" && model.trim() !== (value.customModel ?? ""));

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-labelledby="ai-transcription-title">
      <div className="space-y-1">
        <h2 id="ai-transcription-title" className="font-medium">
          {t("aiadmin.transcription_title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("aiadmin.transcription_intro")}</p>
      </div>
      <div role="radiogroup" aria-labelledby="ai-transcription-title" className="space-y-2">
        {options.map((o) => (
          <label key={o.mode} className={`flex items-start gap-2 text-sm ${o.disabled ? "opacity-60" : "cursor-pointer"}`}>
            <input type="radio" name="ai-transcription" className="mt-1" checked={mode === o.mode} disabled={busy || o.disabled} onChange={() => setMode(o.mode)} />
            <span>
              <span className="font-medium">{o.label}</span>
              <span className="block text-xs text-muted-foreground">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
      {mode === "custom" && (
        <div className="space-y-1">
          <label htmlFor="ai-transcription-model" className="text-sm font-medium">
            {t("aiadmin.transcription_model")}
          </label>
          <input
            id="ai-transcription-model"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
            placeholder="whisper-large-v3"
            value={model}
            maxLength={200}
            disabled={busy}
            onChange={(e) => setModel(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("aiadmin.transcription_model_hint")}</p>
        </div>
      )}
      <Button disabled={busy || !changed || (mode === "custom" && !model.trim())} onClick={() => void save()}>
        {t("aiadmin.transcription_save")}
      </Button>
      {message && <Notice kind={message.kind}>{message.text}</Notice>}
    </section>
  );
}
