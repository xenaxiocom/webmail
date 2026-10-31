// Step 103: visitor statistics of the apps (Xenaxio and XenRooms) in our own
// Umami, like xenaxio.com and xenrooms.com. The platform says per address which
// Umami website counts it (/api/portal → stats); on-prem there is none, and
// nothing is loaded. The script comes from the app's own address
// (/_stats/script.js, the cloud's edge nginx), so no third party is involved.
//
// What leaves the browser: the screen as a template without ids or names
// (/mail, /workspace/users, /settings/<tab>), never a title, a query or a hash;
// an outside referrer only as its origin. The visit carries the company (its
// portal name), the product, the XenRooms plan, the role and whether the app
// is installed — never a person's name, email or id. No cookies; Umami keeps
// no IP; "Do Not Track" is honoured.
//
// Type-only imports: api.ts reports events through this file.
import type { Me, PortalState, PortalStats } from "@/lib/xenaxio/api";

/** The events worth counting (one list, easy to extend). */
export type StatsEvent =
  | "sign-in"
  | "sign-out"
  | "account-switch"
  | "invitation-accepted"
  | "signup-start"
  | "signup-verified"
  | "signup-done"
  | "app-installed"
  | "assistant-open"
  | "meeting-join"
  | "booking-done"
  | "booking-requested"
  | "webinar-registered";

export type StatsConfig = NonNullable<PortalStats["stats"]>;

/** What the visit is counted under: the company, never the person. */
export type StatsSession = Record<string, string>;

const SCRIPT_PATH = "/_stats/script.js";
const HOST_URL = "/_stats";
const BEFORE_SEND = "__xenaxioStatsBeforeSend";
const LOCALES = new Set(["de", "en"]);

/** Top-level screens of the app; anything else is counted as "/other". */
const SECTIONS = new Set([
  "apps", "auth", "book", "calendar", "chat", "connect", "contacts", "demo", "files", "flows", "login",
  "mail", "meet", "meetings", "onboarding", "plugins", "pro", "rooms", "settings", "start", "workspace",
]);
/** Screens whose deeper parts are fixed page names (no ids or names inside). */
const DEEP = new Map<string, number>([
  ["workspace", 3],
  ["settings", 1],
  ["rooms", 1],
]);
/** A page name, not an id: lower-case words joined by "-". */
const PAGE_NAME = /^[a-z]+(?:-[a-z]+)*$/;

/**
 * The screen as a template: `/de/mail/inbox/<id>` → `/mail`,
 * `/en/workspace/ai/permissions` → `/workspace/ai/permissions`, `/` → `/`.
 * null for the operator console (never counted).
 */
export function cleanPath(pathname: string): string | null {
  let segments = pathname.split("/").filter(Boolean);
  // The locale, also behind a mount prefix (/webmail/de/…).
  const at = segments.findIndex((s) => LOCALES.has(s));
  if (at >= 0 && at <= 1) segments = segments.slice(at + 1);
  if (segments.length === 0) return "/";
  const [section, ...rest] = segments;
  if (section === "operator" || section === "admin") return null;
  if (!SECTIONS.has(section)) return "/other";
  const keep: string[] = [section];
  for (const part of rest.slice(0, DEEP.get(section) ?? 0)) {
    if (!PAGE_NAME.test(part) || part.length > 40) break;
    keep.push(part);
  }
  return `/${keep.join("/")}`;
}

/** A referrer on this address → its template; an outside one → its origin only. */
export function cleanReferrer(referrer: unknown, origin: string): string {
  if (typeof referrer !== "string" || !referrer) return "";
  try {
    const url = new URL(referrer, origin);
    if (url.origin === origin) return cleanPath(url.pathname) ?? "";
    return url.protocol === "https:" || url.protocol === "http:" ? `${url.origin}/` : "";
  } catch {
    return "";
  }
}

/**
 * Runs on every payload before it is sent (Umami's data-before-send): page
 * views, events, the visit's data and the page speed. null = not sent.
 */
