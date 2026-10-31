"use client";

// xenaxio, step 78: the admin turns video meetings on or off for the company
// and decides whether guests without an account may come (lobby). The limits
// come from the operator.
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { Trash2, Upload } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Notice, Spinner } from "@/components/xenaxio/ui";
import { useMe, WorkspaceShell } from "@/components/xenaxio/workspace-shell";
import { Link } from "@/i18n/navigation";
import { XenaxioApiError } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";
import { type CompanyRecording, meet, type MeetSettings } from "@/lib/xenaxio/meet";
import { formatSize } from "@/lib/xenaxio/admin-files";
import { setMeetNavEnabled } from "@/lib/xenaxio/meet-nav";
import { COMPANY_MOTION_MAX_BYTES, isMotionType, isPanorama, pictureSize, shrinkPicture } from "@/lib/xenaxio/meet-background";
import { withBasePath } from "@/lib/browser-navigation";

/**
 * Step 90, part D: every recording of the company — who recorded what, how
 * big, whether there is a transcript; deleting removes sound and transcript,
 * also from the organizer's Files, and tells the organizer.
 */
function CompanyRecordings() {
  const t = useXT();
  const [list, setList] = useState<CompanyRecording[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    meet
      .recordings()
      .then(setList)
      .catch(() => setList([]));
  }, []);
  if (!list || list.length === 0) return null;
  const remove = async (r: CompanyRecording) => {
    if (!window.confirm(t("meetadmin.recordings_delete_confirm", { meeting: r.meeting, organizer: r.organizer ?? "–" }))) return;
    setError(null);
    try {
      await meet.deleteRecording(r.id);
      setList((l) => (l ?? []).filter((x) => x.id !== r.id));
    } catch (err) {
      const code = err instanceof XenaxioApiError ? err.code : "internal";
      const text = t(`meet.errors.${code}`);
      setError(text === `meet.errors.${code}` ? t("meet.errors.internal") : text);
    }
  };
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">{t("meetadmin.recordings_title")}</h2>
      <p className="text-sm text-muted-foreground">{t("meetadmin.recordings_intro")}</p>
      {error && <Notice kind="error">{error}</Notice>}
      <ul className="divide-y divide-border">
        {list.map((r) => (
          <li key={r.id} className="flex items-start gap-3 py-2">
            <span className="min-w-0 flex-1 text-sm">
              <span className="block truncate font-medium">{r.meeting}</span>
              <span className="block text-xs text-muted-foreground">
                {new Date(r.startedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })} · {r.organizer ?? "–"} · {formatSize(r.bytes, "de")} ·{" "}
                {t(`meetadmin.recordings_transcript_${r.transcript}`)}
              </span>
            </span>
            <Button variant="outline" size="sm" disabled={r.status === "recording"} onClick={() => void remove(r)} aria-label={t("meetadmin.recordings_delete", { meeting: r.meeting })}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MeetingsSettings() {
  const t = useXT();
  const rooms = useMe().tenant.product === "rooms";
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

  const save = async (change: { enabled?: boolean; guests?: boolean; backgroundDefault?: boolean; recording?: boolean }) => {
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

  // Step 92: the company's picture behind employees' cameras. The browser makes it a JPEG
  // of at most 1920 px first, so a photo from a phone fits the platform's 2 MB.
  // Step 93: a GIF or video goes up as it is (10 MB at most); a panorama (twice as
  // wide as high) as a JPEG of at most 6144 px.
  const fileInput = useRef<HTMLInputElement>(null);
  const changeBackground = async (action: () => Promise<MeetSettings>) => {
    setBusy(true);
    setError(null);
    try {
      setData(await action());
    } catch (err) {
      setError(errorOf(err));
    } finally {
      setBusy(false);
    }
  };
  const uploadBackground = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    let picture: Blob;
    try {
      if (isMotionType(file.type)) {
        if (file.size > COMPANY_MOTION_MAX_BYTES) return setError(t("meet.errors.meet_background_too_large"));
        picture = file;
      } else {
        const size = await pictureSize(file);
        if (!size) throw new Error("unreadable");
        picture = isPanorama(size.width, size.height) ? await shrinkPicture(file, 6144, 0.85) : await shrinkPicture(file, 1920);
      }
    } catch {
      setError(t("meet.errors.meet_background_invalid_type"));
      return;
    }
    await changeBackground(() => meet.uploadBackground(picture));
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
        {/* Step 90: recording a meeting's sound; the one who started the meeting switches it on, every time. */}
        {/* Step 109: XenRooms has no recording (no Files to keep it in, step 96). */}
        {data.recordingAvailable && !rooms && (
          <label htmlFor="meet-recording" className="flex cursor-pointer items-start gap-3 border-t border-border pt-3">
            <input
              id="meet-recording"
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={!!data.recording && data.recordingAllowed !== false}
              disabled={busy || data.recordingAllowed === false}
              onChange={(e) => void save({ recording: e.target.checked })}
            />
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">{t("meetadmin.recording")}</span>
              <span className="block text-xs text-muted-foreground">{t(data.recordingAllowed === false ? "meetadmin.recording_forbidden" : "meetadmin.recording_hint")}</span>
            </span>
          </label>
        )}
      </section>
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium">{t("meetadmin.background_title")}</h2>
        <p className="text-sm text-muted-foreground">{t("meetadmin.background_intro")}</p>
        {data.background ? (
          <figure className="space-y-1">
            {data.background.kind === "animation" && data.background.contentType?.startsWith("video/") ? (
              <video src={withBasePath(data.background.url)} muted loop autoPlay playsInline aria-label={t("meetadmin.background_title")} className="aspect-video w-full max-w-sm rounded-md border border-border object-cover" />
            ) : (
              <img src={withBasePath(data.background.url)} alt={t("meetadmin.background_title")} className="aspect-video w-full max-w-sm rounded-md border border-border object-cover" />
            )}
            <figcaption className="text-xs text-muted-foreground">{t(`meetadmin.background_kind_${data.background.kind ?? "image"}`)}</figcaption>
          </figure>
        ) : (
          <p className="text-xs text-muted-foreground">{t("meetadmin.background_none")}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <input ref={fileInput} type="file" accept="image/*,video/mp4,video/webm" className="hidden" onChange={(e) => void uploadBackground(e)} />
          <Button type="button" variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
            <Upload className="mr-1.5 h-4 w-4" />
            {data.background ? t("meetadmin.background_replace") : t("meetadmin.background_upload")}
          </Button>
          {data.background && (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void changeBackground(() => meet.removeBackground())}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              {t("meetadmin.background_remove")}
            </Button>
          )}
        </div>
        {data.background && (
          <label htmlFor="meet-background-default" className="flex cursor-pointer items-start gap-3 border-t border-border pt-3">
            <input
              id="meet-background-default"
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={data.background.default}
              disabled={busy}
              onChange={(e) => void save({ backgroundDefault: e.target.checked })}
            />
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">{t("meetadmin.background_default")}</span>
              <span className="block text-xs text-muted-foreground">{t("meetadmin.background_default_hint")}</span>
            </span>
          </label>
        )}
      </section>
    </div>
  );
}

function MeetingsBody() {
  const rooms = useMe().tenant.product === "rooms";
  return (
    <>
      <MeetingsSettings />
      {!rooms && (
        <div className="mt-6 max-w-2xl">
          <CompanyRecordings />
        </div>
      )}
    </>
  );
}

export default function MeetingsAdminPage() {
  const t = useXT();
  return (
    <WorkspaceShell title={t("meetadmin.title")} backHref="/workspace" requireAdmin>
      <MeetingsBody />
    </WorkspaceShell>
  );
}
