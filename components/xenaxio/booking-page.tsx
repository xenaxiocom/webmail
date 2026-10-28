"use client";

// Step 56: the public booking pages, like Calendly. Visitors need no account:
//   /book/<employee>              the employee's meeting types
//   /book/<employee>/<type>       pick a day and a time, then name and e-mail
//   /book/manage/#<token>         the visitor's link from the e-mail: move or cancel
// The platform serves this one page for every /book/… address and it reads the
// address itself. Times are shown in the visitor's zone (changeable); the page
// speaks German or English by the browser, with a switch.
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calendar, CheckCircle, ChevronLeft, ChevronRight, Clock, Globe, MapPin, Phone, Video } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/xenaxio/ui";
import { withBasePath } from "@/lib/browser-navigation";
import { XenaxioApiError } from "@/lib/xenaxio/api";
import { safeHttpUrl } from "@/lib/xenaxio/brand";
import {
  addDays,
  booking,
  browserTimeZone,
  downloadIcs,
  guestLocale,
  type Legal,
  localDate,
  type ManageView,
  type PublicPerson,
  type PublicType,
  timeZones,
  zonedToUtc,
} from "@/lib/xenaxio/booking";
import { translate } from "@/lib/xenaxio/i18n";
import { usePortal } from "@/lib/xenaxio/portal";

type Lang = "de" | "en";
type T = (key: string, values?: Record<string, string | number>) => string;

type Route = { kind: "person"; user: string } | { kind: "type"; user: string; type: string } | { kind: "manage"; token: string } | { kind: "none" };

/** What the address names; null until the browser is there (static build). */
export function parseBookingRoute(pathname: string, hash: string): Route {
  const at = pathname.indexOf("/book/");
  const rest = at === -1 ? [] : pathname.slice(at + 6).split("/").filter(Boolean).map((s) => decodeURIComponent(s));
  if (rest[0] === "manage") {
    const token = hash.replace(/^#/, "");
    return /^[A-Za-z0-9_-]{43}$/.test(token) ? { kind: "manage", token } : { kind: "none" };
  }
  const valid = (s: string | undefined) => !!s && /^[a-z0-9-]{1,40}$/.test(s);
  if (valid(rest[0]) && valid(rest[1])) return { kind: "type", user: rest[0]!, type: rest[1]! };
  if (valid(rest[0]) && rest.length === 1) return { kind: "person", user: rest[0]! };
  return { kind: "none" };
}

const bookPath = (...parts: string[]) => withBasePath(`/book/${parts.map(encodeURIComponent).join("/")}`);

function errorMessage(t: T, err: unknown): string {
  const code = err instanceof XenaxioApiError ? (err.issues?.find((i) => /^[a-z_]+$/.test(i.message))?.message ?? err.code) : "internal";
  const text = t(`booking.errors.${code}`);
  return text === `booking.errors.${code}` ? t("booking.errors.internal") : text;
}

function useFormat(lang: Lang, timeZone: string) {
  return useMemo(() => {
    const locale = lang === "de" ? "de-DE" : "en-GB";
    const time = new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit" });
    const day = new Intl.DateTimeFormat(locale, { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return {
      time: (iso: string | Date) => time.format(new Date(iso)),
      day: (iso: string | Date) => day.format(new Date(iso)),
      range: (start: string, end: string) => `${day.format(new Date(start))}, ${time.format(new Date(start))}–${time.format(new Date(end))}`,
      month: (y: number, m: number) => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 15))),
      weekdays: Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 10, 2 + i)))),
    };
  }, [lang, timeZone]);
}

// --- Frame ---------------------------------------------------------------------

