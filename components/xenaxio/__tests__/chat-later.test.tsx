import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ChatClient, Room } from "@/lib/xenaxio/chat/client";
import { isDue, laterTime, useChatLater } from "@/lib/xenaxio/chat/later";
import { useChatStore } from "@/lib/xenaxio/chat/store";
import { Composer } from "../chat/composer";
import { ChatDialogsProvider } from "../chat/dialogs";
import { LaterView } from "../chat/later";

describe("Later in Rooms (step 99, part E2)", () => {
  it("Slack's quick times", () => {
    const wed = new Date(2026, 9, 28, 15, 30); // a Wednesday
    expect(laterTime("20m", wed)).toEqual(new Date(2026, 9, 28, 15, 50));
    expect(laterTime("tomorrow", wed)).toEqual(new Date(2026, 9, 29, 9, 0));
    expect(laterTime("monday", wed)).toEqual(new Date(2026, 10, 2, 9, 0));
    expect(laterTime("monday", new Date(2026, 10, 2, 8, 0))).toEqual(new Date(2026, 10, 9, 9, 0));
    expect(isDue({ remindAt: "2026-10-01T00:00:00Z", doneAt: null } as never, Date.parse("2026-10-02T00:00:00Z"))).toBe(true);
  });

  it("the view: due first, then coming up and scheduled; done and send now", async () => {
    const changeReminder = vi.fn(async () => undefined);
    const changeScheduled = vi.fn(async () => undefined);
    useChatLater.setState({
      loaded: true,
      reminders: [
        { id: "r1", roomId: "!v:x", eventId: "$1", roomName: "vertrieb", preview: "Angebot prüfen", remindAt: "2026-01-01T09:00:00Z", notifiedAt: "2026-01-01T09:00:00Z", doneAt: null },
        { id: "r2", roomId: "!v:x", eventId: "$2", roomName: "vertrieb", preview: "Später", remindAt: "2099-01-01T09:00:00Z", notifiedAt: null, doneAt: null },
      ],
      scheduled: [{ id: "s1", roomId: "!v:x", roomName: "vertrieb", threadRoot: null, preview: "Guten Morgen", sendAt: "2099-01-01T08:00:00Z", sentAt: null, eventId: null, error: "not_in_room" }],
      changeReminder,
      changeScheduled,
    });
    render(<LaterView client={{ rooms: new Map() } as unknown as ChatClient} />);
    const sections = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(sections).toEqual(["Due", "Coming up", "Scheduled messages"]);
    expect(screen.getByText("Not sent: you are no longer in the channel.")).toBeTruthy();
    const due = screen.getByText("Angebot prüfen").closest("li") as HTMLElement;
    await act(async () => {
      fireEvent.click(within(due).getByRole("button", { name: "Done" }));
    });
    expect(changeReminder).toHaveBeenCalledWith("r1", { done: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send now" }));
    });
    expect(changeScheduled).toHaveBeenCalledWith("s1", { sendAt: expect.any(String) });
  });

  it("the composer schedules the text for later and empties the box", async () => {
    const schedule = vi.fn(async () => undefined);
    useChatLater.setState({ schedule });
    const client = { userId: "@a:x", rooms: new Map(), can: () => true, roomName: () => "dev", setTyping: vi.fn(async () => undefined), drafts: {}, setDraft: vi.fn(), send: vi.fn() } as unknown as ChatClient;
    useChatStore.setState({ colleagues: new Map() });
    render(
      <ChatDialogsProvider>
        <Composer room={{ id: "!dev:x", kind: "channel", members: new Map(), archived: false } as unknown as Room} client={client} placeholder="Nachricht" locale="en" />
      </ChatDialogsProvider>,
    );
    const box = screen.getByLabelText("Nachricht") as HTMLTextAreaElement;
    expect((screen.getByRole("button", { name: "Send later" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(box, { target: { value: "Guten **Morgen**" } });
    fireEvent.click(screen.getByRole("button", { name: "Send later" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Tomorrow at 9:00/ }));
    });
    expect(schedule).toHaveBeenCalledWith(expect.objectContaining({ roomId: "!dev:x", roomName: "dev", threadRoot: null, content: expect.objectContaining({ body: "Guten **Morgen**", formatted_body: "Guten <strong>Morgen</strong>" }), sendAt: laterTime("tomorrow").toISOString() }));
    expect(box.value).toBe("");
  });
});