export function cleanPayload(type: string, payload: Record<string, unknown>, origin: string): Record<string, unknown> | null {
  let path: string | null = "/";
  try {
    path = cleanPath(new URL(String(payload.url ?? "/"), origin).pathname);
  } catch {
    path = "/";
  }
  if (path === null) return null;
  const clean: Record<string, unknown> = { ...payload, url: path, title: path, referrer: cleanReferrer(payload.referrer, origin) };
  // A person is never identified; only the visit's own data goes along.
  delete clean.id;
  if (type === "event" && clean.data !== undefined && !isFlat(clean.data)) delete clean.data;
  return clean;
}

function isFlat(data: unknown): boolean {
  return !!data && typeof data === "object" && !Array.isArray(data) && Object.values(data).every((v) => ["string", "number", "boolean"].includes(typeof v));
}

/** Installed (PWA or XenRooms for the computer) or in a browser tab. */
export function appKind(win: Pick<Window, "matchMedia" | "navigator">): "installed" | "browser" {
  try {
    if (win.matchMedia("(display-mode: standalone)").matches || win.matchMedia("(display-mode: window-controls-overlay)").matches) return "installed";
  } catch {
    // No matchMedia: a browser.
  }
  return /\bElectron\//.test(win.navigator.userAgent) ? "installed" : "browser";
}

/** The visit's data: company (portal name), product, plan, role, how the app is open. */
export function sessionData(config: StatsConfig, me: Me | null, app: "installed" | "browser"): StatsSession {
  const data: StatsSession = { product: config.product, app };
  if (!me) return { ...data, visitor: "guest" };
  data.visitor = "account";
  data.role = me.user.role;
  // Live demo guests share demo companies; they count as one.
  data.company = me.demo ? "demo" : me.portal?.slug || "unknown";
  if (me.tenant.plan) data.plan = me.tenant.plan;
  return data;
}

// --- The tracker -------------------------------------------------------------

interface Umami {
  track: (name?: string, data?: Record<string, string | number | boolean>) => Promise<void>;
  identify: (data: Record<string, string>) => Promise<void>;
}

type StatsWindow = Window & { umami?: Umami; [BEFORE_SEND]?: (type: string, payload: Record<string, unknown>) => Record<string, unknown> | null };

let started = false;
let ready = false;
const queue: (() => void)[] = [];
let lastSession = "";

function umami(): Umami | null {
  return typeof window === "undefined" ? null : ((window as StatsWindow).umami ?? null);
}

function run(fn: () => void): void {
  if (ready) fn();
  else if (started) queue.push(fn);
  // Not started (on-prem, outside the cloud): nothing is counted.
}

/** Counts an event; waits for the script, nothing at all without statistics. */
export function statsEvent(name: StatsEvent, data?: Record<string, string | number | boolean>): void {
  run(() => void umami()?.track(name, data).catch(() => {}));
}

/** For promise chains: counts the event once the call succeeded and passes the value on. */
export function tapStats<T>(name: StatsEvent): (value: T) => T {
  return (value) => {
    statsEvent(name);
    return value;
  };
}

/** Sends the visit's data once it changes (after sign-in, on another account). */
export function statsSession(data: StatsSession): void {
  const key = JSON.stringify(data);
  if (key === lastSession) return;
  lastSession = key;
  run(() => void umami()?.identify(data).catch(() => {}));
}

/** Loads Umami's script once, if this address has statistics. */
export function startStats(portal: PortalState | null): void {
  const config = portal && "stats" in portal ? portal.stats : undefined;
  if (started || typeof document === "undefined" || !config) return;
  started = true;
  const win = window as StatsWindow;
  win[BEFORE_SEND] = (type, payload) => cleanPayload(type, payload, window.location.origin);
  const script = document.createElement("script");
  script.defer = true;
  script.src = SCRIPT_PATH;
  script.dataset.websiteId = config.websiteId;
  script.dataset.hostUrl = HOST_URL;
  script.dataset.beforeSend = BEFORE_SEND;
  script.dataset.doNotTrack = "true";
  script.dataset.excludeSearch = "true";
  script.dataset.excludeHash = "true";
  script.addEventListener("load", () => {
    ready = true;
    for (const fn of queue.splice(0)) fn();
  });
  document.head.appendChild(script);
  // The app was installed from this page.
  window.addEventListener("appinstalled", () => statsEvent("app-installed"));
}

/** Tests only. */
export function resetStatsForTests(): void {
  started = false;
  ready = false;
  queue.length = 0;
  lastSession = "";
}
