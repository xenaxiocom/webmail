import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Step 78, part D: calls in Rooms. The chat client and the media server are
// stand-ins; who starts, joins and rings is real.
vi.mock("next-intl", () => ({ useLocale: () => "de" }));
vi.mock("@/lib/xenaxio/meet-nav", () => ({ useMeetNavItem: () => ({ visible: true, label: "Meetings" }) }));
const api = vi.hoisted(() => ({ roomCall: vi.fn(), info: vi.fn(), join: vi.fn() }));
vi.mock("@/lib/xenaxio/meet", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/meet")>()), meet: api }));

import type { ChatClient, Message, Room } from "@/lib/xenaxio/chat/client";
import { callMessage, callOf, useCallStore } from "@/lib/xenaxio/meet-call";
import { CallButton, CallCard, IncomingCall } from "../meet/call";

const CODE = "abcdefghjk23";
const LINK = `https://acme.xenaxio.com/meet/${CODE}`;

function fakeClient(rooms: Room[] = []) {
  const listeners = new Set<() => void>();
  return {
    userId: "@anna:acme.de",
    rooms: new Map(rooms.map((r) => [r.id, r])),
    send: vi.fn(async () => {}),
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    notify: () => listeners.forEach((l) => l()),
  };
}

const room = (patch: Partial<Room>): Room => ({ id: "!dm:acme.de", name: null, kind: "dm", membership: "join", timeline: [], ...patch }) as unknown as Room;
const msg = (patch: Partial<Message>): Message => ({ id: "$1", roomId: "!dm:acme.de", sender: "@max:acme.de", ts: Date.now(), type: "m.room.message", content: callMessage(CODE, LINK, "Anruf gestartet"), edited: false, redacted: false, reactions: {}, ...patch });

afterEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  useCallStore.getState().close();
});

