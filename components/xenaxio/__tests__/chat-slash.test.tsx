import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ChatClient, Room } from "@/lib/xenaxio/chat/client";
import { dndUntil, parseSlash, personArg, slashSuggestions } from "@/lib/xenaxio/chat/slash";
import { useChatStore } from "@/lib/xenaxio/chat/store";
import { Composer } from "../chat/composer";
import { ChatDialogsProvider } from "../chat/dialogs";

describe("slash commands (step 99, part F)", () => {
  it("parses commands and leaves other text alone", () => {
    expect(parseSlash("/topic  Neues Thema ")).toEqual({ command: "topic", arg: "Neues Thema" });
    expect(parseSlash("/LEAVE")).toEqual({ command: "leave", arg: "" });
    expect(parseSlash("/foo bar")).toEqual({ unknown: "foo" });
    expect(parseSlash("/ etc/hosts")).toBeNull();
    expect(parseSlash("siehe /etc")).toBeNull();
    expect(slashSuggestions("/re")).toEqual(["rename", "remind"]);
    expect(slashSuggestions("/rename x")).toEqual([]);
    const now = new Date(2026, 9, 31, 10, 0);
    expect(dndUntil("30m", now)).toEqual(new Date(2026, 9, 31, 10, 30));
    expect(dndUntil("2h", now)).toEqual(new Date(2026, 9, 31, 12, 0));
    expect(dndUntil("morgen", now)).toEqual(new Date(2026, 10, 1, 8, 0));
    expect(dndUntil("aus", now)).toBeNull();
    expect(dndUntil("bald", now)).toBeUndefined();
    const people = [{ userId: "@a", displayName: "Anna" }, { userId: "@as", displayName: "Anna Schmidt" }];
    expect(personArg("@Anna Schmidt hallo du", people)).toEqual({ person: people[1], rest: "hallo du" });
    expect(personArg("@Annabelle", people)).toBeNull();
  });

  it("the box suggests commands, runs them and keeps an unknown one", async () => {
    const setTopic = vi.fn(async () => undefined);
    const openDirect = vi.fn(async () => "!dm:x");
    const send = vi.fn(async () => undefined);
    const client = {
      userId: "@max:x",
      rooms: new Map(),
      can: () => true,
      roomName: () => "dev",
      setTyping: vi.fn(async () => undefined),
      drafts: {},
      setDraft: vi.fn(),
      channelRefs: () => [],
      loadChannelDirectory: async () => undefined,
      send,
      setTopic,
      openDirect,
    } as unknown as ChatClient;
    const anna = { address: "@anna:x", displayName: "Anna Schmidt", email: "anna@x" };
    useChatStore.setState({ colleagues: new Map([["@anna:x", anna]]) as never, view: { kind: "home" } });
    render(
      <ChatDialogsProvider>
        <Composer room={{ id: "!dev:x", kind: "channel", members: new Map(), timeline: [], archived: false } as unknown as Room} client={client} placeholder="Nachricht" locale="en" />
      </ChatDialogsProvider>,
    );
    const box = screen.getByLabelText("Nachricht") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "/to" } });
    expect(screen.getByRole("option", { name: /\/topic/ })).toBeTruthy();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(box.value).toBe("/topic ");
    fireEvent.change(box, { target: { value: "/topic Q4-Planung" } });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    expect(setTopic).toHaveBeenCalledWith("!dev:x", "Q4-Planung");
    expect(box.value).toBe("");
    fireEvent.change(box, { target: { value: "/msg @Anna Schmidt Kurze Frage" } });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    expect(openDirect).toHaveBeenCalledWith(["@anna:x"]);
    expect(send).toHaveBeenCalledWith("!dm:x", expect.objectContaining({ body: "Kurze Frage" }));
    expect(useChatStore.getState().view).toEqual({ kind: "room", roomId: "!dm:x" });
    fireEvent.change(box, { target: { value: "/gibtsnicht" } });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    expect(box.value).toBe("/gibtsnicht");
    expect(send).toHaveBeenCalledTimes(1);
  });
});
