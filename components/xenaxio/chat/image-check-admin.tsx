"use client";

// Step 108, part C3: the admin decides whether pictures sent in the company's
// chat are checked by Xenaxio's own model (XenRooms Free: always on). People
// at Xenaxio see only pictures the model flags, without text, channel or sender.
import { useEffect, useState } from "react";
import { Notice } from "@/components/xenaxio/ui";
import { errorText, xenaxio } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";

export function ImageCheckAdmin() {
  const t = useXT();
  const [state, setState] = useState<{ enabled: boolean; forced: boolean; available: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    xenaxio.imageCheck().then(setState, (err) => setError(errorText(t, err)));
  }, [t]);
  if (!state && !error) return null;
  const change = async (enabled: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setState(await xenaxio.setImageCheck(enabled));
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-2 rounded-lg border border-border bg-card p-4">
      <h2 className="font-medium">{t("chatadmin.image_check_title")}</h2>
      <p className="text-sm text-muted-foreground">{t("chatadmin.image_check_text")}</p>
      {state && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={state.enabled} disabled={busy || state.forced} onChange={(e) => void change(e.target.checked)} />
          {t("chatadmin.image_check_toggle")}
        </label>
      )}
      {state?.forced && <p className="text-xs text-muted-foreground">{t("chatadmin.image_check_forced")}</p>}
      {state && !state.available && <p className="text-xs text-muted-foreground">{t("chatadmin.image_check_unavailable")}</p>}
      {error && <Notice kind="error">{error}</Notice>}
    </section>
  );
}
