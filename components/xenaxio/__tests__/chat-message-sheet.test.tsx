import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatClient, Message, Room } from "@/lib/xenaxio/chat/client";
import { useChatStore } from "@/lib/xenaxio/chat/store";
import { ChatDialogsProvider } from "../chat/dialogs";
import { ChatMessage } from "../chat/message";

const ME = "@anna:firma.de";

function message(sender = ME): Message {
  return { id: "$1", roomId: "!r:firma.de", sender, ts: Date.now(), type: "m.room.message", content: { msgtype: "m.text", body: "Hallo" }, edited: false, redacted: false, reactions: {} };
}

/** The parts of the chat client and the room one message uses. */
function setup(sender = ME) {
  const client = {
    userId: ME,
    saved: [],
    can: () => false,
    isExternalUser: () => false,
    toggleReaction: vi.fn(async () => undefined),
    setSaved: vi.fn(async () => undefined),
  } as unknown as ChatClient & { toggleReaction: ReturnType<typeof vi.fn> };
  const room = { id: "!r:firma.de", pinned: [] } as unknown as Room;
  const msg = message(sender);
  render(
    <ChatDialogsProvider>
      <ChatMessage message={msg} room={room} client={client} continued={false} />
    </ChatDialogsProvider>,
  );
  return { client, row: document.getElementById("msg-$1") as HTMLElement };
}

const press = (row: HTMLElement, pointerType = "touch") => {
  fireEvent.pointerDown(row, { pointerType, clientX: 10, clientY: 10 });
  act(() => {
    vi.advanceTimersByTime(500);
  });
};

describe("message actions on a phone (long press)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useChatStore.setState({ editing: null });
  });
  afterEach(() => vi.useRealTimers());

  it("a long press with a finger opens the sheet; editing one's own message works from it", () => {
    const { row } = setup();
    press(row);
    expect(screen.getByRole("dialog", { name: "Message actions" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(useChatStore.getState().editing).toBe("$1");
    expect(screen.queryByRole("dialog", { name: "Message actions" })).toBeNull();
  });

  it("a reaction is sent from the sheet", () => {
    const { row, client } = setup();
    press(row);
    fireEvent.click(within(screen.getByRole("dialog", { name: "Message actions" })).getByRole("button", { name: "👍" }));
    expect(client.toggleReaction).toHaveBeenCalledWith("!r:firma.de", "$1", "👍");
  });

  it("no sheet for a mouse, a short tap or a finger that scrolls", () => {
    const { row } = setup();
    press(row, "mouse");
    fireEvent.pointerDown(row, { pointerType: "touch", clientX: 10, clientY: 10 });
    fireEvent.pointerUp(row, { pointerType: "touch" });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.pointerDown(row, { pointerType: "touch", clientX: 10, clientY: 10 });
    fireEvent.pointerMove(row, { pointerType: "touch", clientX: 10, clientY: 60 });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByRole("dialog", { name: "Message actions" })).toBeNull();
  });

  it("someone else's message cannot be edited from the sheet", () => {
    const { row } = setup("@ben:firma.de");
    press(row);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.getByRole("button", { name: "Report" })).toBeTruthy();
  });
});
