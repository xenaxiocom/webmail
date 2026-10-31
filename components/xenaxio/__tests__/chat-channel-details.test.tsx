import { act, cleanup as cleanupAll, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatClient, PowerLevels, Room } from "@/lib/xenaxio/chat/client";
import { ChatClient as RealClient } from "@/lib/xenaxio/chat/client";

const api = vi.hoisted(() => ({ changeChatChannel: vi.fn(async () => ({})), me: vi.fn() }));
vi.mock("@/lib/xenaxio/api", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/api")>()), xenaxio: api }));
// Step 109: an own picture is made smaller in the browser and goes up with the chat's files.
const media = vi.hoisted(() => ({ shrinkPicture: vi.fn(async () => new Blob(["small"], { type: "image/jpeg" })), uploadFile: vi.fn(async () => "mxc://acme.de/Pic1") }));
vi.mock("@/lib/xenaxio/meet-background", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/meet-background")>()), shrinkPicture: media.shrinkPicture }));
vi.mock("@/lib/xenaxio/chat/api", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/chat/api")>()), uploadFile: media.uploadFile }));

const { useXenaxioMeStore } = await import("@/lib/xenaxio/me-store");
const { ChatDialogsProvider } = await import("../chat/dialogs");
const { ChannelDetails } = await import("../chat/channel-details");
const { RoomBackgroundDialog } = await import("../chat/room-background-settings");
const { useChatStore } = await import("@/lib/xenaxio/chat/store");

const ANNA = "@anna:acme.de";
const BEN = "@ben:acme.de";

function power(users: Record<string, number>): PowerLevels {
  return { users, users_default: 0, events: {}, events_default: 0, state_default: 50, redact: 50, invite: 0, kick: 50 };
}

/** A real client's rules (levels, managers) with its network calls replaced. */
function setup(opts: { me: string; levels: Record<string, number>; role?: "admin" | "user"; background?: string | null; dm?: boolean }) {
  const client = new RealClient() as ChatClient;
  client.userId = opts.me;
  const room = {
    id: "!proj:acme.de",
    name: "projekt",
    topic: "Kickoff",
    description: null,
    kind: opts.dm ? "dm" : "channel",
    joinRule: "invite",
    membership: "join",
    members: new Map([
      [ANNA, { userId: ANNA, displayName: "Anna", membership: "join" }],
      [BEN, { userId: BEN, displayName: "Ben", membership: "join" }],
    ]),
    pinned: [],
    byId: new Map(),
    powerLevels: power(opts.levels),
    creator: ANNA,
    createdTs: Date.UTC(2026, 9, 1),
    tags: {},
    archived: false,
    external: false,
    background: opts.background ?? null,
    backgroundImage: null,
  } as unknown as Room;
  client.rooms.set(room.id, room);
  client.people.set(ANNA, { userId: ANNA, displayName: "Anna" });
  client.people.set(BEN, { userId: BEN, displayName: "Ben" });
  useChatStore.setState({ client, colleagues: new Map() });
  const calls = {
    setDescription: vi.spyOn(client, "setDescription").mockResolvedValue(),
    setRoomRules: vi.spyOn(client, "setRoomRules").mockResolvedValue(),
    kick: vi.spyOn(client, "kick").mockResolvedValue(),
    setManager: vi.spyOn(client, "setManager").mockResolvedValue(),
    setChannelBackground: vi.spyOn(client, "setChannelBackground").mockResolvedValue(),
    setRoomBackgrounds: vi.spyOn(client, "setRoomBackgrounds").mockImplementation(async (next) => {
      client.roomBackgrounds = next;
    }),
  };
  useXenaxioMeStore.setState({
    me: { user: { id: "u", email: "x@acme.de", displayName: "X", role: opts.role ?? "user", mustChangePassword: false }, tenant: { id: "t", name: "Acme", status: "active" }, edition: "cloud" } as never,
    loadedAt: Date.now(),
    loading: false,
  });
  render(
    <ChatDialogsProvider>
      {opts.dm ? <RoomBackgroundDialog client={client} room={room} onClose={vi.fn()} /> : <ChannelDetails client={client} room={room} onClose={vi.fn()} onInvite={vi.fn()} onIntegrations={vi.fn()} />}
    </ChatDialogsProvider>,
  );
  return { client, room, calls };
}

async function answerPrompt(value: string) {
  const dialog = await screen.findByRole("dialog", { name: /description/i });
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value } });
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  });
}

