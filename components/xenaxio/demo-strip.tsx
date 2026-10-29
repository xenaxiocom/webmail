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
  // Step 73c: "End demo" first asks whether we may get in touch.
  const [leaving, setLeaving] = useState(false);

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
      <button type="button" className={link} onClick={() => setLeaving(true)} disabled={busy}>
        {t("demo.end")}
      </button>
      {error && <span className="text-destructive">{error}</span>}
      {leaving && <DemoGoodbye busy={busy} onEnd={end} onCancel={() => setLeaving(false)} />}
    </div>
  );
}

/**
 * Step 73c: before the demo ends, the guest may leave their details so we get
 * in touch (a "Live Demo" lead); ending without them is one click too.
 */
function DemoGoodbye({ busy, onEnd, onCancel }: { busy: boolean; onEnd: () => Promise<void>; onCancel: () => void }) {
  const t = useXT();
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", company: "", consent: false });
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const ready = form.first_name.trim() && form.last_name.trim() && /.+@.+\..+/.test(form.email) && form.company.trim() && form.consent;
  const field = "h-8 rounded-md border border-border bg-background px-2 text-sm";
  const send = async () => {
    setState("sending");
    try {
      await xenaxio.demoLead({ ...form, first_name: form.first_name.trim(), last_name: form.last_name.trim(), email: form.email.trim(), company: form.company.trim() });
      setState("sent");
      await onEnd();
    } catch {
      setState("failed");
    }
  };
  return (
    <div className="w-full max-w-xl space-y-2 rounded-md border border-border bg-background p-3 text-left">
      <p className="font-medium">{t("demo.goodbye_title")}</p>
      <p className="text-muted-foreground">{t("demo.goodbye_text")}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input className={field} placeholder={t("demo.first_name")} aria-label={t("demo.first_name")} value={form.first_name} maxLength={40} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
        <input className={field} placeholder={t("demo.last_name")} aria-label={t("demo.last_name")} value={form.last_name} maxLength={80} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
        <input className={field} type="email" placeholder={t("demo.email")} aria-label={t("demo.email")} value={form.email} maxLength={80} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className={field} placeholder={t("demo.company")} aria-label={t("demo.company")} value={form.company} maxLength={40} onChange={(e) => setForm({ ...form, company: e.target.value })} />
      </div>
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} />
        <span>{t("demo.consent")}</span>
      </label>
      {state === "failed" && <p className="text-xs text-destructive">{t("demo.lead_failed")}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50" onClick={send} disabled={!ready || busy || state === "sending"}>
          {t("demo.send_and_end")}
        </button>
        <button type="button" className="text-sm underline underline-offset-2" onClick={() => void onEnd()} disabled={busy}>
          {t("demo.just_end")}
        </button>
        <button type="button" className="text-sm text-muted-foreground underline underline-offset-2" onClick={onCancel} disabled={busy}>
          {t("demo.keep_trying")}
        </button>
      </div>
    </div>
  );
}
