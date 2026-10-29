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
  MeetingRoom: ({ token, member, onLeave }: { token: string; member: boolean; onLeave: (r: string) => void }) => (
    <div>
      <p data-testid="room">
        {token} {member ? "member" : "guest"}
      </p>
      <button type="button" onClick={() => onLeave("removed")}>
        kick
      </button>
    </div>
  ),
}));
const api = vi.hoisted(() => ({ info: vi.fn(), join: vi.fn(), knock: vi.fn(), guestStatus: vi.fn() }));
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