describe("channel details (step 99, part B)", () => {
  beforeEach(() => api.changeChatChannel.mockClear());

  it("the manager edits the description and limits posting to managers", async () => {
    const { calls } = setup({ me: ANNA, levels: { [ANNA]: 100 } });
    expect(screen.getByText("Kickoff")).toBeTruthy();
    expect(screen.getByText(/Created by .* on/)).toBeTruthy();
    const edits = screen.getAllByRole("button", { name: "Edit" });
    expect(edits).toHaveLength(3);
    fireEvent.click(edits[2] as HTMLElement);
    await answerPrompt("  Alles zum Projekt ");
    expect(calls.setDescription).toHaveBeenCalledWith("!proj:acme.de", "Alles zum Projekt");

    fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
    await act(async () => {
      fireEvent.click(screen.getAllByRole("radio", { name: /^Channel managers only/ })[0] as HTMLElement);
    });
    expect(calls.setRoomRules).toHaveBeenCalledWith("!proj:acme.de", { posting: "managers" });
    expect(api.changeChatChannel).not.toHaveBeenCalled();
  });

  it("a member sees no edit buttons and no settings", () => {
    setup({ me: BEN, levels: { [ANNA]: 100 } });
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Settings" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Members" }));
    expect(screen.queryByRole("button", { name: "Remove from channel" })).toBeNull();
  });

  it("the company admin changes it through the platform", async () => {
    const { calls } = setup({ me: BEN, levels: { [ANNA]: 100 }, role: "admin" });
    fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
    await act(async () => {
      // Matrix lets only moderators notify everyone by default; the admin opens it to all.
      fireEvent.click(screen.getAllByRole("radio", { name: "All members" })[1] as HTMLElement);
    });
    expect(api.changeChatChannel).toHaveBeenCalledWith("!proj:acme.de", { channelMentions: "everyone" });
    expect(calls.setRoomRules).not.toHaveBeenCalled();
  });

  it("the manager makes a member a manager or removes them; managers come first", async () => {
    const { calls } = setup({ me: ANNA, levels: { [ANNA]: 100 } });
    fireEvent.click(screen.getByRole("tab", { name: "Members" }));
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]?.textContent).toContain("Anna");
    expect(rows[0]?.textContent).toContain("Manager");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Make channel manager" }));
    });
    expect(calls.setManager).toHaveBeenCalledWith("!proj:acme.de", BEN, true);
    fireEvent.click(screen.getByRole("button", { name: "Remove from channel" }));
    const confirm = await screen.findByRole("alertdialog");
    await act(async () => {
      fireEvent.click(within(confirm).getByRole("button", { name: "Remove from channel" }));
    });
    expect(calls.kick).toHaveBeenCalledWith("!proj:acme.de", BEN);
  });
});

