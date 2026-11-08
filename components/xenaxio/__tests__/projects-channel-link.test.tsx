import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatClient, Room } from "@/lib/xenaxio/chat/client";
import { useChatStore } from "@/lib/xenaxio/chat/store";
import { ChannelPickDialog } from "../projects/project-view";

vi.mock("next-intl", async (orig) => ({ ...(await orig<typeof import("next-intl")>()), useLocale: () => "en" }));

const room = (id: string, name: string, extra: Partial<Room> = {}) => ({ id, name, kind: "channel", membership: "join", archived: false, joinRule: "invite", lastTs: 1, ...extra }) as Room;

function fakeClient(rooms: Room[]): ChatClient {
  return { ready: true, rooms: new Map(rooms.map((r) => [r.id, r])), roomName: (r: Room) => r.name ?? r.id } as unknown as ChatClient;
}

// Projects, "Linked": a channel of Rooms the person is already in, instead of a new one.
describe("link an existing channel to a project", () => {
  afterEach(() => useChatStore.setState({ client: null, status: null, statusError: false }));

  it("lists only the person's own channels that are not linked yet, filters by name and links the chosen one", async () => {
    useChatStore.setState({
      client: fakeClient([
        room("!a", "vertrieb", { lastTs: 3 }),
        room("!b", "messe-2026", { lastTs: 5 }),
        room("!c", "linked-already"),
        room("!d", "Anna", { kind: "dm" }),
        room("!e", "old", { archived: true }),
        room("!f", "invited", { membership: "invite" }),
      ]),
    });
    const onPick = vi.fn(async () => undefined);
    render(<ChannelPickDialog open linked={new Set(["!c"])} onClose={() => undefined} onPick={onPick} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent).filter((x) => x && !/close/i.test(x))).toEqual(["messe-2026", "vertrieb"]);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "#vert" } });
    expect(screen.queryByText("messe-2026")).toBeNull();
    fireEvent.click(screen.getByText("vertrieb"));
    await waitFor(() => expect(onPick).toHaveBeenCalledWith("!a", "vertrieb"));
  });

  it("says so when Rooms is not available", () => {
    useChatStore.setState({ client: null, status: { enabled: false, state: "off", address: null, homeserverUrl: "" } });
    render(<ChannelPickDialog open linked={new Set()} onClose={() => undefined} onPick={async () => undefined} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("dialog").textContent).not.toMatch(/Loading channels/);
  });
});
