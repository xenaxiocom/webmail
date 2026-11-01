import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserAccount } from "@/lib/xenaxio/api";

// Step 110: no mail notice in XenRooms; "Rooms is off" is never a dead end.
const api = vi.hoisted(() => ({ setChatAdmin: vi.fn(), accounts: vi.fn(), accountsUnread: vi.fn() }));
vi.mock("@/lib/xenaxio/api", async (orig) => {
  const real = await orig<typeof import("@/lib/xenaxio/api")>();
  return { ...real, xenaxio: { ...real.xenaxio, ...api } };
});
const portal = vi.hoisted(() => ({ current: { kind: "rooms" } as { kind: string } }));
vi.mock("@/lib/xenaxio/portal", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/portal")>()), usePortal: () => portal.current }));
vi.mock("@/lib/xenaxio/me-store", async (orig) => ({
  ...(await orig<typeof import("@/lib/xenaxio/me-store")>()),
  useXenaxioMe: () => ({ user: { id: "u-acme", role: "admin" }, tenant: { name: "Essotec" }, domain: { name: "essotec.com", status: "pending" } }),
}));
vi.mock("next-intl", async (orig) => ({ ...(await orig<typeof import("next-intl")>()), useLocale: () => "en" }));

import { XenaxioDomainBanner } from "../domain-banner";
import { ChatOffNotice } from "../chat/notice";
import { useChatLayout } from "@/lib/xenaxio/chat/layout";
import { useRoomsStore } from "@/lib/xenaxio/chat/rooms";

const account = (over: Partial<BrowserAccount>): BrowserAccount => ({
  userId: "u-acme",
  email: "es@essotec.com",
  displayName: "Yevgen",
  company: "Essotec",
  portalUrl: "https://essotec.xenaxio.com",
  active: true,
  color: "#003366",
  logoUrl: null,
  ...over,
});

describe("Rooms on by default (step 110)", () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    portal.current = { kind: "rooms" };
    useChatLayout.setState({ railHidden: false });
    useRoomsStore.setState({ accounts: [], unread: {}, max: 50 });
  });

  it("shows the domain notice in Xenaxio, not in XenRooms", () => {
    const { container, rerender } = render(<XenaxioDomainBanner />);
    expect(container.textContent).toBe("");
    portal.current = { kind: "tenant" };
    rerender(<XenaxioDomainBanner />);
    expect(screen.getByRole("status").textContent).toContain("essotec.com");
  });

  it("lets the admin turn Rooms on right on the notice", async () => {
    api.setChatAdmin.mockResolvedValue({});
    const enabled = vi.fn();
    render(<ChatOffNotice admin onEnabled={enabled} />);
    expect(screen.queryByText(/Administration →/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Turn on Rooms" }));
    await waitFor(() => expect(enabled).toHaveBeenCalled());
    expect(api.setChatAdmin).toHaveBeenCalledWith(true);
  });

  it("tells an employee whom to ask, without a button", () => {
    render(<ChatOffNotice admin={false} onEnabled={() => {}} />);
    expect(screen.getByText(/ask your administrator/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Turn on Rooms" })).toBeNull();
  });

  it("keeps the company button when the companies' column is hidden", () => {
    useChatLayout.setState({ railHidden: true });
    useRoomsStore.setState({ accounts: [account({}), account({ userId: "u-beta", company: "Beta AG", active: false })], unread: {}, max: 50 });
    render(<ChatOffNotice admin={false} onEnabled={() => {}} />);
    expect(screen.getByTestId("rooms-company-button")).toBeTruthy();
  });
});
