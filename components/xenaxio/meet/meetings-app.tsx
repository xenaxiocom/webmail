"use client";

// xenaxio step 78: the "Meetings" section next to mail, calendar and chat:
// the employee's own meeting links and a new one. A meeting opens in its own
// tab (/meet/<code>), so mail stays open next to it. Step 79: a webinar
// instead, where the operator allows it.
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink, Presentation, Video } from "@/components/icons";
import { InlineAppView } from "@/components/layout/inline-app-view";
import { MvTopBar } from "@/components/layout/mv-top-bar";
import { NavigationRail } from "@/components/layout/navigation-rail";
import { SidebarAppsModal } from "@/components/layout/sidebar-apps-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice, Spinner } from "@/components/xenaxio/ui";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useIsEmbedded } from "@/hooks/use-is-embedded";
import { useIsMobile } from "@/hooks/use-media-query";
import { useMountainViewShell } from "@/hooks/use-mountain-view-shell";
import { useSidebarApps } from "@/hooks/use-sidebar-apps";
import { withBasePath } from "@/lib/browser-navigation";
import { cn } from "@/lib/utils";
import { XenaxioApiError, xenaxio } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";
import { meet, meetingLink, type MeetingKind, type MeetingView } from "@/lib/xenaxio/meet";
import { setMeetNavEnabled } from "@/lib/xenaxio/meet-nav";
import { redirectToLogin, saveRedirectAfterLogin, useAuthStore } from "@/stores/auth-store";
import { useEmailStore } from "@/stores/email-store";
import { useLocale } from "next-intl";

function errorOf(t: ReturnType<typeof useXT>, err: unknown): string {
  const code = err instanceof XenaxioApiError ? err.code : "internal";
  const text = t(`meet.errors.${code}`);
  return text === `meet.errors.${code}` ? t("meet.errors.internal") : text;
}

function MeetingRow({ m }: { m: MeetingView }) {
  const t = useXT();
  const locale = useLocale();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(meetingLink(m.code)).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const until = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date(m.expiresAt));
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-4 py-3">
      {m.kind === "webinar" ? <Presentation className="h-5 w-5 text-muted-foreground" /> : <Video className="h-5 w-5 text-muted-foreground" />}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {m.title}
          {m.kind === "webinar" && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">{t("meet.webinar")}</span>}
        </p>
        <p className="text-xs text-muted-foreground">
          {m.running ? <span className="text-green-600">{t("meet.running", { count: m.participants })}</span> : t("meet.valid_until", { date: until })}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={() => void copy()}>
        <Copy className="mr-1 h-4 w-4" />
        {copied ? t("meet.link_copied") : t("meet.copy_link")}
      </Button>
      <a href={withBasePath(m.path)} target="_blank" rel="noopener" className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90">
        <ExternalLink className="mr-1 h-4 w-4" />
        {t("meet.open")}
      </a>
    </li>
  );
}

