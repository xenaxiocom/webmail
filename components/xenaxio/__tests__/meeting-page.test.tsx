import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Step 78: the meeting page. LiveKit itself is not loaded here: the pre-join
// screen and the room are stand-ins; the flow (who enters, who waits) is real.
vi.mock("@/lib/xenaxio/portal", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/portal")>()), usePortal: () => ({ kind: "tenant", name: "Acme", logoUrl: null, color: "#0b5cff" }) }));
vi.mock("../meet/prejoin", () => ({
  PreJoin: ({ askName, submitLabel, onSubmit }: { askName: boolean; submitLabel: string; onSubmit: (c: object) => void }) => (
    <button type="button" onClick={() => onSubmit({ name: askName ? "Erika Gast" : "", video: false, audio: true, videoDeviceId: "", audioDeviceId: "" })}>
      {submitLabel}
    </button>
  ),
}));
vi.mock("../meet/room", () => ({
  MeetingRoom: ({ token, member, onLeave, kind, role, guest }: { token: string; member: boolean; onLeave: (r: string) => void; kind?: string; role?: string; guest?: { guestId?: string; registrationId?: string } | null }) => (
    <div>
      <p data-testid="room">
        {token} {member ? "member" : "guest"}
      </p>
      <p data-testid="role">
        {kind} {role} {guest?.guestId ?? guest?.registrationId ?? "-"}
      </p>
      <button type="button" onClick={() => onLeave("removed")}>
        kick
      </button>
    </div>
  ),
}));
const api = vi.hoisted(() => ({ info: vi.fn(), join: vi.fn(), knock: vi.fn(), guestStatus: vi.fn(), register: vi.fn(), registration: vi.fn(), joinRegistered: vi.fn(), cancelRegistration: vi.fn() }));
vi.mock("@/lib/xenaxio/meet", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/meet")>()), meet: api }));

import { XenaxioApiError } from "@/lib/xenaxio/api";
import { MeetingPage } from "../meet/meeting-page";

const CODE = "abcdefghjk23";
const info = { title: "Kickoff Müller", company: "Acme GmbH", state: "open", guests: true, member: false };

beforeEach(() => {
  window.history.replaceState(null, "", `/meet/${CODE}`);
  localStorage.setItem("locale-storage", JSON.stringify({ state: { locale: "de" } }));
  for (const fn of Object.values(api)) fn.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  sessionStorage.clear();
  localStorage.clear();
});

describe("step 78: meeting page", () => {
  it("lets someone of the company in directly", async () => {
    api.info.mockResolvedValue({ ...info, member: true });
    api.join.mockResolvedValue({ token: "tok-anna", signalPath: "/api/meet/rtc", identity: "u:1", title: "Kickoff Müller" });
    render(<MeetingPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Beitreten" }));
    expect(await screen.findByTestId("room")).toHaveTextContent("tok-anna member");
    expect(api.info).toHaveBeenCalledWith(CODE);
    expect(api.knock).not.toHaveBeenCalled();
  });

  it("lets someone of the company go back before joining; a guest gets no such button", async () => {
    api.info.mockResolvedValue({ ...info, member: true });
    const assign = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, assign, origin: window.location.origin, pathname: window.location.pathname } as Location);
    const { unmount } = render(<MeetingPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Zurück zu Acme" }));
    expect(assign).toHaveBeenCalledWith("/");
    expect(api.join).not.toHaveBeenCalled();
    unmount();
    vi.restoreAllMocks();
    api.info.mockResolvedValue(info);
    render(<MeetingPage />);
    await screen.findByRole("button", { name: "Teilnahme anfragen" });
    expect(screen.queryByRole("button", { name: /Zurück zu/ })).toBeNull();
  });

  it("makes a guest wait until admitted, and keeps the place on reload", async () => {
    api.info.mockResolvedValue(info);
    api.knock.mockResolvedValue({ guestId: "g1", key: "k".repeat(32), state: "waiting" });
    api.guestStatus.mockResolvedValue({ state: "waiting" });
    render(<MeetingPage />);
    expect(await screen.findByText("Besprechung bei Acme GmbH")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Teilnahme anfragen" }));
    expect(await screen.findByText("Bitte einen Moment")).toBeInTheDocument();
    expect(api.knock).toHaveBeenCalledWith(CODE, "Erika Gast");
    await waitFor(() => expect(api.guestStatus).toHaveBeenCalledWith(CODE, "g1", "k".repeat(32)));
    expect(JSON.parse(sessionStorage.getItem("xenaxio-meet-guest")!)).toMatchObject({ code: CODE, guestId: "g1" });

    api.guestStatus.mockResolvedValue({ state: "admitted", token: "tok-guest", signalPath: "/api/meet/rtc", identity: "g:g1", title: "Kickoff Müller" });
    expect(await screen.findByTestId("room", {}, { timeout: 4000 })).toHaveTextContent("tok-guest guest");

    // Removed: the visit is over.
    fireEvent.click(screen.getByRole("button", { name: "kick" }));
    expect(await screen.findByText("Sie wurden aus der Besprechung entfernt.")).toBeInTheDocument();
    expect(sessionStorage.getItem("xenaxio-meet-guest")).toBeNull();
  });

  it("step 79: a webinar guest gives a name and watches, without a lobby", async () => {
    api.info.mockResolvedValue({ ...info, title: "Town Hall", kind: "webinar" });
    api.knock.mockResolvedValue({ guestId: "g9", key: "k".repeat(32), state: "admitted" });
    api.guestStatus.mockResolvedValue({ state: "admitted", token: "tok-viewer", signalPath: "/api/meet/rtc", identity: "g:g9", title: "Town Hall", kind: "webinar", role: "viewer" });
    render(<MeetingPage />);
    // No camera check, only the name.
    const name = await screen.findByRole("textbox", { name: "Ihr Name" });
    expect(screen.queryByRole("button", { name: "Teilnahme anfragen" })).toBeNull();
    fireEvent.change(name, { target: { value: "Gerda Gast" } });
    fireEvent.click(screen.getByRole("button", { name: "Zuschauen" }));
    expect(await screen.findByTestId("role")).toHaveTextContent("webinar viewer g9");
    expect(api.knock).toHaveBeenCalledWith(CODE, "Gerda Gast");
    expect(screen.getByTestId("room")).toHaveTextContent("tok-viewer guest");
  });

  it("step 79: someone of the company joins a webinar with their role", async () => {
    api.info.mockResolvedValue({ ...info, member: true, kind: "webinar" });
    api.join.mockResolvedValue({ token: "tok-host", signalPath: "/api/meet/rtc", identity: "u:1", title: "Town Hall", kind: "webinar", role: "host" });
    render(<MeetingPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Beitreten" }));
    expect(await screen.findByTestId("role")).toHaveTextContent("webinar host -");
  });

  const REG = "11111111-2222-4333-8444-555555555555";
  const webinar = {
    ...info,
    title: "Produkt-Update Q4",
    kind: "webinar",
    webinar: { description: "Neuigkeiten aus dem Produkt.", startsAt: "2026-11-05T15:00:00Z", durationMinutes: 45, registration: true, hosts: ["Max Admin"], imprintUrl: null, privacyUrl: "https://acme.de/datenschutz" },
  };

  it("step 79, part B: a visitor registers for a webinar", async () => {
    api.info.mockResolvedValue(webinar);
    api.register.mockResolvedValue({ ok: true });
    render(<MeetingPage />);
    expect(await screen.findByText("Neuigkeiten aus dem Produkt.")).toBeInTheDocument();
    expect(screen.getByText("Mit Max Admin · Acme GmbH")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Ihr Name" }), { target: { value: "Erika Muster" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Ihre E-Mail-Adresse" }), { target: { value: "erika@example.org" } });
    // Without consent no registration.
    expect(screen.getByRole("button", { name: "Anmelden" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Datenschutzerklärung" })).toHaveAttribute("href", "https://acme.de/datenschutz");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));
    expect(await screen.findByText(/Wir haben Ihnen eine E-Mail an erika@example.org geschickt/)).toBeInTheDocument();
    expect(api.register).toHaveBeenCalledWith(CODE, { name: "Erika Muster", email: "erika@example.org", locale: "de" });
    expect(api.knock).not.toHaveBeenCalled();
  });

  it("step 79, part B: the personal link enters, or cancels", async () => {
    api.info.mockResolvedValue(webinar);
    api.registration.mockResolvedValue({ name: "Erika Muster", cancelled: false });
    api.joinRegistered.mockResolvedValue({ token: "tok-reg", signalPath: "/api/meet/rtc", identity: `r:${REG}`, title: "Produkt-Update Q4", kind: "webinar", role: "viewer" });
    window.history.replaceState(null, "", `/meet/${CODE}#r=${REG}.${"k".repeat(32)}`);
    const { unmount } = render(<MeetingPage />);
    expect(await screen.findByText("Angemeldet als Erika Muster")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anmelden" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Zum Webinar" }));
    expect(await screen.findByTestId("role")).toHaveTextContent(`webinar viewer ${REG}`);
    expect(api.joinRegistered).toHaveBeenCalledWith(CODE, REG, "k".repeat(32));
    unmount();

    api.cancelRegistration.mockResolvedValue({ ok: true });
    window.history.replaceState(null, "", `/meet/${CODE}#r=${REG}.${"k".repeat(32)}&cancel=1`);
    render(<MeetingPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Anmeldung stornieren" }));
    expect(await screen.findByText("Ihre Anmeldung ist storniert.")).toBeInTheDocument();
    expect(api.cancelRegistration).toHaveBeenCalledWith(CODE, REG, "k".repeat(32));
  });

  it("tells a declined guest", async () => {
    api.info.mockResolvedValue(info);
    sessionStorage.setItem("xenaxio-meet-guest", JSON.stringify({ code: CODE, guestId: "g2", key: "k".repeat(32), name: "Spam" }));
    api.guestStatus.mockResolvedValue({ state: "denied" });
    render(<MeetingPage />);
    expect(await screen.findByText("Ihre Anfrage wurde abgelehnt.")).toBeInTheDocument();
    expect(api.knock).not.toHaveBeenCalled();
  });

  it("explains closed meetings and errors", async () => {
    api.info.mockResolvedValue({ ...info, state: "ended" });
    const { unmount } = render(<MeetingPage />);
    expect(await screen.findByText("Diese Besprechung ist beendet.")).toBeInTheDocument();
    unmount();

    api.info.mockRejectedValue(new XenaxioApiError(404, "meeting_not_found"));
    const second = render(<MeetingPage />);
    expect(await screen.findByText("Diese Besprechung gibt es nicht. Prüfen Sie den Link.")).toBeInTheDocument();
    second.unmount();

    api.info.mockResolvedValue({ ...info, guests: false });
    render(<MeetingPage />);
    expect(await screen.findByText("Gäste ohne Konto sind bei diesen Besprechungen nicht zugelassen.")).toBeInTheDocument();
  });

  it("switches the language", async () => {
    api.info.mockResolvedValue({ ...info, state: "expired" });
    render(<MeetingPage />);
    expect(await screen.findByText("Dieser Link ist abgelaufen.")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "EN" })));
    expect(screen.getByText("This link has expired.")).toBeInTheDocument();
  });
});
