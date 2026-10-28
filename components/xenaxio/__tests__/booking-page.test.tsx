import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useLocale: () => "de" }));
const portal = vi.hoisted(() => ({ current: { kind: "tenant", name: "Acme", logoUrl: null, background: null as string | null } }));
vi.mock("@/lib/xenaxio/portal", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/portal")>()), usePortal: () => portal.current }));

const api = vi.hoisted(() => ({
  type: vi.fn(),
  slots: vi.fn(),
  book: vi.fn(),
  request: vi.fn(),
  page: vi.fn(),
  manage: vi.fn(),
  manageSlots: vi.fn(),
  reschedule: vi.fn(),
  cancelByGuest: vi.fn(),
  avatarUrl: (u: string) => `/api/public/book/${u}/avatar`,
}));
vi.mock("@/lib/xenaxio/booking", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/booking")>()), booking: api }));

import { XenaxioApiError } from "@/lib/xenaxio/api";
import { addDays, embedUrl, localDate, parseEmbed, zonedToUtc } from "@/lib/xenaxio/booking";
import { accentStyle, BookingPage, parseBookingRoute } from "../booking-page";
import { embedCode, slugify } from "../booking-settings";

const TOKEN = "a".repeat(43);
const type = {
  slug: "demo",
  title: "Demo",
  description: "Wir zeigen Xenaxio.",
  color: null,
  durationMinutes: 30,
  locationKind: "video" as const,
  location: "",
  askPhone: "off" as const,
  askMessage: "optional" as const,
  allowRequests: true,
  hasHours: true,
  horizonDays: 60,
  minNoticeMinutes: 60,
};
const person = { slug: "eugen", name: "Eugen Schmidt", hasAvatar: false, timeZone: "Europe/Berlin" };
const hhmm = (d: Date) => new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(d);

function at(path: string, hash = "") {
  window.history.replaceState(null, "", `${path}${hash}`);
}

describe("step 56: booking helpers", () => {
  it("reads the address of the page", () => {
    expect(parseBookingRoute("/book/eugen/demo", "")).toEqual({ kind: "type", user: "eugen", type: "demo" });
    expect(parseBookingRoute("/book/eugen/", "")).toEqual({ kind: "person", user: "eugen" });
    expect(parseBookingRoute("/book/manage/", `#${TOKEN}`)).toEqual({ kind: "manage", token: TOKEN });
    expect(parseBookingRoute("/book/manage/", "#short")).toEqual({ kind: "none" });
    expect(parseBookingRoute("/book/Eugen/<x>", "")).toEqual({ kind: "none" });
    expect(parseBookingRoute("/en/book/", "")).toEqual({ kind: "none" });
  });

  it("converts wall-clock times of a zone, across the change to winter time", () => {
    expect(zonedToUtc("2026-10-24T09:00", "Europe/Berlin").toISOString()).toBe("2026-10-24T07:00:00.000Z");
    expect(zonedToUtc("2026-10-26T09:00", "Europe/Berlin").toISOString()).toBe("2026-10-26T08:00:00.000Z");
    expect(zonedToUtc("2026-11-02", "Asia/Tokyo").toISOString()).toBe("2026-11-01T15:00:00.000Z");
    expect(localDate(new Date("2026-11-01T23:30:00Z"), "Europe/Berlin")).toBe("2026-11-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("makes link parts and the code for a website", () => {
    expect(slugify("Erstgespräch Steuer & Buchhaltung!")).toBe("erstgespraech-steuer-buchhaltung");
    expect(slugify("  Demo  ")).toBe("demo");
    const code = embedCode('https://acme.xenaxio.com/book/eugen/demo"><script>', "Demo", "Termin buchen");
    expect(code.frame).toBe('<iframe src="https://acme.xenaxio.com/book/eugen/demoscript" title="Demo" style="width:100%;min-height:760px;border:0" loading="lazy"></iframe>');
    expect(code.link).not.toContain("<script>");
  });
});

describe("step 56: public booking page", () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) if (typeof fn === "function" && "mockReset" in fn) fn.mockReset();
    Object.defineProperty(navigator, "languages", { value: ["de-DE"], configurable: true });
  });

  it("shows the free times of a day, books one and confirms", async () => {
    at("/book/eugen/demo");
    const start = new Date(Date.now() + 2 * 86_400_000);
    start.setUTCHours(9, 0, 0, 0);
    api.type.mockResolvedValue({ person, type, legal: { imprintUrl: null, privacyUrl: "https://acme.de/datenschutz" } });
    api.slots.mockResolvedValue({ slots: [start.toISOString()] });
    api.book.mockResolvedValue({ status: "confirmed", start: start.toISOString(), end: new Date(start.getTime() + 1_800_000).toISOString(), title: "Demo", ics: "BEGIN:VCALENDAR", manageUrl: `https://acme.test/book/manage/#${TOKEN}` });
    render(<BookingPage />);

    expect(await screen.findByRole("heading", { name: "Demo" })).toBeTruthy();
    expect(screen.getByText("Datenschutz").getAttribute("href")).toBe("https://acme.de/datenschutz");
    // Step 58: the tab title as in the link preview, kept when Next puts its own back.
    await waitFor(() => expect(document.title).toBe("Demo – Eugen Schmidt · Acme"));
    const appTitle = document.createElement("title");
    appTitle.textContent = "Webmail";
    document.head.prepend(appTitle);
    await waitFor(() => expect(document.title).toBe("Demo – Eugen Schmidt · Acme"));
    appTitle.remove();
    // The slot may fall into next month for the calendar: open the month that holds it.
    const time = await screen.findByRole("button", { name: hhmm(start) }).catch(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nächster Monat" }));
      return screen.findByRole("button", { name: hhmm(start) });
    });
    fireEvent.click(time);
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Max Muster" } });
    fireEvent.change(screen.getByLabelText(/^E-Mail/), { target: { value: "max@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Termin buchen" }));

    expect(await screen.findByText("Termin gebucht")).toBeTruthy();
    expect(api.book).toHaveBeenCalledWith("eugen", "demo", expect.objectContaining({ start: start.toISOString(), name: "Max Muster", email: "max@example.com", locale: "de" }));
    expect(screen.getByText("Eine Bestätigung mit Kalendereinladung ist an max@example.com unterwegs.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Verschieben oder absagen" }).getAttribute("href")).toContain("/book/manage/#");
  });

  it("goes back to the times when the slot was just taken", async () => {
    at("/book/eugen/demo");
    const start = new Date(Date.now() + 2 * 86_400_000);
    start.setUTCHours(10, 0, 0, 0);
    api.type.mockResolvedValue({ person, type, legal: { imprintUrl: null, privacyUrl: null } });
    api.slots.mockResolvedValue({ slots: [start.toISOString()] });
    api.book.mockRejectedValue(new XenaxioApiError(409, "slot_taken"));
    render(<BookingPage />);
    const time = await screen.findByRole("button", { name: hhmm(start) }).catch(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nächster Monat" }));
      return screen.findByRole("button", { name: hhmm(start) });
    });
    fireEvent.click(time);
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Max" } });
    fireEvent.change(screen.getByLabelText(/^E-Mail/), { target: { value: "max@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Termin buchen" }));
    expect(await screen.findByText("Diese Zeit wurde gerade vergeben. Bitte wählen Sie eine andere.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Tag und Uhrzeit wählen" })).toBeTruthy();
  });

  it("without free time: asks for a time", async () => {
    at("/book/eugen/demo");
    api.type.mockResolvedValue({ person, type: { ...type, hasHours: false }, legal: { imprintUrl: null, privacyUrl: null } });
    api.request.mockResolvedValue({ status: "requested", proposals: ["2026-12-01T09:00:00.000Z"] });
    render(<BookingPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Wunschtermin anfragen" }));
    fireEvent.change(screen.getByLabelText("Datum, Vorschlag 1"), { target: { value: "2026-12-01" } });
    fireEvent.change(screen.getByLabelText("Uhrzeit, Vorschlag 1"), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Max" } });
    fireEvent.change(screen.getByLabelText(/^E-Mail/), { target: { value: "max@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Anfrage senden" }));
    expect(await screen.findByText("Anfrage gesendet")).toBeTruthy();
    expect(api.request).toHaveBeenCalledWith("eugen", "demo", expect.objectContaining({ proposals: [expect.any(String)], name: "Max" }));
  });

  it("the visitor's link: shows the meeting and cancels it", async () => {
    at("/book/manage/", `#${TOKEN}`);
    const view = {
      status: "confirmed" as const,
      title: "Demo",
      start: "2026-12-01T09:00:00.000Z",
      end: "2026-12-01T09:30:00.000Z",
      proposals: [],
      durationMinutes: 30,
      place: { kind: "video" as const, value: "https://meet.example/eugen" },
      person: { slug: "eugen", name: "Eugen Schmidt" },
      typeSlug: "demo",
      canChange: true,
      timeZone: "Europe/Berlin",
      locale: "de" as const,
    };
    api.manage.mockResolvedValue({ booking: view });
    api.cancelByGuest.mockResolvedValue({ booking: { ...view, status: "cancelled", canChange: false } });
    render(<BookingPage />);
    expect(await screen.findByText("Gebucht")).toBeTruthy();
    expect(api.manage).toHaveBeenCalledWith(TOKEN);
    expect(screen.getByText("Videoanruf")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Zum Videoanruf" }).getAttribute("href")).toBe("https://meet.example/eugen");
    fireEvent.click(screen.getByRole("button", { name: "Absagen" }));
    fireEvent.change(screen.getByLabelText(/Grund/), { target: { value: "krank" } });
    fireEvent.click(screen.getByRole("button", { name: "Termin absagen" }));
    await waitFor(() => expect(api.cancelByGuest).toHaveBeenCalledWith(TOKEN, "krank"));
    expect(await screen.findByText("Der Termin ist abgesagt.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Neuen Termin buchen" }).getAttribute("href")).toBe("/book/eugen/demo");
  });

  it("an unknown page says so", async () => {
    at("/book/eugen/nope");
    api.type.mockRejectedValue(new XenaxioApiError(404, "booking_not_found"));
    render(<BookingPage />);
    expect(await screen.findByText("Termin nicht verfügbar")).toBeTruthy();
  });
});