function Shell({ lang, setLang, legal, children }: { lang: Lang; setLang: (l: Lang) => void; legal?: Legal | null; children: ReactNode }) {
  const t: T = useCallback((k, v) => translate(lang, k, v), [lang]);
  const portal = usePortal();
  const company = portal?.kind === "tenant" ? portal : null;
  const links = [
    { href: safeHttpUrl(legal?.imprintUrl ?? ""), label: t("booking.imprint") },
    { href: safeHttpUrl(legal?.privacyUrl ?? ""), label: t("booking.privacy") },
  ].filter((l) => l.href);
  return (
    <main lang={lang} className="min-h-dvh bg-muted/40 px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-4 flex items-center justify-between gap-3">
          <div className="min-h-8">
            {company?.logoUrl ? (
              <img src={withBasePath(company.logoUrl)} alt={company.name} className="max-h-10 max-w-[200px] w-auto object-contain" />
            ) : company ? (
              <span className="font-semibold">{company.name}</span>
            ) : null}
          </div>
          <div className="flex gap-1 text-xs" role="group" aria-label={t("booking.language")}>
            {(["de", "en"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                className={`rounded px-2 py-1 ${lang === l ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </header>
        <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">{children}</div>
        <footer className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {links.map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {l.label}
            </a>
          ))}
          <span>{t("booking.powered")}</span>
        </footer>
      </div>
    </main>
  );
}

function Avatar({ person, size = 56 }: { person: PublicPerson; size?: number }) {
  const [broken, setBroken] = useState(false);
  const initials = person.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return person.hasAvatar && !broken ? (
    <img src={withBasePath(booking.avatarUrl(person.slug))} alt="" width={size} height={size} onError={() => setBroken(true)} className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="flex items-center justify-center rounded-full bg-primary/15 font-semibold text-primary" style={{ width: size, height: size }} aria-hidden="true">
      {initials}
    </span>
  );
}

function PlaceLine({ t, kind, value, booked = false }: { t: T; kind: PublicType["locationKind"]; value: string; booked?: boolean }) {
  const icon = kind === "video" ? <Video className="h-4 w-4" /> : kind === "phone" ? <Phone className="h-4 w-4" /> : <MapPin className="h-4 w-4" />;
  // A booked video meeting shows its link instead of "you get the link with the confirmation".
  const text = kind === "address" && value ? value : booked && kind === "video" ? t("booking.place.video_booked") : t(`booking.place.${kind}`);
  return (
    <p className="flex items-start gap-2 text-sm text-muted-foreground">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{text}</span>
    </p>
  );
}

function Message({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      {icon && <div className="mb-3 flex justify-center">{icon}</div>}
      <h1 className="text-xl font-semibold">{title}</h1>
      {children && <div className="mx-auto mt-2 max-w-md space-y-3 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

// --- Day and time picker ---------------------------------------------------------

/**
 * A month of days in the visitor's zone with the free starts the platform
 * offers; days without free time can still be chosen to ask for a time.
 */
function SlotPicker({
  t,
  lang,
  timeZone,
  setTimeZone,
  horizonDays,
  load,
  onPick,
  onNoFit,
  reloadKey,
}: {
  t: T;
  lang: Lang;
  timeZone: string;
  setTimeZone: (tz: string) => void;
  horizonDays: number;
  load: (from: Date, to: Date) => Promise<string[]>;
  onPick: (start: string) => void;
  /** Ask for another time (only when the type allows requests). */
  onNoFit?: () => void;
  reloadKey?: number;
}) {
  const f = useFormat(lang, timeZone);
  const today = localDate(new Date(), timeZone);
  const lastDay = localDate(new Date(Date.now() + horizonDays * 86_400_000), timeZone);
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [slots, setSlots] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setSlots(null);
    setError(null);
    const first = `${month}-01`;
    const next = addDays(`${month}-28`, 7).slice(0, 7) + "-01";
    const from = new Date(Math.max(zonedToUtc(first, timeZone).getTime(), Date.now()));
    const to = zonedToUtc(next, timeZone);
    if (to <= from) {
      setSlots([]);
      return;
    }
    load(from, to)
      .then((s) => live && setSlots(s))
      .catch((err: unknown) => live && (setError(errorMessage(t, err)), setSlots([])));
    return () => {
      live = false;
    };
  }, [month, timeZone, load, t, reloadKey]);

  const byDay = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of slots ?? []) {
      const d = localDate(new Date(s), timeZone);
      m.set(d, [...(m.get(d) ?? []), s]);
    }
    return m;
  }, [slots, timeZone]);

  // Pick the first day with free time once the month is loaded.
  useEffect(() => {
    if (!slots) return;
    if (day && day.startsWith(month)) return;
    setDay([...byDay.keys()].sort()[0] ?? null);
  }, [slots, byDay, month, day]);

  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = `${month}-01`;
  const lead = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => addDays(first, i))];
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    setDay(null);
  };
  const canBack = month > today.slice(0, 7);
  const canForward = month < lastDay.slice(0, 7);
  const times = day ? (byDay.get(day) ?? []) : [];
  const monthEmpty = slots !== null && slots.length === 0 && !error;
  const zones = useMemo(() => timeZones([timeZone, browserTimeZone(), "Europe/Berlin"]), [timeZone]);

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,26rem)_200px]">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold capitalize">{f.month(y, m)}</h2>
          <div className="flex gap-1">
            <button type="button" onClick={() => shift(-1)} disabled={!canBack} className="rounded-md p-1.5 hover:bg-muted disabled:opacity-30" aria-label={t("booking.prev_month")}>
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => shift(1)} disabled={!canForward} className="rounded-md p-1.5 hover:bg-muted disabled:opacity-30" aria-label={t("booking.next_month")}>
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground" aria-hidden="true">
          {f.weekdays.map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1" role="grid" aria-busy={slots === null}>
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} />;
            const free = byDay.has(d);
            const usable = d >= today && d <= lastDay;
            const selected = d === day;
            return (
              <button
                key={d}
                type="button"
                disabled={!usable || slots === null}
                onClick={() => setDay(d)}
                aria-pressed={selected}
                aria-label={`${f.day(zonedToUtc(`${d}T12:00`, timeZone))}${free ? "" : ` – ${t("booking.no_times_short")}`}`}
                className={`aspect-square rounded-full text-sm transition-colors disabled:opacity-25 ${
                  selected ? "bg-primary text-primary-foreground font-semibold" : free ? "bg-primary/10 text-primary font-semibold hover:bg-primary/20" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {Number(d.slice(8))}
              </button>
            );
          })}
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Globe className="h-4 w-4 shrink-0" />
          <span className="sr-only">{t("booking.time_zone")}</span>
          <select value={timeZone} onChange={(e) => setTimeZone(e.target.value)} className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm">
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <div className="mt-3">
            <Notice kind="error">{error}</Notice>
          </div>
        )}
      </div>
      <div>
        {slots === null ? (
          <p className="text-sm text-muted-foreground">{t("booking.loading")}</p>
        ) : day ? (
          <>
            <h3 className="mb-2 text-sm font-medium">{f.day(zonedToUtc(`${day}T12:00`, timeZone))}</h3>
            {times.length ? (
              <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1 md:grid-cols-1">
                {times.map((s) => (
                  <button key={s} type="button" onClick={() => onPick(s)} className="rounded-md border border-primary/40 px-3 py-2 text-sm font-medium text-primary hover:bg-primary hover:text-primary-foreground">
                    {f.time(s)}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("booking.no_times_day")}</p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{monthEmpty ? t("booking.no_times_month") : t("booking.pick_day")}</p>
        )}
        {onNoFit && slots !== null && (monthEmpty || (day && times.length === 0)) && (
          <button type="button" onClick={onNoFit} className="mt-4 text-left text-sm font-medium text-primary hover:underline">
            {t("booking.ask_other_time")}
          </button>
        )}
      </div>
    </div>
  );
}

// --- Visitor's details ------------------------------------------------------------

interface GuestDraft {
  name: string;
  email: string;
  phone: string;
  message: string;
  website: string;
}

function GuestFields({ t, type, draft, setDraft }: { t: T; type: PublicType; draft: GuestDraft; setDraft: (d: GuestDraft) => void }) {
  const field = (key: keyof GuestDraft) => ({ value: draft[key], onChange: (e: { target: { value: string } }) => setDraft({ ...draft, [key]: e.target.value }) });
  const label = (text: string, required: boolean) => (
    <span className="mb-1 block text-sm font-medium">
      {text}
      {required ? " *" : <span className="font-normal text-muted-foreground"> ({t("booking.optional")})</span>}
    </span>
  );
  return (
    <div className="space-y-3">
      <label className="block">
        {label(t("booking.name"), true)}
        <Input required maxLength={100} autoComplete="name" {...field("name")} />
      </label>
      <label className="block">
        {label(t("booking.email"), true)}
        <Input required type="email" maxLength={254} autoComplete="email" {...field("email")} />
      </label>
      {type.askPhone !== "off" && (
        <label className="block">
          {label(t("booking.phone"), type.askPhone === "required")}
          <Input required={type.askPhone === "required"} type="tel" maxLength={40} autoComplete="tel" {...field("phone")} />
          {type.locationKind === "phone" && <span className="mt-1 block text-xs text-muted-foreground">{t("booking.phone_hint")}</span>}
        </label>
      )}
      {type.askMessage !== "off" && (
        <label className="block">
          {label(t("booking.message"), type.askMessage === "required")}
          <textarea
            required={type.askMessage === "required"}
            maxLength={2000}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            {...field("message")}
          />
        </label>
      )}
      {/* Left empty by people; bots fill every field. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" {...field("website")} />
        </label>
      </div>
    </div>
  );
}

const guestOf = (d: GuestDraft) => ({
  name: d.name.trim(),
  email: d.email.trim(),
  ...(d.phone.trim() ? { phone: d.phone.trim() } : {}),
  ...(d.message.trim() ? { message: d.message.trim() } : {}),
  ...(d.website ? { website: d.website } : {}),
});

const primaryButton = "inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50";
const plainButton = "inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50";

// --- One meeting type ------------------------------------------------------------

type Step = { kind: "pick" } | { kind: "form"; start: string } | { kind: "done"; start: string; end: string; ics: string; manageUrl: string } | { kind: "request" } | { kind: "requested"; proposals: string[] };

function TypePage({ t, lang, user, typeSlug, onLegal }: { t: T; lang: Lang; user: string; typeSlug: string; onLegal: (l: Legal) => void }) {
  const [data, setData] = useState<{ person: PublicPerson; type: PublicType } | null>(null);
  const [missing, setMissing] = useState(false);
  const [timeZone, setTimeZone] = useState("Europe/Berlin");
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [draft, setDraft] = useState<GuestDraft>({ name: "", email: "", phone: "", message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [proposals, setProposals] = useState<{ date: string; time: string }[]>([{ date: "", time: "" }]);
  const f = useFormat(lang, timeZone);

  useEffect(() => {
    setTimeZone(browserTimeZone());
    booking
      .type(user, typeSlug)
      .then((r) => {
        setData({ person: r.person, type: r.type });
        onLegal(r.legal);
        document.title = `${r.type.title} – ${r.person.name}`;
      })
      .catch(() => setMissing(true));
  }, [user, typeSlug, onLegal]);

  const load = useCallback((from: Date, to: Date) => booking.slots(user, typeSlug, from, to).then((r) => r.slots), [user, typeSlug]);

  if (missing) return <Message title={t("booking.not_found_title")}>{t("booking.not_found_text")}</Message>;
  if (!data) return <Message title={t("booking.loading")} />;
  const { person, type } = data;
  const end = (start: string) => new Date(new Date(start).getTime() + type.durationMinutes * 60_000).toISOString();

  const submitBooking = async (e: FormEvent) => {
    e.preventDefault();
    if (step.kind !== "form") return;
    setBusy(true);
    setError(null);
    try {
      const res = await booking.book(user, typeSlug, { start: step.start, ...guestOf(draft), timeZone, locale: lang });
      setStep({ kind: "done", start: res.start, end: res.end, ics: res.ics, manageUrl: res.manageUrl });
    } catch (err) {
      setError(errorMessage(t, err));
      if (err instanceof XenaxioApiError && err.code === "slot_taken") {
        setStep({ kind: "pick" });
        setReload((n) => n + 1);
      }
    } finally {
      setBusy(false);
    }
  };

  const submitRequest = async (e: FormEvent) => {
    e.preventDefault();
    const chosen = proposals.filter((p) => p.date && p.time).map((p) => zonedToUtc(`${p.date}T${p.time}`, timeZone).toISOString());
    if (!chosen.length) {
      setError(t("booking.errors.proposals_invalid"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await booking.request(user, typeSlug, { proposals: chosen, ...guestOf(draft), timeZone, locale: lang });
      setStep({ kind: "requested", proposals: res.proposals.length ? res.proposals : chosen });
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  };

  if (step.kind === "done") {
    return (
      <Message title={t("booking.done_title")} icon={<CheckCircle className="h-12 w-12 text-green-600" />}>
        <p className="text-base text-foreground">
          {type.title} – {person.name}
        </p>
        <p className="text-base font-medium text-foreground">{f.range(step.start, step.end)}</p>
        <PlaceLine t={t} kind={type.locationKind} value={type.location} />
        <p>{t("booking.done_mail", { email: draft.email.trim() })}</p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          {step.ics && (
            <button type="button" className={primaryButton} onClick={() => downloadIcs(step.ics, `${type.slug}.ics`)}>
              <Calendar className="h-4 w-4" />
              {t("booking.add_to_calendar")}
            </button>
          )}
          {step.manageUrl && (
            <a className={plainButton} href={step.manageUrl}>
              {t("booking.manage_link")}
            </a>
          )}
        </div>
      </Message>
    );
  }
  if (step.kind === "requested") {
    return (
      <Message title={t("booking.requested_title")} icon={<CheckCircle className="h-12 w-12 text-green-600" />}>
        <p>{t("booking.requested_text", { name: person.name })}</p>
        <ul className="space-y-1 text-foreground">
          {step.proposals.map((p) => (
            <li key={p}>{f.range(p, end(p))}</li>
          ))}
        </ul>
      </Message>
    );
  }

  const minDate = localDate(new Date(), timeZone);
  const maxDate = localDate(new Date(Date.now() + type.horizonDays * 86_400_000), timeZone);

  return (
    <div className="grid md:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="space-y-3 border-b border-border p-6 md:border-b-0 md:border-r">
        {step.kind !== "pick" && (
          <button type="button" onClick={() => (setStep({ kind: "pick" }), setError(null))} className="mb-2 inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" />
            {t("booking.back")}
          </button>
        )}
        <Avatar person={person} />
        <p className="text-sm text-muted-foreground">{person.name}</p>
        <h1 className="text-xl font-semibold">{type.title}</h1>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          {t("booking.minutes", { n: type.durationMinutes })}
        </p>
        <PlaceLine t={t} kind={type.locationKind} value={type.location} />
        {step.kind === "form" && (
          <p className="flex items-start gap-2 text-sm font-medium">
            <Calendar className="mt-0.5 h-4 w-4 shrink-0" />
            {f.range(step.start, end(step.start))}
          </p>
        )}
        {type.description && <p className="whitespace-pre-wrap pt-2 text-sm">{type.description}</p>}
      </aside>
      <section className="p-6">
        {error && (
          <div className="mb-4">
            <Notice kind="error">{error}</Notice>
          </div>
        )}
        {step.kind === "pick" && (
          <>
            <h2 className="mb-4 text-lg font-semibold">{t("booking.pick_title")}</h2>
            {type.hasHours ? (
              <SlotPicker
                t={t}
                lang={lang}
                timeZone={timeZone}
                setTimeZone={setTimeZone}
                horizonDays={type.horizonDays}
                load={load}
                onPick={(start) => (setStep({ kind: "form", start }), setError(null))}
                onNoFit={type.allowRequests ? () => setStep({ kind: "request" }) : undefined}
                reloadKey={reload}
              />
            ) : type.allowRequests ? (
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>{t("booking.no_hours")}</p>
                <button type="button" className={primaryButton} onClick={() => setStep({ kind: "request" })}>
                  {t("booking.ask_time")}
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("booking.no_times_month")}</p>
            )}
          </>
        )}
        {step.kind === "form" && (
          <form onSubmit={submitBooking} className="relative max-w-md space-y-4">
            <h2 className="text-lg font-semibold">{t("booking.details_title")}</h2>
            <GuestFields t={t} type={type} draft={draft} setDraft={setDraft} />
            <button type="submit" disabled={busy} className={primaryButton}>
              {busy ? t("booking.booking") : t("booking.book")}
            </button>
            <p className="text-xs text-muted-foreground">{t("booking.privacy_note", { name: person.name })}</p>
          </form>
        )}
        {step.kind === "request" && (
          <form onSubmit={submitRequest} className="relative max-w-md space-y-4">
            <h2 className="text-lg font-semibold">{t("booking.request_title")}</h2>
            <p className="text-sm text-muted-foreground">{t("booking.request_text", { name: person.name })}</p>
            <div className="space-y-2">
              {proposals.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    type="date"
                    aria-label={t("booking.proposal_date", { n: i + 1 })}
                    min={minDate}
                    max={maxDate}
                    required={i === 0}
                    value={p.date}
                    onChange={(e) => setProposals(proposals.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))}
                  />
                  <Input
                    type="time"
                    step={900}
                    aria-label={t("booking.proposal_time", { n: i + 1 })}
                    required={i === 0 || !!p.date}
                    value={p.time}
                    onChange={(e) => setProposals(proposals.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))}
                  />
                </div>
              ))}
              {proposals.length < 3 && (
                <button type="button" onClick={() => setProposals([...proposals, { date: "", time: "" }])} className="text-sm font-medium text-primary hover:underline">
                  {t("booking.add_proposal")}
                </button>
              )}
              <p className="text-xs text-muted-foreground">{t("booking.times_in", { zone: timeZone.replace(/_/g, " ") })}</p>
            </div>
            <GuestFields t={t} type={type} draft={draft} setDraft={setDraft} />
            <button type="submit" disabled={busy} className={primaryButton}>
              {busy ? t("booking.booking") : t("booking.send_request")}
            </button>
            <p className="text-xs text-muted-foreground">{t("booking.privacy_note", { name: person.name })}</p>
          </form>
        )}
      </section>
    </div>
  );
}

// --- The employee's meeting types --------------------------------------------------

function PersonPage({ t, user, onLegal }: { t: T; user: string; onLegal: (l: Legal) => void }) {
  const [data, setData] = useState<{ person: PublicPerson; types: PublicType[] } | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    booking
      .page(user)
      .then((r) => {
        setData(r);
        onLegal(r.legal);
        document.title = r.person.name;
      })
      .catch(() => setMissing(true));
  }, [user, onLegal]);
  if (missing) return <Message title={t("booking.not_found_title")}>{t("booking.not_found_text")}</Message>;
  if (!data) return <Message title={t("booking.loading")} />;
  return (
    <div className="p-6 sm:p-8">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <Avatar person={data.person} size={72} />
        <h1 className="text-xl font-semibold">{data.person.name}</h1>
        <p className="text-sm text-muted-foreground">{t("booking.choose_type")}</p>
      </div>
      {data.types.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">{t("booking.no_types")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.types.map((type) => (
            <li key={type.slug}>
              <a href={bookPath(data.person.slug, type.slug)} className="block h-full rounded-lg border border-border p-4 hover:border-primary hover:bg-muted/40" style={type.color ? { borderLeft: `4px solid ${type.color}` } : undefined}>
                <span className="block font-semibold">{type.title}</span>
                <span className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {t("booking.minutes", { n: type.durationMinutes })}
                </span>
                {type.description && <span className="mt-2 line-clamp-2 block text-sm text-muted-foreground">{type.description}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- The visitor's link: move or cancel ------------------------------------------------

function ManagePage({ t, lang, token }: { t: T; lang: Lang; token: string }) {
  const [view, setView] = useState<ManageView | null>(null);
  const [missing, setMissing] = useState(false);
  const [mode, setMode] = useState<"view" | "move" | "cancel">("view");
  const [timeZone, setTimeZone] = useState("Europe/Berlin");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const f = useFormat(lang, timeZone);

  useEffect(() => {
    setTimeZone(browserTimeZone());
    booking
      .manage(token)
      .then((r) => setView(r.booking))
      .catch(() => setMissing(true));
  }, [token]);
  const load = useCallback((from: Date, to: Date) => booking.manageSlots(token, from, to).then((r) => r.slots), [token]);

  if (missing) return <Message title={t("booking.link_invalid_title")}>{t("booking.link_invalid_text")}</Message>;
  if (!view) return <Message title={t("booking.loading")} />;

  const run = async (work: () => Promise<{ booking: ManageView }>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      setView((await work()).booking);
      setMode("view");
      setDone(message);
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  };
  const again = view.person.slug ? bookPath(view.person.slug, ...(view.typeSlug ? [view.typeSlug] : [])) : null;
  const status = t(`booking.status.${view.status}`);
  const meetingEnd = (s: string) => new Date(new Date(s).getTime() + view.durationMinutes * 60_000).toISOString();

  return (
    <div className="p-6 sm:p-8">
      <p className="text-sm text-muted-foreground">{view.person.name}</p>
      <h1 className="text-xl font-semibold">{view.title}</h1>
      <p className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{status}</p>
      <div className="mt-4 space-y-2">
        {view.start && view.end ? (
          <p className="flex items-start gap-2 text-sm font-medium">
            <Calendar className="mt-0.5 h-4 w-4 shrink-0" />
            {f.range(view.start, view.end)}
          </p>
        ) : (
          view.proposals.map((p) => (
            <p key={p} className="flex items-start gap-2 text-sm">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0" />
              {f.range(p, meetingEnd(p))}
            </p>
          ))
        )}
        {view.status === "confirmed" && <PlaceLine t={t} kind={view.place.kind} value={view.place.value} booked />}
        {view.status === "confirmed" && view.place.kind === "video" && view.place.value && safeHttpUrl(view.place.value) && (
          <a href={safeHttpUrl(view.place.value)} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline">
            {t("booking.join_call")}
          </a>
        )}
      </div>
      {done && (
        <div className="mt-4">
          <Notice kind="success">{done}</Notice>
        </div>
      )}
      {error && (
        <div className="mt-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      {view.canChange && mode === "view" && (
        <div className="mt-6 flex flex-wrap gap-2">
          {view.status === "confirmed" && view.typeSlug && (
            <button type="button" className={primaryButton} onClick={() => (setMode("move"), setDone(null))}>
              {t("booking.move")}
            </button>
          )}
          <button type="button" className={plainButton} onClick={() => (setMode("cancel"), setDone(null))}>
            {view.status === "requested" ? t("booking.withdraw") : t("booking.cancel")}
          </button>
        </div>
      )}
      {mode === "move" && (
        <div className="mt-6">
          <h2 className="mb-4 text-lg font-semibold">{t("booking.move_title")}</h2>
          <SlotPicker
            t={t}
            lang={lang}
            timeZone={timeZone}
            setTimeZone={setTimeZone}
            horizonDays={365}
            load={load}
            onPick={(start) => void run(() => booking.reschedule(token, start), t("booking.moved"))}
          />
          <button type="button" className={`${plainButton} mt-4`} onClick={() => setMode("view")} disabled={busy}>
            {t("booking.back")}
          </button>
        </div>
      )}
      {mode === "cancel" && (
        <form
          className="mt-6 max-w-md space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => booking.cancelByGuest(token, reason.trim() || undefined), view.status === "requested" ? t("booking.withdrawn") : t("booking.cancelled"));
          }}
        >
          {view.status === "confirmed" && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium">
                {t("booking.reason")} <span className="font-normal text-muted-foreground">({t("booking.optional")})</span>
              </span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
              {view.status === "requested" ? t("booking.withdraw") : t("booking.cancel_confirm")}
            </button>
            <button type="button" className={plainButton} onClick={() => setMode("view")}>
              {t("booking.back")}
            </button>
          </div>
        </form>
      )}
      {!view.canChange && view.status !== "confirmed" && again && (
        <a href={again} className={`${primaryButton} mt-6`}>
          {t("booking.book_again")}
        </a>
      )}
    </div>
  );
}

// --- Page ------------------------------------------------------------------------

export function BookingPage() {
  const [route, setRoute] = useState<Route | null>(null);
  const [lang, setLang] = useState<Lang>("de");
  const [legal, setLegal] = useState<Legal | null>(null);
  const t: T = useCallback((k, v) => translate(lang, k, v), [lang]);

  useEffect(() => {
    setLang(guestLocale());
    const read = () => setRoute(parseBookingRoute(window.location.pathname, window.location.hash));
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <Shell lang={lang} setLang={setLang} legal={legal}>
      {!route ? (
        <Message title={t("booking.loading")} />
      ) : route.kind === "type" ? (
        <TypePage key={`${route.user}/${route.type}`} t={t} lang={lang} user={route.user} typeSlug={route.type} onLegal={setLegal} />
      ) : route.kind === "person" ? (
        <PersonPage t={t} user={route.user} onLegal={setLegal} />
      ) : route.kind === "manage" ? (
        <ManagePage t={t} lang={lang} token={route.token} />
      ) : (
        <Message title={t("booking.not_found_title")}>{t("booking.not_found_text")}</Message>
      )}
    </Shell>
  );
}