function MeetingsInside() {
  const t = useXT();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [webinars, setWebinars] = useState(false);
  const [kind, setKind] = useState<MeetingKind>("meeting");
  const [meetings, setMeetings] = useState<MeetingView[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const status = await meet.status();
      setEnabled(status.enabled);
      setMeetNavEnabled(status.enabled);
      setWebinars(!!status.webinars);
      if (status.enabled) setMeetings(await meet.mine());
    } catch (err) {
      setEnabled(false);
      setError(errorOf(t, err));
    }
  }, [t]);
  useEffect(() => {
    void load();
    // Running meetings and their people change while the page is open.
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const m = await meet.create(title.trim(), undefined, webinars ? kind : "meeting");
      setTitle("");
      setMeetings((list) => [m, ...list]);
      window.open(withBasePath(m.path), "_blank", "noopener");
    } catch (err) {
      setError(errorOf(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-6">
      <h1 className="text-2xl font-semibold">{t("meet.list_title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("meet.list_intro")}</p>
      {enabled === null ? (
        <div className="mt-8 flex justify-center">
          <Spinner label={t("common.loading")} />
        </div>
      ) : !enabled ? (
        <div className="mt-6">
          <Notice kind="info">{t("meet.off_hint")}</Notice>
        </div>
      ) : (
        <>
          <form onSubmit={create} className="mt-6 flex flex-wrap gap-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={t("meet.new_placeholder")} className="min-w-0 flex-1" />
            {webinars && (
              <div role="radiogroup" aria-label={t("meet.kind_label")} className="flex rounded-md border border-border p-0.5 text-sm">
                {(["meeting", "webinar"] as MeetingKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={kind === k}
                    onClick={() => setKind(k)}
                    className={cn("rounded px-3 py-1", kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                  >
                    {t(k === "webinar" ? "meet.webinar" : "meet.meeting")}
                  </button>
                ))}
              </div>
            )}
            <Button type="submit" disabled={busy || !title.trim()}>
              {kind === "webinar" && webinars ? <Presentation className="mr-1 h-4 w-4" /> : <Video className="mr-1 h-4 w-4" />}
              {t(kind === "webinar" && webinars ? "meet.create_webinar" : "meet.create")}
            </Button>
          </form>
          {webinars && kind === "webinar" && <p className="mt-2 text-xs text-muted-foreground">{t("meet.webinar_hint")}</p>}
          {meetings.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">{t("meet.list_empty")}</p>
          ) : (
            <ul className="mt-6 space-y-2">
              {meetings.map((m) => (
                <MeetingRow key={m.code} m={m} />
              ))}
            </ul>
          )}
        </>
      )}
      {error && (
        <div className="mt-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
    </div>
  );
}

export function MeetingsApp() {
  const t = useXT();
  useDocumentTitle(t("meet.list_title"));
  const { logout, checkAuth } = useAuthStore();
  const { quota, isPushConnected } = useEmailStore();
  const { showAppsModal, inlineApp, loadedApps, handleManageApps, handleInlineApp, closeInlineApp, closeAppsModal } = useSidebarApps();
  const [signedIn, setSignedIn] = useState(false);
  const isMobile = useIsMobile();
  const isEmbedded = useIsEmbedded();
  const mvShell = useMountainViewShell(isEmbedded);

  useEffect(() => {
    let cancelled = false;
    xenaxio
      .me()
      .then(() => !cancelled && setSignedIn(true))
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof XenaxioApiError && err.status === 401) {
          saveRedirectAfterLogin();
          redirectToLogin();
        } else setSignedIn(true);
      });
    if (!useAuthStore.getState().isAuthenticated) void checkAuth().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [checkAuth]);

  if (!signedIn) return null;

  return (
    <div data-app-shell="" className={cn("flex flex-col overflow-hidden pt-[env(safe-area-inset-top)]", mvShell ? "bg-[var(--mv-canvas)]" : "bg-background", isEmbedded ? "h-full" : "h-dvh")}>
      {mvShell && <MvTopBar showMenuButton={false} onManageApps={handleManageApps} onInlineApp={handleInlineApp} onCloseInlineApp={closeInlineApp} activeAppId={inlineApp?.id ?? null} />}
      <div data-mv-card={mvShell ? "" : undefined} className={cn("flex min-h-0 flex-1 overflow-hidden", mvShell && "mx-4 mb-4 bg-background")}>
        {!isMobile && !isEmbedded && !mvShell && (
          <div data-app-rail="" className="flex w-14 flex-shrink-0 flex-col bg-secondary" style={{ borderRight: "1px solid rgba(128, 128, 128, 0.3)" }}>
            <NavigationRail collapsed quota={quota} isPushConnected={isPushConnected} onLogout={logout} onManageApps={handleManageApps} onInlineApp={handleInlineApp} onCloseInlineApp={closeInlineApp} activeAppId={inlineApp?.id ?? null} />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          {inlineApp && <InlineAppView apps={loadedApps} activeAppId={inlineApp.id} onClose={closeInlineApp} />}
          <div className={cn("flex min-h-0 flex-1", inlineApp && "hidden")}>
            <MeetingsInside />
          </div>
          {isMobile && !isEmbedded && <NavigationRail orientation="horizontal" onManageApps={handleManageApps} onInlineApp={handleInlineApp} onCloseInlineApp={closeInlineApp} activeAppId={inlineApp?.id ?? null} />}
        </div>
      </div>
      <SidebarAppsModal isOpen={showAppsModal} onClose={closeAppsModal} />
    </div>
  );
}
