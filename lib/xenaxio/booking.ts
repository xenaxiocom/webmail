// Step 56: online booking. The employee's settings (signed in) and the public
// booking pages (/book/<employee>/<type>, /book/manage/#<token>), which
// visitors open without an account.
import { apiFetch } from "@/lib/browser-navigation";
import { XenaxioApiError } from "@/lib/xenaxio/api";

// Whole paths, so the Lite build check (scripts/lite/lib.mjs) sees each one.
const BOOKING = "/api/booking";
const ADMIN_BOOKING = "/api/admin/booking";
const PUBLIC_BOOK = "/api/public/book";

export const WEEKDAYS = ["mo", "tu", "we", "th", "fr", "sa", "su"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type Hours = Partial<Record<Weekday, [string, string][]>>;
export type LocationKind = "video" | "phone" | "address" | "none" | "meeting";
export type Ask = "off" | "optional" | "required";

export interface BookingTypeInput {
  slug: string;
  title: string;
  description: string;
  color: string | null;
  durationMinutes: number;
  locationKind: LocationKind;
  location: string;
  hours: Hours;
  bufferBefore: number;
  bufferAfter: number;
  minNoticeMinutes: number;
  horizonDays: number;
  slotStepMinutes: number;
  maxPerDay: number | null;
  calendarId: string | null;
  busyCalendarIds: string[] | null;
  askPhone: Ask;
  askMessage: Ask;
  /** Step 77: the visitor's company (it goes to Salesforce as the lead's company). */
  askCompany: Ask;
  allowRequests: boolean;
  reminder: boolean;
  active: boolean;
}

export interface BookingType extends BookingTypeInput {
  id: string;
  url: string | null;
}

export interface BookingSettings {
  /** The company allows online booking. */
  enabled: boolean;
  profile: { slug: string; timeZone: string; notify: boolean; url: string };
  name: string;
  types: BookingType[];
  calendars: { id: string; name: string; color: string | null; isDefault: boolean }[];
}

export interface Guest {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  message?: string;
}

export interface BookingItem {
  id: string;
  status: "confirmed" | "requested" | "declined" | "cancelled" | "withdrawn" | "expired";
  title: string;
  start: string | null;
  end: string | null;
  proposals: { start: string; end: string; conflict: boolean }[];
  guest: Guest | null;
  timeZone: string;
  createdAt: string;
}

export interface PublicType {
  slug: string;
  title: string;
  description: string;
  color: string | null;
  durationMinutes: number;
  locationKind: LocationKind;
  location: string;
  askPhone: Ask;
  askMessage: Ask;
  askCompany: Ask;
  allowRequests: boolean;
  hasHours: boolean;
  horizonDays: number;
  minNoticeMinutes: number;
}

export interface PublicPerson {
  slug: string;
  name: string;
  hasAvatar: boolean;
  timeZone: string;
}

export interface Legal {
  imprintUrl: string | null;
  privacyUrl: string | null;
}

export type BookingTheme = "auto" | "light" | "dark";

/** How the company's booking pages look (background and colour come with the portal). */
export interface Look {
  theme: BookingTheme;
}

/** What a website that embeds the page asks for (address parameters, like Calendly's). */
export interface EmbedOptions {
  /** No header with the logo and no outer margins. */
  embed: boolean;
  theme: "light" | "dark" | null;
  /** "transparent" or "#rrggbb". */
  background: string | null;
  /** Accent "#rrggbb". */
  color: string | null;
  /** The column with the person, the description and the place. */
  details: boolean;
}

const hexParam = (v: string | null) => {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(v ?? "");
  return m ? `#${m[1]!.toLowerCase()}` : null;
};

/** ?embed=1&theme=dark&bg=transparent&color=0f766e&details=0 */
export function parseEmbed(search: string): EmbedOptions {
  const q = new URLSearchParams(search);
  const theme = q.get("theme");
  const bg = q.get("bg");
  return {
    embed: q.get("embed") === "1",
    theme: theme === "light" || theme === "dark" ? theme : null,
    background: bg === "transparent" ? "transparent" : hexParam(bg),
    color: hexParam(q.get("color")),
    details: q.get("details") !== "0",
  };
}

/** The address a website embeds; only what differs from the defaults goes in. */
export function embedUrl(url: string, opts: { theme?: "light" | "dark" | null; transparent?: boolean; details?: boolean }): string {
  const q = new URLSearchParams({ embed: "1" });
  if (opts.theme) q.set("theme", opts.theme);
  if (opts.transparent) q.set("bg", "transparent");
  if (opts.details === false) q.set("details", "0");
  return `${url}?${q.toString()}`;
}

export interface ManageView {
  status: BookingItem["status"];
  title: string;
  start: string | null;
  end: string | null;
  proposals: string[];
  durationMinutes: number;
  place: { kind: LocationKind; value: string };
  person: { slug: string; name: string };
  typeSlug: string | null;
  canChange: boolean;
  timeZone: string;
  locale: "de" | "en";
}

export interface AdminBooking {
  enabled: boolean;
  imprintUrl: string | null;
  privacyUrl: string | null;
  theme: BookingTheme;
  /** Step 77: new bookings and requests go to this Salesforce org as leads (Web-to-Lead). */
  salesforceOrgId: string | null;
  /** The lead's Lead Source; it must exist in Salesforce. */
  leadSource: string | null;
}

export interface BookedResult {
  status: "confirmed";
  start: string;
  end: string;
  title: string;
  ics: string;
  manageUrl: string;
}

async function call<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(path, {
      method,
      credentials: "same-origin",
      headers: { Accept: "application/json", "x-xenaxio-csrf": "1", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new XenaxioApiError(0, "network");
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new XenaxioApiError(
      res.status,
      typeof data.error === "string" ? data.error : "internal",
      data.details as Record<string, unknown> | undefined,
      data.issues as { path: string; message: string }[] | undefined,
    );
  }
  return data as T;
}

const seg = (s: string) => encodeURIComponent(s);

export const booking = {
  // The employee.
  settings: () => call<BookingSettings>("GET", BOOKING),
  updateProfile: (patch: { slug?: string; timeZone?: string; notify?: boolean }) => call<BookingSettings>("PUT", `${BOOKING}/profile`, patch),
  createType: (input: BookingTypeInput) => call<{ type: BookingType }>("POST", `${BOOKING}/types`, input),
  updateType: (id: string, input: BookingTypeInput) => call<{ type: BookingType }>("PUT", `${BOOKING}/types/${seg(id)}`, input),
  deleteType: (id: string) => call<{ ok: true }>("DELETE", `${BOOKING}/types/${seg(id)}`),
  bookings: () => call<{ upcoming: BookingItem[]; requests: BookingItem[] }>("GET", `${BOOKING}/bookings`),
  confirm: (id: string, index: number) => call<{ booking: BookingItem }>("POST", `${BOOKING}/bookings/${seg(id)}/confirm`, { index }),
  decline: (id: string, message?: string) => call<{ ok: true }>("POST", `${BOOKING}/bookings/${seg(id)}/decline`, message ? { message } : {}),
  cancel: (id: string, message?: string) => call<{ ok: true }>("POST", `${BOOKING}/bookings/${seg(id)}/cancel`, message ? { message } : {}),
  // The company's admin.
  admin: () => call<AdminBooking>("GET", ADMIN_BOOKING),
  setAdmin: (patch: Partial<AdminBooking>) => call<AdminBooking>("PUT", ADMIN_BOOKING, patch),
  // Visitors.
  page: (user: string) => call<{ person: PublicPerson; types: PublicType[]; legal: Legal; look?: Look }>("GET", `${PUBLIC_BOOK}/${seg(user)}`),
  avatarUrl: (user: string) => `${PUBLIC_BOOK}/${seg(user)}/avatar`,
  type: (user: string, type: string) => call<{ person: PublicPerson; type: PublicType; legal: Legal; look?: Look }>("GET", `${PUBLIC_BOOK}/${seg(user)}/${seg(type)}`),
  slots: (user: string, type: string, from: Date, to: Date) =>
    call<{ slots: string[] }>("GET", `${PUBLIC_BOOK}/${seg(user)}/${seg(type)}/slots?from=${seg(from.toISOString())}&to=${seg(to.toISOString())}`),
  book: (user: string, type: string, input: Guest & { start: string; timeZone: string; locale: string; website?: string; page?: string }) =>
    call<BookedResult>("POST", `${PUBLIC_BOOK}/${seg(user)}/${seg(type)}/bookings`, input),
  request: (user: string, type: string, input: Guest & { proposals: string[]; timeZone: string; locale: string; website?: string; page?: string }) =>
    call<{ status: "requested"; proposals: string[] }>("POST", `${PUBLIC_BOOK}/${seg(user)}/${seg(type)}/requests`, input),
  manage: (token: string) => call<{ booking: ManageView }>("POST", `${PUBLIC_BOOK}/manage`, { token }),
  manageSlots: (token: string, from: Date, to: Date) => call<{ slots: string[] }>("POST", `${PUBLIC_BOOK}/manage/slots`, { token, from: from.toISOString(), to: to.toISOString() }),
  reschedule: (token: string, start: string) => call<{ booking: ManageView }>("POST", `${PUBLIC_BOOK}/manage/reschedule`, { token, start }),
  cancelByGuest: (token: string, reason?: string) => call<{ booking: ManageView }>("POST", `${PUBLIC_BOOK}/manage/cancel`, { token, ...(reason ? { reason } : {}) }),
};

// --- Time zones without a date library --------------------------------------

const formatters = new Map<string, Intl.DateTimeFormat>();
function parts(date: Date, timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    formatters.set(timeZone, f);
  }
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(date)) if (x.type !== "literal") p[x.type] = Number(x.value);
  return { year: p.year!, month: p.month!, day: p.day!, hour: p.hour!, minute: p.minute!, second: p.second! };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-11-02" in the zone. */
export function localDate(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "2026-11-02T09:30" in the zone. */
export function localDateTime(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** The instant of a wall-clock time ("2026-11-02T09:30" or "2026-11-02") in a zone. */
export function zonedToUtc(local: string, timeZone: string): Date {
  const [d, t = "00:00"] = local.split("T");
  const [y, mo, da] = (d ?? "").split("-").map(Number) as [number, number, number];
  const [h, mi] = t.split(":").map(Number) as [number, number];
  const wall = Date.UTC(y, mo - 1, da, h, mi);
  const offset = (at: number) => {
    const p = parts(new Date(at), timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at / 1000) * 1000;
  };
  let guess = wall - offset(wall);
  guess = wall - offset(guess);
  return new Date(guess);
}

/** Adds days to "2026-11-02". */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** The browser's zone, or Berlin. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin";
  } catch {
    return "Europe/Berlin";
  }
}

/** Every zone the browser knows (for the zone picker), with the given ones first. */
export function timeZones(first: string[] = []): string[] {
  let all: string[] = [];
  try {
    all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    all = [];
  }
  return [...new Set([...first.filter(Boolean), ...all])];
}

/** The page's language: German or English (browser), unless chosen. */
export function guestLocale(): "de" | "en" {
  if (typeof navigator === "undefined") return "de";
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const l of langs) {
    if (l?.toLowerCase().startsWith("de")) return "de";
    if (l?.toLowerCase().startsWith("en")) return "en";
  }
  return "en";
}

/** A text file for the visitor's calendar ("In Kalender speichern"). */
export function downloadIcs(ics: string, name = "termin.ics"): void {
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
