import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ChatClient } from "@/lib/xenaxio/chat/client";
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

describe("own status in the profile panel", () => {
  it("shows the current status under the name and an empty box for a new one", () => {
    render(<ChatSidePanel client={fakeClient("Im Meeting")} panel={panel} />);
    expect(screen.getByTestId("chat-current-status").textContent).toBe("Im Meeting");
    expect((screen.getByLabelText("New status") as HTMLInputElement).value).toBe("");
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("says when there is no status", () => {
    render(<ChatSidePanel client={fakeClient()} panel={panel} />);
    expect(screen.getByTestId("chat-current-status").textContent).toBe("No status");
  });

  it("saves the new status, shows it as the current one and empties the box", async () => {
    const client = fakeClient("Im Meeting");
    const { rerender } = render(<ChatSidePanel client={client} panel={panel} />);
    const box = screen.getByLabelText("New status") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "  Im Urlaub " } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    expect(client.setStatus).toHaveBeenCalledWith("Im Urlaub");
    rerender(<ChatSidePanel client={client} panel={panel} />);
    expect(screen.getByTestId("chat-current-status").textContent).toBe("Im Urlaub");
    expect(box.value).toBe("");
  });
});
