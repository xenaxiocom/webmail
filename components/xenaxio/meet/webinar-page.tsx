"use client";

// xenaxio step 79, part B: a webinar's page before entering. What it is
// about, when, who hosts; viewers register here with name and e-mail and get
// their personal link by e-mail. The personal link (#r=<id>.<key>) shows who
// registered and enters; with &cancel=1 it cancels the registration.
import { type FormEvent, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { XenaxioApiError } from "@/lib/xenaxio/api";
import { meet, type MeetingInfo } from "@/lib/xenaxio/meet";
import { meetError, useMeetLang } from "./lang";

const codeOf = (err: unknown) => (err instanceof XenaxioApiError ? err.code : "internal");

/** What, when, who hosts. */
export function WebinarIntro({ info }: { info: MeetingInfo }) {
  const { t, lang } = useMeetLang();
  const w = info.webinar;
  if (!w) return null;
  const start = w.startsAt ? new Date(w.startsAt) : null;
  const when = start
    ? new Intl.DateTimeFormat(lang === "de" ? "de-DE" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(start)
    : null;
  return (
    <div className="mb-6 w-full max-w-lg space-y-2 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/60">{t("webinar")}</p>
      <h1 className="text-2xl font-semibold">{info.title}</h1>
      {when && (
        <p className="text-white/80">
          {when}
          {w.durationMinutes ? ` · ${t("minutes", { count: w.durationMinutes })}` : ""}
        </p>
      )}
      {w.hosts.length > 0 && <p className="text-sm text-white/60">{t("hosted_by", { names: w.hosts.join(", "), company: info.company })}</p>}
      {w.description && <p className="whitespace-pre-wrap pt-2 text-left text-sm text-white/80">{w.description}</p>}
    </div>
  );
}

/** Name, e-mail, consent; the personal link comes by e-mail. */
export function RegisterForm({ code, info }: { code: string; info: MeetingInfo }) {
  const { t, lang } = useMeetLang();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const privacy = info.webinar?.privacyUrl;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !consent) return;
    setBusy(true);
    setError(null);
    try {
      await meet.register(code, { name: name.trim(), email: email.trim(), locale: lang });
      setDone(true);
    } catch (err) {
      setError(meetError(t, codeOf(err)));
    } finally {
      setBusy(false);
    }
  };
  if (done) {
    return (
      <div className="max-w-md text-center">
        <h2 className="mb-2 text-lg font-semibold">{t("registered_title")}</h2>
        <p className="text-white/80">{t("registered_text", { email: email.trim() })}</p>
      </div>
    );
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="w-full max-w-sm space-y-3">
      <h2 className="text-center text-lg font-semibold">{t("register_title")}</h2>
      <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t("your_name")} aria-label={t("your_name")} className="bg-white/10 text-white placeholder:text-white/40" />
      <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} placeholder={t("your_email")} aria-label={t("your_email")} className="bg-white/10 text-white placeholder:text-white/40" />
      <label className="flex items-start gap-2 text-left text-xs text-white/70">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4" />
        <span>
          {t("consent", { company: info.company })}{" "}
          {privacy && (
            <a href={privacy} target="_blank" rel="noopener noreferrer" className="underline">
              {t("privacy")}
            </a>
          )}
        </span>
      </label>
      <button
        type="submit"
        disabled={busy || !name.trim() || !email.trim() || !consent}
        className="w-full rounded-lg bg-[var(--meet-accent,#2563eb)] px-4 py-2 text-[var(--meet-accent-text,#fff)] disabled:opacity-50"
      >
        {t("register")}
      </button>
      {error && <p className="text-center text-sm text-red-300">{error}</p>}
    </form>
  );
}

/** The personal link: who registered; enter, or cancel. */
export function Registered({
  code,
  id,
  regKey,
  cancel,
  busy,
  onJoin,
}: {
  code: string;
  id: string;
  regKey: string;
  cancel: boolean;
  busy: boolean;
  onJoin: () => void;
}) {
  const { t } = useMeetLang();
  const [state, setState] = useState<{ name: string; cancelled: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    meet
      .registration(code, id, regKey)
      .then(setState)
      .catch((err: unknown) => setError(meetError(t, codeOf(err))));
  }, [code, id, regKey, t]);
  const doCancel = async () => {
    try {
      await meet.cancelRegistration(code, id, regKey);
      setState((s) => (s ? { ...s, cancelled: true } : s));
    } catch (err) {
      setError(meetError(t, codeOf(err)));
    }
  };
  if (error) return <p className="max-w-md text-center text-white/80">{error}</p>;
  if (!state) return <p className="text-white/70">{t("loading")}</p>;
  if (state.cancelled) return <p className="max-w-md text-center text-white/80">{t("registration_cancelled_text")}</p>;
  return (
    <div className="w-full max-w-sm space-y-3 text-center">
      <p className="text-white/80">{t("registered_as", { name: state.name })}</p>
      {cancel ? (
        <button type="button" onClick={() => void doCancel()} className="w-full rounded-lg bg-red-700 px-4 py-2 hover:bg-red-600">
          {t("cancel_registration")}
        </button>
      ) : (
        <button type="button" disabled={busy} onClick={onJoin} className="w-full rounded-lg bg-[var(--meet-accent,#2563eb)] px-4 py-2 text-[var(--meet-accent-text,#fff)] disabled:opacity-50">
          {t("webinar_enter")}
        </button>
      )}
    </div>
  );
}
