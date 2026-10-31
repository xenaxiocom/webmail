import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ChatClient, Room } from "@/lib/xenaxio/chat/client";
import { Composer } from "../chat/composer";
import { ChatDialogsProvider } from "../chat/dialogs";

function setup() {
  const send = vi.fn(async () => undefined);
  const client = {
    userId: "@anna:firma.de",
    rooms: new Map(),
    can: () => true,
    roomName: () => "dev",
    setTyping: vi.fn(async () => undefined),
    // Step 99, part E: drafts are kept by the client.
    drafts: {},
    setDraft: vi.fn(),
    send,
    // Step 99: "#name" links.
    loadChannelDirectory: async () => undefined,
    channelRefs: () => [],
  } as unknown as ChatClient;
  const room = { id: "!dev:firma.de", members: new Map(), archived: false } as unknown as Room;
  render(
    <ChatDialogsProvider>
      <Composer room={room} client={client} placeholder="Nachricht an #dev" locale="en" />
    </ChatDialogsProvider>,
  );
  return { send, box: screen.getByLabelText("Nachricht an #dev") as HTMLTextAreaElement };
}

describe("snippets from the composer (step 99)", () => {
  it("a long paste offers a snippet; it takes the text out of the box and sends it as a snippet", async () => {
    const { send, box } = setup();
    const code = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");
    fireEvent.change(box, { target: { value: `see:\n${code}` } });
    fireEvent.paste(box, { clipboardData: { files: [], types: ["text/plain"], getData: () => code } });
    fireEvent.click(screen.getByRole("button", { name: "As snippet" }));
    expect(box.value).toBe("see:\n");
    expect((screen.getByLabelText("Content") as HTMLTextAreaElement).value).toBe(code);
    fireEvent.change(screen.getByLabelText("Title (optional)"), { target: { value: "log" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send snippet" }));
    });
    await waitFor(() => expect(send).toHaveBeenCalled());
    const [roomId, content] = send.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(roomId).toBe("!dev:firma.de");
    expect(content["com.xenaxio.snippet"]).toEqual({ title: "log", language: "plaintext", lines: 40 });
    expect(screen.queryByRole("dialog", { name: "Create a code snippet" })).toBeNull();
  });

  it("a short paste offers nothing; the code block button wraps the selection", () => {
    const { box } = setup();
    fireEvent.paste(box, { clipboardData: { files: [], types: ["text/plain"], getData: () => "kurz" } });
    expect(screen.queryByRole("button", { name: "As snippet" })).toBeNull();
    fireEvent.change(box, { target: { value: "a = 1" } });
    box.setSelectionRange(0, 5);
    fireEvent.click(screen.getByRole("button", { name: "Code block" }));
    expect(box.value).toBe("```\na = 1\n```");
  });

  it("step 99, part E: each channel keeps its own draft; switching does not carry the text over", () => {
    const setDraft = vi.fn();
    const client = { userId: "@anna:firma.de", rooms: new Map(), can: () => true, roomName: () => "x", setTyping: vi.fn(async () => undefined), drafts: { "!b:firma.de|": { text: "Entwurf B", ts: 1 } }, setDraft, send: vi.fn(), loadChannelDirectory: async () => undefined, channelRefs: () => [] } as unknown as ChatClient;
    const roomA = { id: "!a:firma.de", members: new Map(), archived: false } as unknown as Room;
    const roomB = { id: "!b:firma.de", members: new Map(), archived: false } as unknown as Room;
    const ui = render(
      <ChatDialogsProvider>
        <Composer room={roomA} client={client} placeholder="Nachricht" locale="en" />
      </ChatDialogsProvider>,
    );
    fireEvent.change(screen.getByLabelText("Nachricht"), { target: { value: "Text A" } });
    ui.rerender(
      <ChatDialogsProvider>
        <Composer room={roomB} client={client} placeholder="Nachricht" locale="en" />
      </ChatDialogsProvider>,
    );
    expect((screen.getByLabelText("Nachricht") as HTMLTextAreaElement).value).toBe("Entwurf B");
    expect(setDraft.mock.calls).toEqual([["!a:firma.de|", "Text A"]]);
  });
});
