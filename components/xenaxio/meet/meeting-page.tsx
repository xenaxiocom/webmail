"use client";

// xenaxio step 78: the meeting page /meet/<code>. The platform serves this one
// page for every meeting link; it reads the code from the address. People of
// the company (signed in) enter directly; guests give their name and wait in
// the lobby until someone of the company lets them in. Step 79: a webinar has
// no lobby; a guest gives a name and watches (no camera check).
import { type CSSProperties, type FormEvent, useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { withBasePath } from "@/lib/browser-navigation";
import { XenaxioApiError } from "@/lib/xenaxio/api";
import { contrastRatio, usePortal } from "@/lib/xenaxio/portal";
import { type GuestKey, type JoinGrant, loadGuestVisit, meet, type MeetingInfo, meetingCode, personalLink, saveGuestVisit } from "@/lib/xenaxio/meet";
import { type Lang, MeetLangProvider, meetError, useMeetLang } from "./lang";
import { type Choices, PreJoin } from "./prejoin";
import { type LeaveReason, MeetingRoom } from "./room";
import { Registered, RegisterForm, WebinarIntro } from "./webinar-page";

type Step =
  | { kind: "loading" }
  | { kind: "error"; code: string }
  | { kind: "closed"; info: MeetingInfo }
  | { kind: "prejoin"; info: MeetingInfo }
  | { kind: "waiting"; info: MeetingInfo; choices: Choices }
  | { kind: "room"; info: MeetingInfo; grant: JoinGrant; choices: Choices; guest?: GuestKey | null }
  | { kind: "after"; info: MeetingInfo; reason: LeaveReason | "denied" };

const POLL_MS = 2000;

/**
 * Back to the app after the meeting. A link from the chat or the calendar opens
 * the meeting in the same window (in the installed app there is no address bar
 * and no back button), so go back there; otherwise to the start page.
 */
function backToApp() {
  try {
    if (history.length > 1 && document.referrer && new URL(document.referrer).origin === location.origin) return history.back();
  } catch {
    // An odd referrer: the start page.
  }
  location.assign(withBasePath("/"));
}

/** For people of the company: the way back to the app. */
function BackToApp() {
  const { t } = useMeetLang();
  const portal = usePortal();
  const name = portal?.kind === "tenant" ? portal.name : t("app_name");
  return (
    <button type="button" onClick={backToApp} className="mt-4 rounded-lg border border-white/20 px-4 py-2 text-white/90 hover:bg-white/10">
      {t("back_to_app", { name })}
    </button>
  );
}

/** Step 79: a guest of a webinar only watches — a name, no camera check. */
function WatchJoin({ busy, onSubmit }: { busy: boolean; onSubmit: (c: Choices) => void }) {
  const { t } = useMeetLang();
  const [name, setName] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) onSubmit({ name: name.trim(), video: false, audio: false, videoDeviceId: "", audioDeviceId: "" });
  };
  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-3">
      <p className="text-center text-sm text-white/70">{t("webinar_watch_hint")}</p>
      <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t("your_name")} aria-label={t("your_name")} className="bg-white/10 text-white placeholder:text-white/40" />
      <button type="submit" disabled={busy || !name.trim()} className="w-full rounded-lg bg-[var(--meet-accent,#2563eb)] px-4 py-2 text-[var(--meet-accent-text,#fff)] disabled:opacity-50">
        {t("webinar_watch")}
      </button>
    </form>
  );
}

function Shell({ children, accent }: { children: React.ReactNode; accent?: string | null }) {
  const { lang, setLang, t } = useMeetLang();
  const portal = usePortal();
  const company = portal?.kind === "tenant" ? portal : null;
  const text = accent && contrastRatio(accent, "#ffffff") >= 3 ? "#ffffff" : "#111111";
  const style = accent ? ({ "--meet-accent": accent, "--meet-accent-text": text } as CSSProperties) : undefined;
  return (
    <div className="min-h-dvh bg-[#111] text-white" style={style}>
      <header className="flex items-center gap-3 px-4 py-3">
        {company?.logoUrl ? (
          <img src={withBasePath(company.logoUrl)} alt={company.name} className="h-8 max-w-[160px] rounded bg-white object-contain p-1" />
        ) : (
          <span className="text-sm font-semibold">{company?.name ?? t("app_name")}</span>
        )}
        <span className="flex-1" />
        {(["de", "en"] as Lang[]).map((l) => (
          <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l} className={l === lang ? "text-sm font-semibold" : "text-sm text-white/60 hover:text-white"}>
            {l.toUpperCase()}
          </button>
        ))}
      </header>
      <main className="flex flex-col items-center px-4 pb-10 pt-4">{children}</main>
    </div>
  );
}

