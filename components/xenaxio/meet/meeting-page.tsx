"use client";

// xenaxio step 78: the meeting page /meet/<code>. The platform serves this one
// page for every meeting link; it reads the code from the address. People of
// the company (signed in) enter directly; guests give their name and wait in
// the lobby until someone of the company lets them in.
import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { withBasePath } from "@/lib/browser-navigation";
import { XenaxioApiError } from "@/lib/xenaxio/api";
import { contrastRatio, usePortal } from "@/lib/xenaxio/portal";
import { type JoinGrant, loadGuestVisit, meet, type MeetingInfo, meetingCode, saveGuestVisit } from "@/lib/xenaxio/meet";
import { type Lang, MeetLangProvider, meetError, useMeetLang } from "./lang";
import { type Choices, PreJoin } from "./prejoin";
import { type LeaveReason, MeetingRoom } from "./room";

type Step =
  | { kind: "loading" }
  | { kind: "error"; code: string }
  | { kind: "closed"; info: MeetingInfo }
  | { kind: "prejoin"; info: MeetingInfo }
  | { kind: "waiting"; info: MeetingInfo; choices: Choices }
  | { kind: "room"; info: MeetingInfo; grant: JoinGrant; choices: Choices }
  | { kind: "after"; info: MeetingInfo; reason: LeaveReason | "denied" };

const POLL_MS = 2000;

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
      const visit = !info.member ? loadGuestVisit(code) : null;
      if (visit) return setStep({ kind: "waiting", info, choices: { name: visit.name, video: true, audio: true, videoDeviceId: "", audioDeviceId: "" } });
      setStep({ kind: "prejoin", info });
    } catch (err) {
      setStep({ kind: "error", code: codeOf(err) });
    }
  }, [code]);
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
          setStep({ kind: "room", info: step.info, grant: { token: s.token, signalPath: s.signalPath, identity: s.identity ?? "", title: s.title ?? step.info.title }, choices: step.choices });
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

  const left = (info: MeetingInfo, reason: LeaveReason) => {
    if (reason === "removed" || reason === "ended") saveGuestVisit(null);
    setStep({ kind: "after", info, reason });
  };

  if (step.kind === "room" && code) {
    return (
      <div style={accent ? ({ "--meet-accent": accent } as CSSProperties) : undefined}>
        <MeetingRoom code={code} token={step.grant.token} signalPath={step.grant.signalPath} title={step.grant.title} member={step.info.member} choices={step.choices} onLeave={(r) => left(step.info, r)} />
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
        </div>
      )}
      {step.kind === "prejoin" && (
        <>
          <h1 className="mb-1 text-center text-xl font-semibold">{step.info.title}</h1>
          <p className="mb-4 text-center text-sm text-white/60">{t("by_company", { company: step.info.company })}</p>
          {!step.info.member && !step.info.guests ? (
            <p className="max-w-md text-center text-white/80">{meetError(t, "guests_off")}</p>
          ) : (
            <PreJoin askName={!step.info.member} defaultName="" submitLabel={step.info.member ? t("join") : t("ask_to_join")} busy={busy} onSubmit={(c) => void enter(step.info, c)} />
          )}
          {error && <p className="mt-3 max-w-md text-center text-sm text-red-300">{error}</p>}
        </>
      )}
      {step.kind === "waiting" && (
        <div className="max-w-md text-center">
          <h1 className="mb-2 text-xl font-semibold">{t("waiting_title")}</h1>
          <p className="text-white/80">{t("waiting_text", { company: step.info.company })}</p>
          <div className="mx-auto mt-6 h-2 w-40 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--meet-accent,#2563eb)]" />
          </div>
        </div>
      )}
      {step.kind === "after" && (
        <div className="max-w-md text-center">
          <h1 className="mb-2 text-xl font-semibold">{t(`after_${step.reason}`)}</h1>
          {(step.reason === "left" || step.reason === "lost" || step.reason === "failed" || step.reason === "full") && (
            <button type="button" onClick={() => void load()} className="mt-4 rounded-lg bg-[var(--meet-accent,#2563eb)] px-4 py-2 text-[var(--meet-accent-text,#fff)]">
              {t("rejoin")}
            </button>
          )}
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