describe("channel background (step 109)", () => {
  beforeEach(() => {
    api.changeChatChannel.mockClear();
    media.uploadFile.mockClear();
    media.shrinkPicture.mockClear();
  });
  const section = (name: string) => screen.getByRole("heading", { name }).closest("section") as HTMLElement;

  it("a manager sets it for everyone, and chooses only for themselves", async () => {
    const { calls } = setup({ me: ANNA, levels: { [ANNA]: 100 } });
    fireEvent.click(screen.getByRole("tab", { name: "Background" }));
    await act(async () => {
      fireEvent.click(within(section("Channel background")).getByRole("button", { name: "Sea" }));
    });
    expect(calls.setChannelBackground).toHaveBeenCalledWith("!proj:acme.de", { background: "img-sea" });
    expect(api.changeChatChannel).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(section("Background for me")).getByRole("button", { name: "Default" }));
    });
    expect(calls.setRoomBackgrounds).toHaveBeenLastCalledWith({ hideAll: false, rooms: { "!proj:acme.de": "default" } });
  });

  it("a member cannot set it for everyone, but chooses their own and hides all", async () => {
    const { calls, client } = setup({ me: BEN, levels: { [ANNA]: 100 }, background: "img-sea" });
    client.roomBackgrounds = { hideAll: false, rooms: {} };
    fireEvent.click(screen.getByRole("tab", { name: "Background" }));
    expect(screen.queryByRole("heading", { name: "Channel background" })).toBeNull();
    expect(screen.getByText(/The channel has the background "Sea"/)).toBeTruthy();
    const mine = section("Background for me");
    expect(within(mine).getByRole("button", { name: "As in the channel (Sea)" }).getAttribute("aria-pressed")).toBe("true");
    await act(async () => {
      fireEvent.click(within(mine).getByRole("button", { name: "Blue" }));
    });
    expect(calls.setRoomBackgrounds).toHaveBeenLastCalledWith({ hideAll: false, rooms: { "!proj:acme.de": "grad-blue" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: /Hide backgrounds in all channels/ }));
    });
    expect(calls.setRoomBackgrounds).toHaveBeenLastCalledWith({ hideAll: true, rooms: { "!proj:acme.de": "grad-blue" } });
    expect(calls.setChannelBackground).not.toHaveBeenCalled();
  });

  it("a manager uploads an own picture: made smaller, kept with the chat's files, set in the channel", async () => {
    const { calls } = setup({ me: ANNA, levels: { [ANNA]: 100 } });
    fireEvent.click(screen.getByRole("tab", { name: "Background" }));
    const input = screen.getByTestId("room-background-file") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["x"], "foto.txt", { type: "text/plain" })] } });
    });
    expect(media.uploadFile).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["x"], "foto.png", { type: "image/png" })] } });
    });
    expect(media.shrinkPicture).toHaveBeenCalledWith(expect.any(File), 2560);
    expect(media.uploadFile).toHaveBeenCalledWith(expect.any(Blob), "background.jpg");
    expect(calls.setChannelBackground).toHaveBeenCalledWith("!proj:acme.de", { image: "mxc://acme.de/Pic1" });
  });

  it("the company admin uploads through the platform", async () => {
    setup({ me: BEN, levels: { [ANNA]: 100 }, role: "admin" });
    fireEvent.click(screen.getByRole("tab", { name: "Background" }));
    await act(async () => {
      fireEvent.change(screen.getByTestId("room-background-file"), { target: { files: [new File(["x"], "foto.jpg", { type: "image/jpeg" })] } });
    });
    expect(api.changeChatChannel).toHaveBeenCalledWith("!proj:acme.de", { backgroundImage: "mxc://acme.de/Pic1" });
  });

  it("a direct conversation: anyone in it sets it for both; the company admin does not step in", async () => {
    const { calls } = setup({ me: BEN, levels: { [ANNA]: 100, [BEN]: 100 }, dm: true });
    expect(screen.getByRole("heading", { name: "Conversation background" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(section("Conversation background")).getByRole("button", { name: "Pink" }));
    });
    expect(calls.setChannelBackground).toHaveBeenCalledWith("!proj:acme.de", { background: "grad-pink" });
    cleanupAll();
    setup({ me: BEN, levels: { [ANNA]: 100 }, dm: true, role: "admin" });
    expect(screen.queryByRole("heading", { name: "Conversation background" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Background for me" })).toBeTruthy();
  });

  it("the company admin sets it through the platform; none removes it", async () => {
    const { calls } = setup({ me: BEN, levels: { [ANNA]: 100 }, role: "admin", background: "img-sea" });
    fireEvent.click(screen.getByRole("tab", { name: "Background" }));
    await act(async () => {
      fireEvent.click(within(section("Channel background")).getByRole("button", { name: "None" }));
    });
    expect(api.changeChatChannel).toHaveBeenCalledWith("!proj:acme.de", { background: null });
    expect(calls.setChannelBackground).not.toHaveBeenCalled();
  });
});

describe("channel rules on the client (step 99)", () => {
  it("reads and writes who posts and who may @channel through the power levels", async () => {
    const client = new RealClient();
    const room = { powerLevels: power({ "@a:x": 100 }) } as unknown as Room;
    expect(client.roomRules(room)).toEqual({ posting: "everyone", channelMentions: "managers" });
    room.powerLevels = { ...room.powerLevels, events: { "m.room.message": 50 }, notifications: { room: 0 } };
    expect(client.roomRules(room)).toEqual({ posting: "managers", channelMentions: "everyone" });
    expect(client.isManager(room, "@a:x")).toBe(true);
    expect(client.isManager(room, "@b:x")).toBe(false);
  });
});
