import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/xenaxio/chat/api", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/chat/api")>()), mx: vi.fn(async () => ({ event_id: "$vote", chunk: [] })) }));

const { ChatClient } = await import("@/lib/xenaxio/chat/client");
const { POLL_END, POLL_RESPONSE, POLL_START, pollContent, pollOf, responseAnswers, tally } = await import("@/lib/xenaxio/chat/poll");
const { plainPreview } = await import("@/lib/xenaxio/chat/format");
const { PollCard } = await import("../chat/poll");

const ROOM = "!r:acme.de";
const vote = (id: string, sender: string, ts: number, answers: string[]) => ({ event_id: id, type: POLL_RESPONSE, sender, origin_server_ts: ts, content: { "m.relates_to": { rel_type: "m.reference", event_id: "$poll" }, [POLL_RESPONSE]: { answers } } });

describe("polls in Rooms (step 99, part E2b)", () => {
  it("writes and reads a Matrix poll as Element does", () => {
    const content = pollContent({ question: " Pizza? ", answers: ["Ja", " ", "Nein"], multiple: false, hidden: true });
    expect(pollOf(content)).toEqual({ question: "Pizza?", answers: [{ id: "a1", text: "Ja" }, { id: "a2", text: "Nein" }], maxSelections: 1, hidden: true });
    expect(content["org.matrix.msc1767.text"]).toBe("Pizza?\n1. Ja\n2. Nein");
    expect(plainPreview(content)).toBe("📊 Pizza?");
    expect(pollOf({ [POLL_START]: { question: { "org.matrix.msc1767.text": "x" }, answers: [{ id: "a1", "org.matrix.msc1767.text": "nur eine" }] } })).toBeNull();
    const poll = pollOf(content)!;
    expect(responseAnswers({ [POLL_RESPONSE]: { answers: ["a2", "a1", "zz"] } }, poll)).toEqual(["a2"]);
  });

  it("counts each person's latest vote; votes after the end and others' end do not count", () => {
    const c = new ChatClient();
    c.userId = "@max:acme.de";
    const start = { event_id: "$poll", type: POLL_START, sender: "@anna:acme.de", origin_server_ts: 1, content: pollContent({ question: "Pizza?", answers: ["Ja", "Nein"], multiple: false, hidden: false }) };
    const end = (sender: string, ts: number) => ({ event_id: `$end${ts}`, type: POLL_END, sender, origin_server_ts: ts, content: { "m.relates_to": { rel_type: "m.reference", event_id: "$poll" }, [POLL_END]: {} } });
    c.processSync(
      {
        next_batch: "s",
        rooms: { join: { [ROOM]: { timeline: { events: [vote("$v0", "@eve:acme.de", 0, ["a1"]), start, vote("$v1", "@max:acme.de", 2, ["a1"]), vote("$v2", "@max:acme.de", 3, ["a2"]), vote("$v3", "@ben:acme.de", 4, ["a2"]), end("@ben:acme.de", 5), end("@anna:acme.de", 6), vote("$v4", "@tom:acme.de", 7, ["a1"])] } } } },
      } as never,
      true,
    );
    const m = c.rooms.get(ROOM)!.byId.get("$poll")!;
    expect(c.rooms.get(ROOM)!.timeline.map((x) => x.id)).toEqual(["$poll"]);
    expect(m.pollState?.endedTs).toBe(6);
    const { counts, voters } = tally(pollOf(m.content)!, m.pollState);
    // Eve's vote came before the poll (queued, then counted); Max changed his mind; Tom was too late.
    expect([...counts]).toEqual([["a1", 1], ["a2", 2]]);
    expect(voters).toBe(3);
  });

  it("votes with one click; results show after one's own vote; the author ends it", async () => {
    const c = new ChatClient();
    c.userId = "@anna:acme.de";
    c.processSync({ next_batch: "s", rooms: { join: { [ROOM]: { timeline: { events: [{ event_id: "$poll", type: POLL_START, sender: "@anna:acme.de", origin_server_ts: 1, content: pollContent({ question: "Pizza?", answers: ["Ja", "Nein"], multiple: false, hidden: false }) }] } } } } } as never, true);
    const send = vi.spyOn(c, "sendEvent");
    const message = c.rooms.get(ROOM)!.byId.get("$poll")!;
    const ui = render(<PollCard client={c} message={message} />);
    expect(screen.queryByText("0 votes")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "Ja" }));
    });
    expect(send).toHaveBeenCalledWith(ROOM, POLL_RESPONSE, { "m.relates_to": { rel_type: "m.reference", event_id: "$poll" }, [POLL_RESPONSE]: { answers: ["a1"] } });
    ui.rerender(<PollCard client={c} message={message} />);
    expect(screen.getByText("1 votes")).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Ja/ }).getAttribute("aria-checked")).toBe("true");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "End poll" }));
    });
    expect(send).toHaveBeenLastCalledWith(ROOM, POLL_END, expect.objectContaining({ "m.relates_to": { rel_type: "m.reference", event_id: "$poll" } }));
  });
});
