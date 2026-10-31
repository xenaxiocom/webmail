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
const mobile = vi.hoisted(() => ({ current: false }));
vi.mock("@/hooks/use-media-query", async (orig) => ({ ...(await orig<typeof import("@/hooks/use-media-query")>()), useIsMobile: () => mobile.current }));
vi.mock("@/lib/xenaxio/portal", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/portal")>()), usePortal: () => ({ kind: "rooms" }) }));

import { CompanyButton, RoomsRail as Rail } from "../chat/rooms-rail";
import { SidebarCollapseButton, SidebarExpandButton } from "../chat/sidebar-toggle";
import { useChatLayout } from "@/lib/xenaxio/chat/layout";
import { useRoomsAccounts, useRoomsStore } from "@/lib/xenaxio/chat/rooms";

/** The chat loads the companies (step 106: also while the column is hidden). */
function RoomsRail() {
  useRoomsAccounts(true);
  return <Rail />;
}
function Button() {
  useRoomsAccounts(true);
  return <CompanyButton />;
}

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
    useChatLayout.setState({ sidebarHidden: false, railHidden: false, companyOrder: [] });
    mobile.current = false;
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

describe("companies keep their order, the column hides (step 106)", () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    opened.mockReset();
    useRoomsStore.setState({ accounts: [], unread: {}, max: 5 });
    useChatLayout.setState({ sidebarHidden: false, railHidden: false, companyOrder: [] });
    mobile.current = false;
    api.accountsUnread.mockResolvedValue({ accounts: [] });
  });

  const tiles = () => screen.getAllByTestId("rooms-tile").map((el) => el.getAttribute("aria-label")?.match(/(Acme GmbH|Beta AG|Gamma KG)/)?.[1]);

  it("does not move the open company to the top; a new company comes last", async () => {
    // Beta was opened after Acme: the platform lists the open one first.
    useChatLayout.setState({ companyOrder: ["u-acme", "u-beta"] });
    api.accounts.mockResolvedValue({
      accounts: [
        account({ userId: "u-gamma", company: "Gamma KG", email: "g@gamma.de", active: true }),
        account({ userId: "u-beta", company: "Beta AG", email: "eva@beta.de", active: false }),
        account({ userId: "u-acme", active: false }),
      ],
      max: 5,
    });
    render(<RoomsRail />);
    await waitFor(() => expect(tiles()).toEqual(["Acme GmbH", "Beta AG", "Gamma KG"]));
    // The open one is only marked.
    expect(screen.getByRole("button", { name: /Gamma KG \(g@gamma\.de\) – open/ }).getAttribute("aria-current")).toBe("true");
    await waitFor(() => expect(useChatLayout.getState().companyOrder).toEqual(["u-acme", "u-beta", "u-gamma"]));
  });

  it("hides the column; the company button then opens the companies with the way back", async () => {
    api.accounts.mockResolvedValue({ accounts: [account({}), account({ userId: "u-beta", email: "eva@beta.de", company: "Beta AG", active: false })], max: 5 });
    api.accountsUnread.mockResolvedValue({ accounts: [{ userId: "u-beta", unread: 1, important: 3, available: true }] });
    render(<RoomsRail />);
    fireEvent.click(await screen.findByTestId("rooms-hide"));
    expect(useChatLayout.getState().railHidden).toBe(true);
    render(<Button />);
    const button = await screen.findByRole("button", { name: /Companies – 3 mentions and direct messages/ });
    fireEvent.click(button);
    const menu = await screen.findByRole("dialog", { name: "Companies" });
    expect(menu.querySelectorAll("[data-testid=rooms-company]").length).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "Show companies on the left" }));
    expect(useChatLayout.getState().railHidden).toBe(false);
  });

  it("on a phone opens the companies as a sheet and switches from there", async () => {
    mobile.current = true;
    api.accounts.mockResolvedValue({ accounts: [account({}), account({ userId: "u-beta", email: "eva@beta.de", company: "Beta AG", active: false })], max: 5 });
    api.switchAccount.mockResolvedValue({ url: "/en/chat/" });
    render(<Button />);
    fireEvent.click(await screen.findByTestId("rooms-company-button"));
    expect(screen.queryByRole("button", { name: "Show companies on the left" })).toBeNull();
    expect(screen.getByRole("link", { name: "Administration in Xenaxio" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Switch to Beta AG/ }));
    await waitFor(() => expect(opened).toHaveBeenCalledWith("/en/chat/"));
  });

  it("folds the channel list away and back", () => {
    render(
      <>
        <SidebarCollapseButton />
        <SidebarExpandButton />
      </>,
    );
    expect(screen.queryByTestId("chat-sidebar-show")).toBeNull();
    fireEvent.click(screen.getByTestId("chat-sidebar-hide"));
    expect(useChatLayout.getState().sidebarHidden).toBe(true);
    fireEvent.click(screen.getByTestId("chat-sidebar-show"));
    expect(useChatLayout.getState().sidebarHidden).toBe(false);
  });

  it("has nothing to fold on a phone", () => {
    mobile.current = true;
    useChatLayout.setState({ sidebarHidden: true });
    render(
      <>
        <SidebarCollapseButton />
        <SidebarExpandButton />
      </>,
    );
    expect(screen.queryByTestId("chat-sidebar-hide")).toBeNull();
    expect(screen.queryByTestId("chat-sidebar-show")).toBeNull();
  });
});
