"use client";

// xenaxio, step 78: the admin turns video meetings on or off for the company
// and decides whether guests without an account may come (lobby). The limits
// come from the operator.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice, Spinner } from "@/components/xenaxio/ui";
import { WorkspaceShell } from "@/components/xenaxio/workspace-shell";
import { Link } from "@/i18n/navigation";
import { XenaxioApiError } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";
import { meet, type MeetSettings } from "@/lib/xenaxio/meet";
import { setMeetNavEnabled } from "@/lib/xenaxio/meet-nav";

function MeetingsSettings() {
  const t = useXT();
  const [data, setData] = useState<MeetSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorOf = useCallback(
    (err: unknown) => {
      const code = err instanceof XenaxioApiError ? err.code : "internal";
      const text = t(`meet.errors.${code}`);
      return text === `meet.errors.${code}` ? t("meet.errors.internal") : text;
    },
    [t],
  );

  useEffect(() => {
    meet
      .settings()
      .then(setData)
      .catch((err: unknown) => setError(errorOf(err)));
  }, [errorOf]);

  const save = async (change: { enabled?: boolean; guests?: boolean }) => {
    if (change.enabled === false && !window.confirm(t("meetadmin.switch_off_confirm"))) return;
    setBusy(true);
    setError(null);
    try {
      const next = await meet.saveSettings(change);
      setData(next);
      // The "Meetings" entry of the menu appears (or goes) right away, not only after a reload.
      setMeetNavEnabled(next.enabled);
    } catch (err) {
      setError(errorOf(err));
    } finally {
      setBusy(false);
    }
  };

  if (!data) return error ? <Notice kind="error">{error}</Notice> : <Spinner label={t("common.loading")} />;
  const usable = data.available && data.allowed;
  return (
    <div className="max-w-2xl space-y-6">
      {error && <Notice kind="error">{error}</Notice>}
      {!data.available && <Notice kind="info">{t("meetadmin.unavailable")}</Notice>}
      {data.available && !data.allowed && <Notice kind="info">{t("meetadmin.forbidden")}</Notice>}
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">{t("meetadmin.intro")}</p>
        <p className="text-sm font-medium">{data.enabled ? t("meetadmin.on") : t("meetadmin.off")}</p>
        <p className="text-xs text-muted-foreground">{t("meetadmin.limits", { participants: data.maxParticipants, hours: data.maxHours })}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant={data.enabled ? "outline" : "default"} disabled={busy || (!data.enabled && !usable)} onClick={() => void save({ enabled: !data.enabled })}>
            {data.enabled ? t("meetadmin.switch_off") : t("meetadmin.switch_on")}
          </Button>
          {data.enabled && (
            <Link href="/meetings" className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-primary hover:underline">
              {t("meetadmin.open")}
            </Link>
          )}
        </div>
        <label htmlFor="meet-guests" className="flex cursor-pointer items-start gap-3 border-t border-border pt-3">
          <input id="meet-guests" type="checkbox" className="mt-1 h-4 w-4" checked={data.guests} disabled={busy} onChange={(e) => void save({ guests: e.target.checked })} />
          <span className="space-y-0.5">
            <span className="block text-sm font-medium">{t("meetadmin.guests")}</span>
            <span className="block text-xs text-muted-foreground">{t("meetadmin.guests_hint")}</span>
          </span>
        </label>
      </section>
    </div>
  );
}

export default function MeetingsAdminPage() {
  const t = useXT();
  return (
    <WorkspaceShell title={t("meetadmin.title")} backHref="/workspace" requireAdmin>
      <MeetingsSettings />
    </WorkspaceShell>
  );
}