describe("step 56: look of the booking page", () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) if (typeof fn === "function" && "mockReset" in fn) fn.mockReset();
    Object.defineProperty(navigator, "languages", { value: ["de-DE"], configurable: true });
    document.documentElement.className = "";
    portal.current = { kind: "tenant", name: "Acme", logoUrl: null, background: null };
    api.slots.mockResolvedValue({ slots: [] });
  });

  it("reads and builds the embedding parameters", () => {
    expect(parseEmbed("?embed=1&theme=dark&bg=transparent&color=0F766E&details=0")).toEqual({ embed: true, theme: "dark", background: "transparent", color: "#0f766e", details: false });
    expect(parseEmbed("?theme=blue&bg=red&color=javascript:x")).toEqual({ embed: false, theme: null, background: null, color: null, details: true });
    expect(embedUrl("https://a.test/book/eugen/demo", { theme: "light", transparent: true, details: false })).toBe("https://a.test/book/eugen/demo?embed=1&theme=light&bg=transparent&details=0");
    expect(embedUrl("https://a.test/book/eugen/demo", {})).toBe("https://a.test/book/eugen/demo?embed=1");
  });

  it("makes the accent readable or leaves it out", () => {
    expect(accentStyle("#0f766e", false)).toEqual({ "--color-primary": "#0f766e", "--color-primary-foreground": "#ffffff", "--color-ring": "#0f766e" });
    expect(accentStyle("#fde047", false)).toMatchObject({ "--color-primary-foreground": "#111111" });
    // Dark navy on the dark page: unreadable, the company colour stays.
    expect(accentStyle("#0b1020", true)).toBeUndefined();
    expect(accentStyle(null, false)).toBeUndefined();
  });

  it("the company's dark theme, its background and the type's colour", async () => {
    at("/book/eugen/demo");
    portal.current = { ...portal.current, background: "img-aurora" };
    api.type.mockResolvedValue({ person, type: { ...type, color: "#0f766e" }, legal: { imprintUrl: null, privacyUrl: null }, look: { theme: "dark" } });
    const { container } = render(<BookingPage />);
    expect(await screen.findByRole("heading", { name: "Demo" })).toBeTruthy();
    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
    const main = container.querySelector("main")!;
    expect(main.style.getPropertyValue("--color-primary")).toBe("#0f766e");
    expect(main.style.background).toContain("aurora");
    // The logo row stays outside a frame.
    expect(screen.getByRole("group", { name: "Sprache" })).toBeTruthy();
  });

  it("embedded: no header, no description column, transparent, the website's colour", async () => {
    at("/book/eugen/demo?embed=1&bg=transparent&details=0&color=dc2626&theme=light");
    api.type.mockResolvedValue({ person, type: { ...type, color: "#0f766e" }, legal: { imprintUrl: null, privacyUrl: "https://acme.de/datenschutz" }, look: { theme: "dark" } });
    const { container } = render(<BookingPage />);
    expect(await screen.findByText("Demo")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Sprache" })).toBeNull();
    expect(screen.queryByText("Wir zeigen Xenaxio.")).toBeNull();
    // The legal links stay.
    expect(screen.getByText("Datenschutz")).toBeTruthy();
    await waitFor(() => expect(document.documentElement.classList.contains("light")).toBe(true));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(container.querySelector("main")!.style.getPropertyValue("--color-primary")).toBe("#dc2626");
    expect(container.querySelector("style")?.textContent).toContain("background:transparent");
    expect(document.documentElement.style.colorScheme).toBe("normal");
  });
});