describe("step 78, part D: calls in Rooms", () => {
  it("reads only well-formed call cards", () => {
    expect(callOf(callMessage(CODE, LINK, "x"))).toEqual({ code: CODE, link: LINK });
    expect(callMessage(CODE, LINK, "Anruf gestartet").body).toBe(`📞 Anruf gestartet: ${LINK}`);
    expect(callOf({ body: "hi" })).toBeNull();
    expect(callOf({ "com.xenaxio.call": { code: "BAD", link: LINK } })).toBeNull();
  });

  it("starts the room's call, announces a new one and opens it", async () => {
    api.roomCall.mockResolvedValue({ code: CODE, title: "projekt", created: true });
    const client = fakeClient();
    render(<CallButton client={client as unknown as ChatClient} room={room({ id: "!proj:acme.de", kind: "channel", name: "projekt" })} />);
    fireEvent.click(screen.getByRole("button", { name: "Anruf starten" }));
    await waitFor(() => expect(useCallStore.getState().active).toEqual({ code: CODE, title: "projekt", roomId: "!proj:acme.de" }));
    expect(api.roomCall).toHaveBeenCalledWith("!proj:acme.de", "channel");
    expect(client.send).toHaveBeenCalledWith("!proj:acme.de", expect.objectContaining({ "com.xenaxio.call": { code: CODE, link: `${location.origin}/meet/${CODE}` } }));

    // Joining a running call announces nothing.
    useCallStore.getState().close();
    api.roomCall.mockResolvedValue({ code: CODE, title: "projekt", created: false });
    fireEvent.click(screen.getByRole("button", { name: "Anruf starten" }));
    await waitFor(() => expect(useCallStore.getState().active?.code).toBe(CODE));
    expect(client.send).toHaveBeenCalledTimes(1);
  });

  it("shows the call's state in the chat", async () => {
    api.info.mockResolvedValue({ title: "projekt", state: "open", running: true, participants: 3, startedAt: "2026-10-29T10:00:00Z", finishedAt: null });
    const { unmount } = render(<CallCard code={CODE} roomId="!proj:acme.de" title="" />);
    expect(await screen.findByText("Anruf läuft · 3 Personen")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Beitreten" }));
    expect(useCallStore.getState().active).toEqual({ code: CODE, title: "projekt", roomId: "!proj:acme.de" });
    unmount();

    api.info.mockResolvedValue({ title: "projekt", state: "open", running: false, participants: 0, startedAt: "2026-10-29T10:00:00Z", finishedAt: "2026-10-29T10:23:00Z" });
    render(<CallCard code={CODE} roomId="!proj:acme.de" title="" />);
    expect(await screen.findByText("Anruf beendet · 23 Min.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Beitreten" })).toBeNull();
  });

  it("marks a call nobody answered in a direct message", async () => {
    const ended = { title: "Anruf", state: "open", running: false, participants: 0, startedAt: "2026-10-29T10:00:00Z", finishedAt: "2026-10-29T10:01:00Z" };
    api.info.mockResolvedValue({ ...ended, peakParticipants: 1 });
    const { unmount } = render(<CallCard code={CODE} roomId="!dm:acme.de" title="" dm />);
    expect(await screen.findByText("Verpasster Anruf")).toBeInTheDocument();
    unmount();
    const caller = render(<CallCard code={CODE} roomId="!dm:acme.de" title="" dm mine />);
    expect(await screen.findByText("Nicht angenommen")).toBeInTheDocument();
    caller.unmount();
    // Answered: how long it took. In a channel nobody "misses" a call.
    api.info.mockResolvedValue({ ...ended, peakParticipants: 2 });
    const answered = render(<CallCard code={CODE} roomId="!dm:acme.de" title="" dm />);
    expect(await screen.findByText("Anruf beendet · 1 Min.")).toBeInTheDocument();
    answered.unmount();
    api.info.mockResolvedValue({ ...ended, peakParticipants: 1 });
    render(<CallCard code={CODE} roomId="!proj:acme.de" title="" />);
    expect(await screen.findByText("Anruf beendet · 1 Min.")).toBeInTheDocument();
  });

  it("rings for a fresh call from someone else in a direct message", async () => {
    const dm = room({ timeline: [msg({ id: "$old", ts: Date.now() - 120_000 }), msg({ id: "$mine", sender: "@anna:acme.de" })] });
    const client = fakeClient([dm, room({ id: "!proj:acme.de", kind: "channel", timeline: [msg({ id: "$chan", roomId: "!proj:acme.de" })] })]);
    render(<IncomingCall client={client as unknown as ChatClient} nameOf={(id) => (id === "@max:acme.de" ? "Max Muster" : id)} />);
    // Old calls, own calls and calls in channels do not ring.
    expect(screen.queryByRole("alertdialog")).toBeNull();

    dm.timeline.push(msg({ id: "$new" }));
    act(() => client.notify());
    expect(await screen.findByRole("alertdialog", { name: "Max Muster ruft an" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Annehmen" }));
    expect(useCallStore.getState().active).toEqual({ code: CODE, title: "Max Muster", roomId: "!dm:acme.de" });
    expect(screen.queryByRole("alertdialog")).toBeNull();

    // The same message rings only once.
    useCallStore.getState().close();
    act(() => client.notify());
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("stops ringing when the caller hangs up", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.info.mockResolvedValue({ title: "Anruf", state: "open", running: true, participants: 1, finishedAt: null });
      const dm = room({ timeline: [msg({ id: "$ring" })] });
      const client = fakeClient([dm]);
      render(<IncomingCall client={client as unknown as ChatClient} nameOf={() => "Max Muster"} />);
      expect(screen.getByRole("alertdialog", { name: "Max Muster ruft an" })).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
      api.info.mockResolvedValue({ title: "Anruf", state: "open", running: false, participants: 0, finishedAt: "2026-10-29T10:01:00Z" });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(screen.queryByRole("alertdialog")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
