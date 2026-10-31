"use client";

// Step 56: the company admin switches online booking on or off and gives the
// company's imprint and privacy policy, shown on its public booking pages.
// Step 77: new bookings and requests can go to Salesforce as leads (Web-to-Lead).
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/xenaxio/ui";
import { errorText } from "@/lib/xenaxio/api";
import { type AdminBooking, booking, type BookingTheme } from "@/lib/xenaxio/booking";
import { useXT } from "@/lib/xenaxio/i18n";

const view = (s: AdminBooking) => ({
  enabled: s.enabled,
  imprintUrl: s.imprintUrl ?? "",
  privacyUrl: s.privacyUrl ?? "",
  theme: s.theme ?? "auto",
  salesforceOrgId: s.salesforceOrgId ?? "",
  leadSource: s.leadSource ?? "",
});

export function BookingAdmin() {
  const t = useXT();
  const [state, setState] = useState<ReturnType<typeof view> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    booking
      .admin()
      .then((s) => setState(view(s)))
      .catch(() => setError(t("errors.internal")));
  }, [t]);

  const save = async (patch: Partial<AdminBooking>) => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const s = await booking.setAdmin(patch);
      setState(view(s));
      setSaved(true);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (state) void save({ imprintUrl: state.imprintUrl.trim(), privacyUrl: state.privacyUrl.trim() });
  };

  const submitSalesforce = (e: FormEvent) => {
    e.preventDefault();
    if (state) void save({ salesforceOrgId: state.salesforceOrgId.trim() || null, leadSource: state.leadSource.trim() || null });
  };

  return (
    <section className="mt-6 space-y-3 rounded-lg border border-border bg-card p-4">
      <div>
        <h2 className="font-medium">{t("booking_admin.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("booking_admin.description")}</p>
      </div>
      {state && (
        <form onSubmit={submit} className="space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={state.enabled} disabled={busy} onChange={(e) => void save({ enabled: e.target.checked })} />
            <span>
              {t("booking_admin.enabled")}
              <span className="block text-xs text-muted-foreground">{t("booking_admin.enabled_hint")}</span>
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("booking_admin.theme")}</span>
            <select
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              value={state.theme}
              disabled={busy}
              onChange={(e) => void save({ theme: e.target.value as BookingTheme })}
            >
              {(["auto", "light", "dark"] as const).map((th) => (
                <option key={th} value={th}>
                  {t(`booking_admin.theme_${th}`)}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted-foreground">{t("booking_admin.theme_hint")}</span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("booking_admin.imprint")}</span>
            <Input type="url" placeholder="https://firma.de/impressum" value={state.imprintUrl} onChange={(e) => setState({ ...state, imprintUrl: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("booking_admin.privacy")}</span>
            <Input type="url" placeholder="https://firma.de/datenschutz" value={state.privacyUrl} onChange={(e) => setState({ ...state, privacyUrl: e.target.value })} />
          </label>
          {state.enabled && !state.privacyUrl && <Notice kind="info">{t("booking_admin.privacy_missing")}</Notice>}
          <Button type="submit" disabled={busy}>
            {t("booking_admin.save")}
          </Button>
        </form>
      )}
      {state && (
        <form onSubmit={submitSalesforce} className="space-y-3 border-t border-border pt-3" aria-label={t("booking_admin.salesforce")}>
          <div>
            <h3 className="text-sm font-medium">{t("booking_admin.salesforce")}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t("booking_admin.salesforce_hint")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{t("booking_admin.salesforce_org")}</span>
              <Input
                placeholder="00D…"
                maxLength={18}
                autoComplete="off"
                spellCheck={false}
                value={state.salesforceOrgId}
                onChange={(e) => setState({ ...state, salesforceOrgId: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{t("booking_admin.lead_source")}</span>
              <Input
                placeholder={t("booking_admin.lead_source_placeholder")}
                maxLength={100}
                value={state.leadSource}
                onChange={(e) => setState({ ...state, leadSource: e.target.value })}
              />
            </label>
          </div>
          <Button type="submit" disabled={busy}>
            {t("booking_admin.salesforce_save")}
          </Button>
        </form>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      {saved && !error && <Notice kind="success">{t("booking_admin.saved")}</Notice>}
    </section>
  );
}
