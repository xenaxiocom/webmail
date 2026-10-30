"use client";

// Step 86: in "Verwaltung → KI" the admin chooses how audio files in Files are
// transcribed: the platform's speech model (Mistral Voxtral, EU), a speech model
// on the company's own server (the connection of its own model), or not at all.
// Step 90, part E: or the company's own speech server with its own connection
// (address, kind, model, key), chosen only after its connection test passed.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/xenaxio/ui";
import { errorText, type SpeechServerSettings, type TranscriptionMode, xenaxio } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";

/** Step 90, part E: the own speech server's connection, its test and the result. */
function SpeechServerForm({ value, onChanged }: { value: SpeechServerSettings | null; onChanged: () => Promise<void> }) {
  const t = useXT();
  const [baseUrl, setBaseUrl] = useState(value?.baseUrl ?? "");
  const [profile, setProfile] = useState<"openai" | "mistral">(value?.profile ?? "openai");
  const [model, setModel] = useState(value?.model ?? "");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const check = value?.check ?? null;
  const run = async (action: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      if (ok) setMessage({ kind: "success", text: ok });
      await onChanged();
    } catch (err) {
      setMessage({ kind: "error", text: errorText(t, err) });
    } finally {
      setBusy(false);
    }
  };
  const field = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("aiadmin.speech_url")}</span>
        <input className={`${field} font-mono`} placeholder="https://stt.example.com/v1" value={baseUrl} maxLength={500} disabled={busy} onChange={(e) => setBaseUrl(e.target.value)} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("aiadmin.speech_profile")}</span>
        <select className={field} value={profile} disabled={busy} onChange={(e) => setProfile(e.target.value as "openai" | "mistral")}>
          <option value="openai">{t("aiadmin.speech_profile_openai")}</option>
          <option value="mistral">{t("aiadmin.speech_profile_mistral")}</option>
        </select>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("aiadmin.speech_model")}</span>
        <input className={`${field} font-mono`} placeholder="whisper-large-v3-turbo" value={model} maxLength={200} disabled={busy} onChange={(e) => setModel(e.target.value)} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("aiadmin.speech_key")}</span>
        <input type="password" autoComplete="off" className={field} placeholder={value?.hasKey ? t("aiadmin.speech_key_kept") : t("aiadmin.speech_key_none")} value={key} maxLength={2000} disabled={busy} onChange={(e) => setKey(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy || !baseUrl.trim() || !model.trim()} onClick={() => void run(() => xenaxio.saveSpeechServer({ baseUrl: baseUrl.trim(), profile, model: model.trim(), ...(key ? { apiKey: key } : {}) }), t("aiadmin.saved"))}>
          {t("aiadmin.speech_save")}
        </Button>
        <Button variant="outline" disabled={busy || !value} onClick={() => void run(() => xenaxio.testSpeechServer())}>
          {t("aiadmin.speech_test")}
        </Button>
        {value && (
          <Button variant="ghost" disabled={busy} onClick={() => void run(() => xenaxio.removeSpeechServer(), t("aiadmin.speech_removed"))}>
            {t("aiadmin.speech_remove")}
          </Button>
        )}
      </div>
      {check && (
        <Notice kind={check.ok ? "success" : "error"}>
          {check.ok ? t("aiadmin.speech_check_ok", { ms: check.ms ?? 0 }) : t(`aiadmin.speech_check_${check.error ?? "bad_response"}`, { status: check.status ?? "" })}
        </Notice>
      )}
      {!check && value && <p className="text-xs text-muted-foreground">{t("aiadmin.speech_untested")}</p>}
      {message && <Notice kind={message.kind}>{message.text}</Notice>}
    </div>
  );
}

export function TranscriptionSettings({
  value,
  hasOwnServer,
  onSaved,
}: {
  value: { mode: TranscriptionMode; platformModel: string | null; customModel: string | null; ownServer?: SpeechServerSettings | null };
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
    { mode: "own_server", label: t("aiadmin.transcription_own_server"), hint: t(value.ownServer?.check?.ok ? "aiadmin.transcription_own_server_hint" : "aiadmin.transcription_own_server_missing") },
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
      {mode === "own_server" && <SpeechServerForm value={value.ownServer ?? null} onChanged={onSaved} />}
      <Button disabled={busy || !changed || (mode === "custom" && !model.trim()) || (mode === "own_server" && !value.ownServer?.check?.ok)} onClick={() => void save()}>
        {t("aiadmin.transcription_save")}
      </Button>
      {message && <Notice kind={message.kind}>{message.text}</Notice>}
    </section>
  );
}
