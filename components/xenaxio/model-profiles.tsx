"use client";

// Step 84: in "Verwaltung → KI" the admin picks a model for each profile —
// fast (short answers, sorting), vision (scans, photos), smart (checking,
// letters, long tasks). Flows and agents ask for a profile; unset is the
// company's model.
import { useState } from "react";
import { Notice } from "@/components/xenaxio/ui";
import { errorText, type ModelProfile, xenaxio } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";

export function ModelProfiles({ value, companyModel, onSaved }: { value: { map: Partial<Record<ModelProfile, string>>; options: string[]; names: ModelProfile[] }; companyModel: string; onSaved: () => Promise<void> }) {
  const t = useXT();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const pick = async (profile: ModelProfile, model: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await xenaxio.saveModelProfiles({ [profile]: model || null });
      setMessage({ kind: "success", text: t("aiadmin.saved") });
      await onSaved();
    } catch (err) {
      setMessage({ kind: "error", text: errorText(t, err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4" aria-labelledby="ai-profiles-title">
      <div className="space-y-1">
        <h2 id="ai-profiles-title" className="font-medium">
          {t("aiadmin.profiles_title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("aiadmin.profiles_intro")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {value.names.map((profile) => {
          const current = value.map[profile] ?? "";
          // A model that is no longer offered still shows, so the admin sees what is set.
          const options = current && !value.options.includes(current) ? [...value.options, current] : value.options;
          return (
            <div key={profile} className="space-y-1">
              <label htmlFor={`ai-profile-${profile}`} className="text-sm font-medium">
                {t(`aiadmin.profile_${profile}`)}
              </label>
              <select
                id={`ai-profile-${profile}`}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={current}
                disabled={busy}
                onChange={(e) => void pick(profile, e.target.value)}
              >
                <option value="">{t("aiadmin.profile_default", { model: companyModel })}</option>
                {options.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{t(`aiadmin.profile_${profile}_hint`)}</p>
            </div>
          );
        })}
      </div>
      {message && <Notice kind={message.kind}>{message.text}</Notice>}
    </section>
  );
}
