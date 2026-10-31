import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserAccount } from "@/lib/xenaxio/api";

const api = vi.hoisted(() => ({ accounts: vi.fn(), accountsUnread: vi.fn(), switchAccount: vi.fn(), logout: vi.fn() }));
vi.mock("@/lib/xenaxio/api", async (orig) => {
  const real = await orig<typeof import("@/lib/xenaxio/api")>();
  return { ...real, xenaxio: { ...real.xenaxio, ...api } };
});
const opened = vi.hoisted(() => vi.fn());
vi.mock("@/lib/xenaxio/accounts", () => ({ openAccount: opened }));
vi.mock("next-intl", async (orig) => ({ ...(await orig<typeof import("next-intl")>()), useLocale: () => "en" }));
vi.mock("@/lib/xenaxio/me-store", () => ({
  useXenaxioMe: () => ({ user: { id: "u-acme", role: "admin" }, tenant: { name: "Acme GmbH" }, portal: { url: "https://acme.xenaxio.com" } }),
}));
vi.mock("@/lib/xenaxio/chat/nav", () => ({ useChatBadge: () => 2 }));

import { RoomsRail } from "../chat/rooms-rail";
import { useRoomsStore } from "@/lib/xenaxio/chat/rooms";

const account = (over: Partial<BrowserAccount>): BrowserAccount => ({
  userId: "u-acme",
  email: "max@acme.de",
  displayName: "Max",
  company: "Acme GmbH",
  portalUrl: "https://acme.xenaxio.com",
  active: true,
  color: "#003366",
  logoUrl: null,
  ...over,
});

describe("RoomsRail (step 67)", () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    opened.mockReset();
    useRoomsStore.setState({ accounts: [], unread: {}, max: 5 });
    api.accounts.mockResolvedValue({
      accounts: [account({}), account({ userId: "u-beta", email: "eva@beta.de", company: "Beta AG", active: false, color: null })],
      max: 5,
    });
  });

  it("shows every company with a red count for the other one's mentions and direct messages", async () => {
    api.accountsUnread.mockResolvedValue({ accounts: [{ userId: "u-beta", unread: 3, important: 4, available: true }] });
    render(<RoomsRail />);
    const beta = await screen.findByRole("button", { name: /Switch to Beta AG \(eva@beta\.de\) – 4 mentions and direct messages/ });
    await waitFor(() => expect(beta.textContent).toContain("4"));
    expect(beta.textContent).toContain("BA");
    // The open company: marked, with its own count from the chat connection.
    const acme = screen.getByRole("button", { name: /Acme GmbH \(max@acme\.de\) – open/ });
    expect(acme.getAttribute("aria-current")).toBe("true");
    expect(acme.textContent).toContain("2");
    // Administration stays in Xenaxio, in a new tab.
    expect(screen.getByRole("link", { name: "Administration in Xenaxio" }).getAttribute("href")).toBe("https://acme.xenaxio.com/en/workspace/");
  });

  it("switches without a password and stays in the chat", async () => {
    api.accountsUnread.mockResolvedValue({ accounts: [] });
    api.switchAccount.mockResolvedValue({ url: "/en/chat/" });
    render(<RoomsRail />);
    fireEvent.click(await screen.findByRole("button", { name: /Switch to Beta AG/ }));
    await waitFor(() => expect(opened).toHaveBeenCalledWith("/en/chat/"));
    expect(api.switchAccount).toHaveBeenCalledWith("u-beta", "/en/chat/");
  });

  it("adds a company until the browser's limit", async () => {
    api.accountsUnread.mockResolvedValue({ accounts: [] });
    api.accounts.mockResolvedValue({ accounts: [account({})], max: 1 });
    render(<RoomsRail />);
    const add = await screen.findByRole("button", { name: "Add a company" });
    await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(true));
  });
});
