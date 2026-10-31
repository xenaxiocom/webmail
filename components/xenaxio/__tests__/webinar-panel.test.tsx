import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Step 79, part C: the webinar's questions, polls and chat. The room is a
// stand-in: its messages are fed to the panel by hand.
const room = vi.hoisted(() => ({ handler: null as null | ((msg: { payload: Uint8Array }) => void) }));
vi.mock("@livekit/components-react", () => ({
  useDataChannel: (_topic: string, onMessage: (msg: { payload: Uint8Array }) => void) => {
    room.handler = onMessage;
    return { send: vi.fn() };
  },
}));
const api = vi.hoisted(() => ({ webinarState: vi.fn(), ask: vi.fn(), voteQuestion: vi.fn(), votePoll: vi.fn(), sendChat: vi.fn(), moderateQuestion: vi.fn(), liveSettings: vi.fn() }));
vi.mock("@/lib/xenaxio/meet", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/meet")>()), meet: api }));

import { MeetLangProvider } from "../meet/lang";
import { useWebinarLive, WebinarPanel } from "../meet/webinar-panel";

// jsdom has no layout: the chat scrolls to the newest message.
Element.prototype.scrollIntoView = vi.fn();

const CODE = "abcdefghjk23";
const GUEST = { guestId: "g1", key: "k".repeat(32) };
const base = { chatMode: "all", anonymousQuestions: false, host: false, questions: [], polls: [], chat: [], myVotes: { questions: [], polls: {} } };

function Panel() {
  const live = useWebinarLive(CODE, GUEST, true);
  return <WebinarPanel code={CODE} guest={GUEST} live={live} me="g:g1" />;
}
const send = (event: object) => act(() => room.handler?.({ payload: new TextEncoder().encode(JSON.stringify(event)) }));

afterEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  localStorage.clear();
});

describe("step 79, part C: questions, polls and chat", () => {
  it("asks, follows the room and votes; viewers do not moderate", async () => {
    localStorage.setItem("locale-storage", JSON.stringify({ state: { locale: "de" } }));
    api.webinarState.mockResolvedValue(base);
    api.ask.mockResolvedValue({});
    api.voteQuestion.mockResolvedValue({ ok: true });
    render(
      <MeetLangProvider>
        <Panel />
      </MeetLangProvider>,
    );
    expect(await screen.findByText("Noch keine Fragen.")).toBeInTheDocument();
    expect(api.webinarState).toHaveBeenCalledWith(CODE, GUEST);
    // No anonymous option while the host has not allowed it.
    expect(screen.queryByLabelText("anonym fragen")).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Ihre Frage an die Hosts" }), { target: { value: "Wann kommt die App?" } });
    fireEvent.click(screen.getByRole("button", { name: "Fragen" }));
    await waitFor(() => expect(api.ask).toHaveBeenCalledWith(CODE, "Wann kommt die App?", false, GUEST));

    // The platform tells the room; most votes first, answered ones below.
    send({ type: "question", question: { id: "q1", name: "Gerda", text: "Wann kommt die App?", votes: 0, answered: false, hidden: false, createdAt: "2026-10-29T13:00:00Z" } });
    send({ type: "question", question: { id: "q2", name: null, text: "Was kostet es?", votes: 3, answered: false, hidden: false, createdAt: "2026-10-29T13:01:00Z" } });
    const items = () => screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items()[0]).toContain("Was kostet es?");
    expect(items()[0]).toContain("Anonym");
    send({ type: "question", question: { id: "q2", name: null, text: "Was kostet es?", votes: 3, answered: true, hidden: false, createdAt: "2026-10-29T13:01:00Z" } });
    expect(items()[0]).toContain("Wann kommt die App?");
    expect(screen.queryByRole("button", { name: "Beantwortet" })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Frage unterstützen" })[0]!);
    await waitFor(() => expect(api.voteQuestion).toHaveBeenCalledWith(CODE, "q1", true, GUEST));
    // Hidden by a host: it disappears for viewers.
    send({ type: "question", question: { id: "q1", name: "Gerda", text: "Wann kommt die App?", votes: 1, answered: false, hidden: true, createdAt: "2026-10-29T13:00:00Z" } });
    expect(screen.queryByText("Wann kommt die App?")).toBeNull();
  });

  it("votes in a poll; the chat to the hosts only says so", async () => {
    localStorage.setItem("locale-storage", JSON.stringify({ state: { locale: "de" } }));
    api.webinarState.mockResolvedValue({ ...base, chatMode: "hosts" });
    api.votePoll.mockResolvedValue({ ok: true });
    api.sendChat.mockResolvedValue({});
    render(
      <MeetLangProvider>
        <Panel />
      </MeetLangProvider>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Umfragen" }));
    send({ type: "poll", poll: { id: "p1", question: "Hilft das Update?", options: ["Ja", "Nein"], results: "hosts", closed: false } });
    fireEvent.click(screen.getByRole("button", { name: "Ja" }));
    await waitFor(() => expect(api.votePoll).toHaveBeenCalledWith(CODE, "p1", 0, GUEST));
    // Results for the hosts only: the viewer sees a thank-you, no numbers.
    expect(await screen.findByText("Danke, Ihre Stimme ist gezählt.")).toBeInTheDocument();
    expect(screen.queryByText("100 %")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Chat" }));
    expect(screen.getByText("Ihre Nachrichten sehen nur die Hosts.")).toBeInTheDocument();
    send({ type: "chat", message: { id: "1", identity: "g:g1", name: "Gerda Gast", text: "Hallo", toHosts: true, at: "2026-10-29T13:02:00Z" } });
    expect(screen.getByText("Hallo")).toBeInTheDocument();
    expect(screen.getByText(/an Hosts/)).toBeInTheDocument();
    // Off: no tab for viewers.
    send({ type: "settings", chatMode: "off", anonymousQuestions: true });
    expect(screen.queryByRole("tab", { name: "Chat" })).toBeNull();
  });
});
