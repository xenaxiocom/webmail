"use client";

// xenaxio step 90, part F: the installation's models in the operator console —
// the chat model Xenaxio answers with, the models a company admin may choose,
// and the speech model: Mistral (Voxtral) with the platform's key, or the
// installation's own Whisper server (then nothing goes to Mistral, and its
// minutes count in each company's AI allowance). The choice overrides the
// deploy variables; "back to the deploy" restores them. The Mistral key stays a
// deploy secret and is never shown here.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice, Spinner } from "@/components/xenaxio/ui";
import { errorKey, type InstallationModels, xenaxio } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";

const field = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export function OperatorModels() {
  const t = useXT();
  const [data, setData] = useState<InstallationModels | null>(null);
  const [available, setAvailable] = useState<string[]>([]);
  const [chatModel, setChatModel] = useState("");
  const [models, setModels] = useState("");
  const [source, setSource] = useState<"mistral" | "own">("mistral");
  const [speechModel, setSpeechModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [profile, setProfile] = useState<"openai" | "mistral">("openai");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const fill = useCallback((d: InstallationModels) => {
    setData(d);
    setChatModel(d.chat.model);
    setModels(d.chat.models.join(", "));
    setSource(d.speech.source);
    setSpeechModel(d.speech.model);
    setBaseUrl(d.speech.source === "own" ? d.speech.baseUrl : "");
    setProfile(d.speech.source === "own" ? d.speech.profile : "openai");
    setKey("");
  }, []);
  useEffect(() => {
    xenaxio.operator
      .models()
      .then(fill)
      .catch((err: unknown) => setMessage({ kind: "error", text: t(errorKey(err)) }));
    xenaxio.operator
      .availableModels()
      .then(setAvailable)
      .catch(() => setAvailable([]));
  }, [fill, t]);

  const run = async (action: () => Promise<InstallationModels | void>, ok: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await action();
      if (next) fill(next);
      setMessage({ kind: "success", text: ok });
    } catch (err) {
      setMessage({ kind: "error", text: t(errorKey(err)) });
    } finally {
      setBusy(false);
    }
  };
  const test = async (kind: "chat" | "speech") => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await xenaxio.operator.testModels(kind, kind === "chat" ? chatModel : undefined);
      setMessage(r.ok ? { kind: "success", text: t("operator.models_test_ok", { ms: r.ms ?? 0 }) } : { kind: "error", text: t("operator.models_test_failed", { error: r.error ?? "" }) });
    } finally {
      setBusy(false);
    }
  };

  if (!data) return message ? <Notice kind={message.kind}>{message.text}</Notice> : <Spinner label={t("common.loading")} />;
  const list = models.split(",").map((m) => m.trim()).filter(Boolean);
  return (
    <div className="space-y-6">
      <Notice kind="info">{t("operator.models_intro")}</Notice>
      {!data.platformKey && <Notice kind="info">{t("operator.models_no_key")}</Notice>}
      {available.length > 0 && (
        <datalist id="operator-models-available">
          {available.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      )}
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="font-medium">{t("operator.models_chat")}</h2>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("operator.models_default")}</span>
          <input className={`${field} font-mono`} list="operator-models-available" value={chatModel} maxLength={200} disabled={busy} onChange={(e) => setChatModel(e.target.value)} />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("operator.models_allowed")}</span>
          <input className={`${field} font-mono`} value={models} disabled={busy} onChange={(e) => setModels(e.target.value)} />
          <span className="block text-xs text-muted-foreground">{t("operator.models_from_config", { model: data.chat.fromConfig.model, models: data.chat.fromConfig.models.join(", ") })}</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy || !chatModel.trim() || list.length === 0} onClick={() => void run(() => xenaxio.operator.saveModels({ chatModel: chatModel.trim(), models: list }), t("operator.saved"))}>
            {t("operator.save")}
          </Button>
          <Button size="sm" variant="outline" disabled={busy || !data.platformKey} onClick={() => void test("chat")}>
            {t("operator.models_test")}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => xenaxio.operator.saveModels({ chatModel: null, models: null }), t("operator.saved"))}>
            {t("operator.models_reset")}
          </Button>
        </div>
      </section>
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="font-medium">{t("operator.models_speech")}</h2>
        <div role="radiogroup" className="space-y-2 text-sm">
          <label className="flex items-start gap-2">
            <input type="radio" name="speech-source" className="mt-1" checked={source === "mistral"} disabled={busy} onChange={() => setSource("mistral")} />
            <span>
              <span className="font-medium">{t("operator.models_speech_mistral")}</span>
              <span className="block text-xs text-muted-foreground">{t("operator.models_speech_mistral_hint", { model: data.speech.fromConfig })}</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="speech-source" className="mt-1" checked={source === "own"} disabled={busy} onChange={() => setSource("own")} />
            <span>
              <span className="font-medium">{t("operator.models_speech_own")}</span>
              <span className="block text-xs text-muted-foreground">{t("operator.models_speech_own_hint")}</span>
            </span>
          </label>
        </div>
        {source === "own" && (
          <>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">{t("aiadmin.speech_url")}</span>
              <input className={`${field} font-mono`} placeholder="https://whisper.example.com/v1" value={baseUrl} maxLength={500} disabled={busy} onChange={(e) => setBaseUrl(e.target.value)} />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">{t("aiadmin.speech_profile")}</span>
              <select className={field} value={profile} disabled={busy} onChange={(e) => setProfile(e.target.value as "openai" | "mistral")}>
                <option value="openai">{t("aiadmin.speech_profile_openai")}</option>
                <option value="mistral">{t("aiadmin.speech_profile_mistral")}</option>
              </select>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">{t("aiadmin.speech_key")}</span>
              <input
                type="password"
                autoComplete="off"
                className={field}
                placeholder={data.speech.source === "own" && data.speech.hasKey ? t("aiadmin.speech_key_kept") : t("aiadmin.speech_key_none")}
                value={key}
                maxLength={2000}
                disabled={busy}
                onChange={(e) => setKey(e.target.value)}
              />
            </label>
          </>
        )}
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("aiadmin.speech_model")}</span>
          <input className={`${field} font-mono`} list={source === "mistral" ? "operator-models-available" : undefined} value={speechModel} maxLength={200} disabled={busy} onChange={(e) => setSpeechModel(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy || !speechModel.trim() || (source === "own" && !baseUrl.trim())}
            onClick={() =>
              void run(
                () =>
                  xenaxio.operator.saveModels({
                    speech:
                      source === "own"
                        ? { source, baseUrl: baseUrl.trim(), profile, model: speechModel.trim(), ...(key ? { apiKey: key } : {}) }
                        : { source, model: speechModel.trim() === data.speech.fromConfig ? null : speechModel.trim() },
                  }),
                t("operator.saved"),
              )
            }
          >
            {t("operator.save")}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void test("speech")}>
            {t("operator.models_test")}
          </Button>
        </div>
      </section>
      {message && <Notice kind={message.kind}>{message.text}</Notice>}
    </div>
  );
}
