import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/xenaxio/chat/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/xenaxio/chat/api")>()),
  linkPreview: vi.fn(async (url: string) => (url.includes("news") ? { url, title: "Neue Preise", description: "Ab heute", siteName: "News", image: "https://news.de/a.png" } : null)),
}));

const { ChatClient } = await import("@/lib/xenaxio/chat/client");
const { useChatStore } = await import("@/lib/xenaxio/chat/store");
const { ChatDialogsProvider } = await import("../chat/dialogs");
const { ForwardDialog } = await import("../chat/forward");
const { LinkPreviewCard } = await import("../chat/link-preview");

describe("forward and link previews (step 99, part E)", () => {
  it("forwards a message with a note to the chosen channel", async () => {
    const client = new ChatClient();
    client.userId = "@max:acme.de";
    client.processSync(
      {
        next_batch: "s",
        rooms: {
          join: {
            "!v:acme.de": { state: { events: [{ type: "m.room.name", state_key: "", sender: "@a:acme.de", content: { name: "vertrieb" } }] }, timeline: { events: [{ event_id: "$1", type: "m.room.message", sender: "@anna:acme.de", origin_server_ts: 1, content: { msgtype: "m.text", body: "Angebot steht" } }] } },
            "!m:acme.de": { state: { events: [{ type: "m.room.name", state_key: "", sender: "@a:acme.de", content: { name: "marketing" } }] } },
          },
        },
      } as never,
      true,
    );
    const send = vi.spyOn(client, "send").mockResolvedValue();
    useChatStore.setState({ client, colleagues: new Map() });
    const room = client.rooms.get("!v:acme.de")!;
    render(
      <ChatDialogsProvider>
        <ForwardDialog client={client} room={room} message={room.timeline[0]!} onClose={vi.fn()} />
      </ChatDialogsProvider>,
    );
    fireEvent.change(screen.getByLabelText("Search a channel or person"), { target: { value: "mark" } });
    expect(screen.queryByRole("option", { name: "vertrieb" })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "marketing" }));
    fireEvent.change(screen.getByLabelText("Add a message (optional)"), { target: { value: "FYI" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Forward" }));
    });
    expect(send).toHaveBeenCalledWith("!m:acme.de", expect.objectContaining({ "com.xenaxio.forward": expect.objectContaining({ eventId: "$1", roomName: "vertrieb" }), "com.xenaxio.forward_note": "FYI" }));
  });

  it("shows a preview with the picture through the platform; nothing for a page without one", async () => {
    const { container, rerender } = render(<LinkPreviewCard url="https://news.de/1" />);
    await waitFor(() => expect(screen.getByTestId("chat-link-preview").textContent).toContain("Neue Preise"));
    expect(container.querySelector("img")?.getAttribute("src")).toContain("/api/chat/preview/image?url=https%3A%2F%2Fnews.de%2Fa.png");
    rerender(<LinkPreviewCard url="https://empty.de/" />);
    await waitFor(() => expect(screen.queryByTestId("chat-link-preview")).toBeNull());
  });
});
