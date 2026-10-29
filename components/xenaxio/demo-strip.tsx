"use client";

// xenaxio step 73: the strip on every screen of a live-demo guest — how long
// the demo still runs, 30 minutes more (once), the ways on (book a call,
// request a quote) and "end demo". When the time is up the guest goes back to
// the website; the company is deleted and created anew behind them.
import { useEffect, useState } from "react";
import { Sparkles } from "@/components/icons";
import { errorKey, xenaxio, type DemoInfo } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";
import { useXenaxioMe, useXenaxioMeStore } from "@/lib/xenaxio/me-store";

/** Whole minutes left (rounded up, never below 0). */
export function minutesLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 60_000));
}

export function XenaxioDemoStrip() {
  const t = useXT();
  const me = useXenaxioMe();
  const [demo, setDemo] = useState<DemoInfo | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDemo(me?.demo ?? null), [me?.demo]);
  useEffect(() => {
    if (!demo) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [demo]);

  const left = demo ? minutesLeft(demo.expiresAt, now) : null;
  useEffect(() => {
    // Time is up: back to the website (the platform ends the session anyway).
    if (demo && left === 0) window.location.assign(demo.links.site);
  }, [demo, left]);

  if (!demo || left === null) return null;

  const extend = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await xenaxio.demoExtend();
      setDemo(next);
      const current = useXenaxioMeStore.getState().me;
      if (current) useXenaxioMeStore.setState({ me: { ...current, demo: next } });
    } catch (err) {
      setError(t(errorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  const end = async () => {
    if (!window.confirm(t("demo.end_confirm"))) return;
    setBusy(true);
    try {
      const { links } = await xenaxio.demoEnd();
      window.location.assign(links.site);
    } catch {
      window.location.assign(demo.links.site);
    }
  };

  const link = "font-medium underline underline-offset-2 hover:no-underline";
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-primary/30 bg-primary/10 px-4 py-2 text-sm text-foreground flex-shrink-0">
      <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span>
        <strong>{t("demo.strip_label")}</strong> · {t("demo.strip_left", { minutes: left })}
      </span>
      {demo.extendable && (
        <button type="button" className={link} onClick={extend} disabled={busy}>
          {t("demo.extend")}
        </button>
      )}
      {demo.links.book && (
        <a className={link} href={demo.links.book} target="_blank" rel="noopener">
          {t("demo.book")}
        </a>
      )}
      <a className={link} href={demo.links.quote} target="_blank" rel="noopener">
        {t("demo.quote")}
      </a>
      <button type="button" className={link} onClick={end} disabled={busy}>
        {t("demo.end")}
      </button>
      {error && <span className="text-destructive">{error}</span>}
    </div>
  );
}