function Page() {
  const { t } = useMeetLang();
  const portal = usePortal();
  const accent = portal?.kind === "tenant" ? portal.color : null;
  const [code] = useState(() => (typeof location === "undefined" ? null : meetingCode(location.pathname)));
  // Step 79, part B: a registered viewer's personal link (#r=<id>.<key>).
  const [personal] = useState(() => (typeof location === "undefined" ? null : personalLink(location.hash)));
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeOf = (err: unknown) => (err instanceof XenaxioApiError ? err.code : "internal");

  const load = useCallback(async () => {
    if (!code) return setStep({ kind: "error", code: "meeting_not_found" });
    try {
      const info = await meet.info(code);
      if (info.state !== "open") return setStep({ kind: "closed", info });
      // A guest who reloads the page keeps their place in the lobby.
      const visit = !info.member && !personal ? loadGuestVisit(code) : null;
      if (visit) return setStep({ kind: "waiting", info, choices: { name: visit.name, video: true, audio: true, videoDeviceId: "", audioDeviceId: "" } });
      setStep({ kind: "prejoin", info });
    } catch (err) {
      setStep({ kind: "error", code: codeOf(err) });
    }
  }, [code, personal]);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (step.kind !== "closed" && step.kind !== "error" && "info" in step) document.title = step.info.title;
  }, [step]);

  // A guest in the lobby asks for news until let in.
  useEffect(() => {
    if (step.kind !== "waiting" || !code) return;
    const visit = loadGuestVisit(code);
    if (!visit) return;
    let stop = false;
    const ask = async () => {
      try {
        const s = await meet.guestStatus(code, visit.guestId, visit.key);
        if (stop) return;
        if (s.state === "admitted" && s.token && s.signalPath) {
          setStep({
            kind: "room",
            info: step.info,
            grant: { token: s.token, signalPath: s.signalPath, identity: s.identity ?? "", title: s.title ?? step.info.title, ...(s.kind ? { kind: s.kind } : {}), ...(s.role ? { role: s.role } : {}) },
            choices: step.choices,
          });
        } else if (s.state === "denied" || s.state === "removed" || s.state === "ended") {
          saveGuestVisit(null);
          setStep({ kind: "after", info: step.info, reason: s.state === "denied" ? "denied" : s.state === "ended" ? "ended" : "removed" });
        }
      } catch (err) {
        if (err instanceof XenaxioApiError && err.status === 404) {
          saveGuestVisit(null);
          setStep({ kind: "prejoin", info: step.info });
        }
      }
    };
    void ask();
    const timer = setInterval(ask, POLL_MS);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [step, code]);

  const enter = async (info: MeetingInfo, choices: Choices) => {
    if (!code) return;
    setBusy(true);
    setError(null);
    try {
      if (info.member) {
        setStep({ kind: "room", info, grant: await meet.join(code), choices });
      } else {
        const knock = await meet.knock(code, choices.name);
        saveGuestVisit({ code, guestId: knock.guestId, key: knock.key, name: choices.name });
        setStep({ kind: "waiting", info, choices });
      }
    } catch (err) {
      setError(meetError(t, codeOf(err)));
    } finally {
      setBusy(false);
    }
  };

  // Step 79, part B: the personal link enters without a lobby.
  const enterRegistered = async (info: MeetingInfo) => {
    if (!code || !personal) return;
    setBusy(true);
    setError(null);
    try {
      const grant = await meet.joinRegistered(code, personal.id, personal.key);
      setStep({ kind: "room", info, grant, choices: { name: "", video: false, audio: false, videoDeviceId: "", audioDeviceId: "" }, guest: { registrationId: personal.id, key: personal.key } });
    } catch (err) {
      setError(meetError(t, codeOf(err)));
    } finally {
      setBusy(false);
    }
  };

  const left = (info: MeetingInfo, reason: LeaveReason) => {
    if (reason === "removed" || reason === "ended") saveGuestVisit(null);
    setStep({ kind: "after", info, reason });
  };

  if (step.kind === "room" && code) {
    return (
      <div style={accent ? ({ "--meet-accent": accent } as CSSProperties) : undefined}>
        <MeetingRoom
          code={code}
          token={step.grant.token}
          signalPath={step.grant.signalPath}
          title={step.grant.title}
          member={step.info.member}
          choices={step.choices}
          kind={step.grant.kind ?? "meeting"}
          role={step.grant.role ?? (step.info.member ? "member" : "guest")}
          guest={step.guest !== undefined ? step.guest : step.info.member ? null : loadGuestVisit(code)}
          onLeave={(r) => left(step.info, r)}
        />
      </div>
    );
  }

  return (
    <Shell accent={accent}>
      {step.kind === "loading" && <p className="text-white/70">{t("loading")}</p>}
      {step.kind === "error" && <p className="max-w-md text-center text-white/80">{meetError(t, step.code)}</p>}
      {step.kind === "closed" && (
        <div className="max-w-md text-center">
          <h1 className="mb-2 text-xl font-semibold">{step.info.title}</h1>
          <p className="text-white/80">{t(`state_${step.info.state}`, { company: step.info.company })}</p>
          {step.info.member && <BackToApp />}
        </div>
      )}
      {step.kind === "prejoin" && step.info.kind === "webinar" && step.info.webinar && !step.info.member && (
        <>
          <WebinarIntro info={step.info} />
          {personal ? (
            <Registered code={code ?? ""} id={personal.id} regKey={personal.key} cancel={personal.cancel} busy={busy} onJoin={() => void enterRegistered(step.info)} />
          ) : !step.info.guests ? (
            <p className="max-w-md text-center text-white/80">{meetError(t, "guests_off")}</p>
          ) : step.info.webinar.registration ? (
            <RegisterForm code={code ?? ""} info={step.info} />
          ) : (
            <WatchJoin busy={busy} onSubmit={(c) => void enter(step.info, c)} />
          )}
          {error && <p className="mt-3 max-w-md text-center text-sm text-red-300">{error}</p>}
        </>
      )}
      {step.kind === "prejoin" && !(step.info.kind === "webinar" && step.info.webinar && !step.info.member) && (
        <>
          {step.info.webinar ? <WebinarIntro info={step.info} /> : <h1 className="mb-1 text-center text-xl font-semibold">{step.info.title}</h1>}
          {!step.info.webinar && <p className="mb-4 text-center text-sm text-white/60">{t("by_company", { company: step.info.company })}</p>}
          {!step.info.member && !step.info.guests ? (
            <p className="max-w-md text-center text-white/80">{meetError(t, "guests_off")}</p>
          ) : step.info.kind === "webinar" && !step.info.member ? (
            <WatchJoin busy={busy} onSubmit={(c) => void enter(step.info, c)} />
          ) : (
            <PreJoin askName={!step.info.member} defaultName="" submitLabel={step.info.member ? t("join") : t("ask_to_join")} busy={busy} onSubmit={(c) => void enter(step.info, c)} />
          )}
          {error && <p className="mt-3 max-w-md text-center text-sm text-red-300">{error}</p>}
        </>
      )}
      {step.kind === "waiting" && (
        <div className="max-w-md text-center">
          <h1 className="mb-2 text-xl font-semibold">{t(step.info.kind === "webinar" ? "connecting" : "waiting_title")}</h1>
          {step.info.kind !== "webinar" && <p className="text-white/80">{t("waiting_text", { company: step.info.company })}</p>}
          <div className="mx-auto mt-6 h-2 w-40 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--meet-accent,#2563eb)]" />
          </div>
        </div>
      )}
      {step.kind === "after" && (
        <div className="max-w-md text-center">
          <h1 className="mb-2 text-xl font-semibold">{t(`after_${step.reason}`)}</h1>
          <div className="flex flex-wrap justify-center gap-3">
            {(step.reason === "left" || step.reason === "lost" || step.reason === "failed" || step.reason === "full") && (
              <button type="button" onClick={() => void load()} className="mt-4 rounded-lg bg-[var(--meet-accent,#2563eb)] px-4 py-2 text-[var(--meet-accent-text,#fff)]">
                {t("rejoin")}
              </button>
            )}
            {step.info.member && <BackToApp />}
          </div>
        </div>
      )}
    </Shell>
  );
}

export function MeetingPage() {
  return (
    <MeetLangProvider>
      <Page />
    </MeetLangProvider>
  );
}
