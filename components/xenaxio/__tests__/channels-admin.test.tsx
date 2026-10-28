import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatChannelAdmin } from "@/lib/xenaxio/api";

const api = vi.hoisted(() => ({ chatChannels: vi.fn(), changeChatChannel: vi.fn() }));
vi.mock("@/lib/xenaxio/api", async (orig) => {
  const real = await orig<typeof import("@/lib/xenaxio/api")>();
  return { ...real, xenaxio: { ...real.xenaxio, ...api } };
});

import { ChannelsAdmin } from "../chat/channels-admin";

const channel = (over: Partial<ChatChannelAdmin>): ChatChannelAdmin => ({
  roomId: "!a:acme.de",
  name: "Alle",
  topic: null,
  isPublic: false,
  archived: false,
  members: 3,
  managed: true,
  external: false,
  general: false,
  ...over,
});

describe("ChannelsAdmin (step 63)", () => {
  beforeEach(() => {
    api.chatChannels.mockReset();
    api.changeChatChannel.mockReset();
  });

  it("lists every channel; Alle is never archived, unmanaged ones have no actions", async () => {
    api.chatChannels.mockResolvedValue({
      channels: [
        channel({ roomId: "!alle:acme.de", name: "Alle", general: true }),
        channel({ roomId: "!p:acme.de", name: "projekt", members: 2, topic: "Kickoff" }),
        channel({ roomId: "!o:acme.de", name: "verwaist", managed: false }),
        channel({ roomId: "!x:acme.de", name: "alt", archived: true }),
      ],
    });
    render(<ChannelsAdmin />);
    expect(await screen.findByText("projekt")).toBeTruthy();
    expect(screen.getByText("Kickoff")).toBeTruthy();
    expect(screen.getByText(/Cannot be managed/)).toBeTruthy();
    // Archived ones are hidden until asked for.
    expect(screen.queryByText("alt")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Archive channel" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Rename channel" })).toHaveLength(2);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByText("alt")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();
  });

  it("renames a channel in place", async () => {
    api.chatChannels.mockResolvedValue({ channels: [channel({ roomId: "!p:acme.de", name: "projekt" })] });
    api.changeChatChannel.mockResolvedValue(channel({ roomId: "!p:acme.de", name: "projekt-alpha" }));
    render(<ChannelsAdmin />);
    fireEvent.click(await screen.findByRole("button", { name: "Rename channel" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Rename channel" }), { target: { value: " projekt-alpha " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText("projekt-alpha")).toBeTruthy());
    expect(api.changeChatChannel).toHaveBeenCalledWith("!p:acme.de", { name: "projekt-alpha" });
  });
});
