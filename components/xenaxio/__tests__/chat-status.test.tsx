import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatClient } from "@/lib/xenaxio/chat/client";
import { useChatStore } from "@/lib/xenaxio/chat/store";
import { ChatSidePanel } from "../chat/side-panels";

/** The parts of the chat client the profile panel uses. */
function fakeClient(statusMsg?: string) {
  const people = new Map([["@anna:firma.de", { presence: "online", statusMsg }]]);
  const client = {
    userId: "@anna:firma.de",
    people,
    isExternalUser: () => false,
    isIgnored: () => false,
    setStatus: vi.fn(async (value: string | null) => {
      people.set("@anna:firma.de", { presence: "online", statusMsg: value ?? undefined });
    }),
  };
  return client as unknown as ChatClient & { setStatus: ReturnType<typeof vi.fn> };
}

const panel = { kind: "profile", userId: "@anna:firma.de" } as const;

/** Step 104: the status is changed in "Edit profile", tab "Status". */
function openStatus() {
  fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
  fireEvent.click(screen.getByRole("tab", { name: "Status" }));
  return within(screen.getByRole("dialog", { name: "Edit profile" }));
}

describe("own status in the profile panel", () => {
  beforeEach(() => {
    useChatStore.setState({ colleagues: new Map([["@anna:firma.de", { address: "@anna:firma.de", email: "anna@firma.de", displayName: "Anna", avatarUrl: null }]]) });
  });

  it("shows the current status under the name; the box for a new one starts empty", () => {
    render(<ChatSidePanel client={fakeClient("Im Meeting")} panel={panel} />);
    expect(screen.getByTestId("chat-status-pill").textContent).toBe("Im Meeting");
    const dialog = openStatus();
    expect(dialog.getByTestId("chat-current-status").textContent).toBe("Current status: Im Meeting");
    expect((dialog.getByLabelText("New status") as HTMLInputElement).value).toBe("");
    expect((dialog.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers to set one when there is none", () => {
    render(<ChatSidePanel client={fakeClient()} panel={panel} />);
    expect(screen.queryByTestId("chat-status-pill")).toBeNull();
    expect(screen.getByRole("button", { name: "Set a status" })).toBeTruthy();
    expect(openStatus().getByTestId("chat-current-status").textContent).toBe("Current status: No status");
  });

  it("saves the new status, shows it and empties the box", async () => {
    const client = fakeClient("Im Meeting");
    const { rerender } = render(<ChatSidePanel client={client} panel={panel} />);
    const dialog = openStatus();
    const box = dialog.getByLabelText("New status") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "  Im Urlaub " } });
    await act(async () => {
      fireEvent.click(dialog.getByRole("button", { name: "Save" }));
    });
    expect(client.setStatus).toHaveBeenCalledWith("Im Urlaub");
    rerender(<ChatSidePanel client={client} panel={panel} />);
    expect(screen.getByTestId("chat-status-pill").textContent).toBe("Im Urlaub");
    expect(box.value).toBe("");
  });
});
