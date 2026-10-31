import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Step 107: the same settings on XenRooms — the companies' column instead of
// the mail navigation, no calendar/contacts/files pages; mail is set up here.
// A person without a mailbox: Account, General, Appearance without a mail session.
const scope = vi.hoisted(() => ({ portal: { kind: "rooms" } as { kind: string } | null }));
vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => (ns ? `${ns}.${key}` : key),
  useMessages: () => ({}),
  useLocale: () => "de",
  useFormatter: () => ({ dateTime: String, relativeTime: String, number: String }),
}));
vi.mock("@/hooks/use-media-query", () => ({
  useIsDesktop: () => true,
  useIsMobile: () => false,
  useMediaQuery: () => false,
  useDeviceDetection: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
}));
vi.mock("@/lib/xenaxio/bff", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/bff")>()), XENAXIO_BFF: true }));
vi.mock("@/lib/xenaxio/portal", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/portal")>()), usePortal: () => scope.portal }));
vi.mock("@/hooks/use-config", () => ({ useConfig: () => ({ appName: "Mail", stalwartFeaturesEnabled: false }) }));
vi.mock("@/components/layout/navigation-rail", () => ({ NavigationRail: () => <nav>mail navigation</nav> }));
vi.mock("@/components/xenaxio/chat/rooms-rail", () => ({ RoomsRail: () => <nav>companies</nav> }));
vi.mock("@/components/layout/sidebar-apps-modal", () => ({ SidebarAppsModal: () => null }));
vi.mock("@/components/plugins/app-top-banner-slot", () => ({ AppTopBannerSlot: () => null }));
vi.mock("@/components/settings/account-settings", () => ({ AccountSettings: () => <div>mailbox account</div> }));
vi.mock("@/components/xenaxio/profile-setting", () => ({ XenaxioProfileSetting: () => <div>profile form</div>, XenaxioPasswordSetting: () => <a href="/workspace/password">password</a> }));
vi.mock("@/components/xenaxio/name-setting", () => ({ XenaxioNameSetting: () => <div>name</div> }));
vi.mock("@/components/xenaxio/profile-picture-setting", () => ({ ProfilePictureSetting: () => <div>picture</div> }));

const { SettingsApp } = await import("@/components/settings/settings-app");
const { useAuthStore } = await import("@/stores/auth-store");
const { useXenaxioMeStore } = await import("@/lib/xenaxio/me-store");
const { usePluginStore } = await import("@/stores/plugin-store");
const { useThemeStore } = await import("@/stores/theme-store");
const { scopeTabs } = await import("../settings-scope");

const client = new Proxy({}, { get: (_t, prop) => (prop === "then" ? undefined : prop === "getAccountId" ? () => "acc" : prop.toString().startsWith("supports") ? () => true : () => null) });

function signIn(kind: "mailbox" | "chat") {
  useXenaxioMeStore.setState({
    me: { user: { id: "u1", email: "anna@acme.de", displayName: "Anna", role: "user", mustChangePassword: false, kind }, tenant: { id: "t1", name: "Acme", status: "active", product: kind === "chat" ? "rooms" : "workspace" }, edition: "cloud" },
    loadedAt: Date.now(),
    load: vi.fn(async () => undefined),
  } as never);
  useAuthStore.setState(kind === "chat" ? { isAuthenticated: false, isLoading: false, client: null, checkAuth: vi.fn(async () => undefined) } : { isAuthenticated: true, isLoading: false, client: client as never });
}

const tabs = () => screen.queryAllByTestId(/^settings-tab-/).map((el) => el.getAttribute("data-testid")!.replace("settings-tab-", ""));

beforeEach(() => {
  scope.portal = { kind: "rooms" };
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected network request")));
  try {
    localStorage.setItem("settings-active-tab", "account");
  } catch {
    /* ignore */
  }
  usePluginStore.setState({ initializePlugins: vi.fn().mockResolvedValue(undefined) });
  useThemeStore.setState({ syncServerThemes: vi.fn().mockResolvedValue(undefined) } as never);
});

describe("step 107: settings on XenRooms", () => {
  it("someone with a mailbox: the mail pages too, no calendar, contacts or files; the companies' column", () => {
    signIn("mailbox");
    render(<SettingsApp linkSegments={["account"]} />);
    expect(tabs()).toEqual(expect.arrayContaining(["account", "notifications", "general", "appearance", "message_list", "reading", "composing", "organize", "vacation"]));
    for (const hidden of ["calendar", "contacts", "files", "addons"]) expect(tabs()).not.toContain(hidden);
    expect(screen.getByText("companies")).toBeTruthy();
    expect(screen.queryByText("mail navigation")).toBeNull();
    expect(screen.getByText("mailbox account")).toBeTruthy();
    expect(screen.getByText("Zum Chat")).toBeTruthy();
  });

  it("someone without a mailbox: Account (name, picture, password, profile), General and Appearance, without a mail session", () => {
    signIn("chat");
    render(<SettingsApp linkSegments={["account"]} />);
    expect(tabs()).toEqual(["account", "general", "appearance"]);
    expect(screen.getByText("profile form")).toBeTruthy();
    expect(screen.getByText("password").getAttribute("href")).toBe("/workspace/password");
    expect(screen.getByText("anna@acme.de")).toBeTruthy();
    expect(screen.queryByText("mailbox account")).toBeNull();
  });

  it("Xenaxio keeps its pages and navigation", () => {
    scope.portal = { kind: "tenant" };
    signIn("mailbox");
    render(<SettingsApp linkSegments={["account"]} />);
    expect(tabs()).toEqual(expect.arrayContaining(["calendar", "contacts"]));
    expect(screen.getByText("mail navigation")).toBeTruthy();
    expect(scopeTabs([{ id: "calendar", group: "apps" }], { rooms: false, chatOnly: false })).toHaveLength(1);
  });
});
