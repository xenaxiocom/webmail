import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatClient, Message, Room } from "@/lib/xenaxio/chat/client";
import { useChatStore } from "@/lib/xenaxio/chat/store";
import { ChatDialogsProvider } from "../chat/dialogs";
import { ChatMessage } from "../chat/message";

const ME = "@anna:firma.de";

function setup(body: string, rooms: [string, Room["membership"]][], openChannel = vi.fn(async (id: string): Promise<string | null> => id)) {
  const client = {
    userId: ME,
    saved: [],
    can: () => false,
    isExternalUser: () => false,
    displayName: () => "Ben",
    people: new Map(),
    rooms: new Map(rooms.map(([id, membership]) => [id, { id, membership, kind: "channel" }])),
    channelRefs: () => [
      { roomId: "!gen:firma.de", name: "general" },
      { roomId: "!open:firma.de", name: "offen" },
    ],
    openChannel,
  } as unknown as ChatClient;
  useChatStore.setState({ client, view: { kind: "home" }, panel: null });
  const msg: Message = { id: "$1", roomId: "!r:firma.de", sender: "@ben:firma.de", ts: Date.now(), type: "m.room.message", content: { msgtype: "m.text", body }, edited: false, redacted: false, reactions: {} };
  render(
    <ChatDialogsProvider>
      <ChatMessage message={msg} room={{ id: "!r:firma.de", pinned: [] } as unknown as Room} client={client} continued={false} />
    </ChatDialogsProvider>,
  );
  return { openChannel };
}

describe("#channel links in messages (step 99)", () => {
  afterEach(() => useChatStore.setState({ client: null, view: { kind: "home" } }));

  it("a click on #name opens the channel I am in", () => {
    const { openChannel } = setup("schau in #general", [["!gen:firma.de", "join"]]);
    fireEvent.click(screen.getByText("#general"));
    expect(useChatStore.getState().view).toEqual({ kind: "room", roomId: "!gen:firma.de" });
    expect(openChannel).not.toHaveBeenCalled();
  });

  it("an open channel I am not in is joined, then opened", async () => {
    const { openChannel } = setup("neu: #offen", []);
    fireEvent.click(screen.getByText("#offen"));
    await waitFor(() => expect(useChatStore.getState().view).toEqual({ kind: "room", roomId: "!open:firma.de" }));
    expect(openChannel).toHaveBeenCalledWith("!open:firma.de");
  });

  it("a closed channel stays where I am", async () => {
    const { openChannel } = setup("#offen", [], vi.fn(async (): Promise<string | null> => null));
    fireEvent.click(screen.getByText("#offen"));
    await waitFor(() => expect(openChannel).toHaveBeenCalled());
    expect(useChatStore.getState().view).toEqual({ kind: "home" });
  });

  it("a copied link to a channel of this chat opens here, not in a new tab", () => {
    setup(`${window.location.origin}/de/chat/?room=%21gen%3Afirma.de&event=%24e1`, [["!gen:firma.de", "join"]]);
    const link = screen.getByRole("link");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(useChatStore.getState().view).toEqual({ kind: "room", roomId: "!gen:firma.de" });
    expect(useChatStore.getState().focus).toEqual({ roomId: "!gen:firma.de", eventId: "$e1" });
  });
});
