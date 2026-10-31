import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/xenaxio/chat/push", async (orig) => ({
  ...(await orig<typeof import("@/lib/xenaxio/chat/push")>()),
  chatPushTarget: vi.fn(async () => "workspace"),
  browserTimeZone: () => "Europe/Berlin",
}));

const { ChatClient } = await import("@/lib/xenaxio/chat/client");
const { NotifySettingsDialog, useChatNotify } = await import("../chat/notifications");

describe("chat notification settings (step 99, part D)", () => {
  it("the default for channels goes to the chat server; phone, sound, preview and e-mail to the platform", async () => {
    const client = new ChatClient();
    vi.spyOn(client, "keywords").mockResolvedValue([]);
    const setDefault = vi.spyOn(client, "setDefaultLevel").mockResolvedValue();
    const save = vi.fn(async () => undefined);
    const settings = { dndUntil: null, dndFrom: null, dndTo: null, dndDays: [], emailDigest: true, mobileLevel: "same" as const, sound: true, preview: true, emailFrequency: "daily" as const };
    useChatNotify.setState({ push: "on", settings, save });
    render(<NotifySettingsDialog client={client} onClose={vi.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "Direct messages, mentions and keywords" }));
    });
    expect(setDefault).toHaveBeenCalledWith("mentions");
    await act(async () => {
      fireEvent.change(screen.getByLabelText("On phones"), { target: { value: "mentions" } });
    });
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ mobileLevel: "mentions" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: /Show the message text/ }));
    });
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ preview: false }));
    await act(async () => {
      fireEvent.change(screen.getByLabelText("E-mail about unread mentions"), { target: { value: "never" } });
    });
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ emailFrequency: "never", emailDigest: false }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Do not disturb on a schedule" }));
    expect(screen.getByText(/Time zone: Europe\/Berlin/)).toBeTruthy();
  });
});
