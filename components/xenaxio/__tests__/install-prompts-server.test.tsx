import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Step 64: "Don't remind me again" on the install-the-app and notification
// cards was kept in the browser only, so the cards came back in another
// browser or on the company's own address. The platform now keeps it per user.

const api = vi.hoisted(() => ({ me: vi.fn(), dismissHint: vi.fn(), portal: vi.fn(async () => ({ kind: "app", portals: false, baseDomain: null })) }));
const mocks = vi.hoisted(() => ({
  authState: {
    client: { getAccountId: () => "account-1" },
    username: "anna@acme.de",
    isAuthenticated: true,
    isDemoMode: false,
    connectedAccountsRevision: 0,
    getAllConnectedClients: () => new Map(),
  },
  settingsState: {
    emailNotificationsEnabled: true,
    pushRelayUrl: "",
    pushNotifyInboxOnly: false,
    notificationMutes: { accounts: [] as string[], mailboxes: {} as Record<string, boolean> },
  },
  policyState: { loaded: true, policy: { pushRelayUrl: "https://relay.test", pushRelays: [], pushRelayUrlLocked: false } },
  isWebPushEnabled: vi.fn(),
}));

vi.mock("@/lib/xenaxio/bff", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/bff")>()), XENAXIO_BFF: true }));
vi.mock("@/lib/xenaxio/api", () => ({ xenaxio: api }));
vi.mock("next/navigation", () => ({ usePathname: () => "/en" }));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: Object.assign((selector: (s: typeof mocks.authState) => unknown) => selector(mocks.authState), {
    getState: () => mocks.authState,
  }),
}));
vi.mock("@/stores/account-store", () => ({ useAccountStore: { getState: () => ({ accounts: [] }) } }));
vi.mock("@/stores/settings-store", () => ({
  useSettingsStore: Object.assign((selector: (s: typeof mocks.settingsState) => unknown) => selector(mocks.settingsState), {
    getState: () => mocks.settingsState,
  }),
}));
vi.mock("@/stores/policy-store", () => ({
  usePolicyStore: (selector: (s: typeof mocks.policyState) => unknown) => selector(mocks.policyState),
}));
vi.mock("@/lib/web-push", () => ({
  DEFAULT_RELAY_BASE_URL: "https://relay.test",
  enableWebPush: vi.fn(),
  isWebPushSupported: () => true,
  isWebPushEnabled: mocks.isWebPushEnabled,
  resyncWebPush: vi.fn().mockResolvedValue(false),
}));

const { PWAInstallPrompt } = await import("@/components/pwa-install-prompt");
const { PushNotificationPrompt, PUSH_NOTIFICATION_PROMPT_DELAY_MS } = await import("@/components/push-notification-prompt");
const { useXenaxioMeStore } = await import("@/lib/xenaxio/me-store");

const me = (dismissedHints: string[]) => ({
  user: { id: "u1", email: "anna@acme.de", displayName: "Anna", role: "user" as const, mustChangePassword: false },
  tenant: { id: "t1", name: "Acme", status: "active" as const },
  edition: "cloud" as const,
  dismissedHints,
});

function offerInstall() {
  const event = Object.assign(new Event("beforeinstallprompt"), {
    prompt: vi.fn(),
    userChoice: Promise.resolve({ outcome: "dismissed" as const }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
}

beforeEach(() => {
  localStorage.clear();
  api.me.mockReset();
  api.dismissHint.mockReset().mockResolvedValue({ dismissedHints: [] });
  useXenaxioMeStore.setState({ me: null, loadedAt: 0, loading: false });
  mocks.isWebPushEnabled.mockReset().mockResolvedValue(false);
  Object.defineProperty(globalThis, "Notification", { configurable: true, value: { permission: "default" } });
});

describe("install card in xenaxio", () => {
  it("stays hidden when the user said so in another browser", async () => {
    api.me.mockResolvedValue(me(["pwa-install"]));
    await act(async () => render(<PWAInstallPrompt />));
    offerInstall();
    expect(screen.queryByText("dont_remind")).toBeNull();
  });

  it("does not show before the platform has answered", () => {
    api.me.mockReturnValue(new Promise(() => {}));
    render(<PWAInstallPrompt />);
    offerInstall();
    expect(screen.queryByText("dont_remind")).toBeNull();
  });

  it("tells the platform on \"Don't remind me again\"; \"Not now\" stays in this browser", async () => {
    api.me.mockResolvedValue(me([]));
    await act(async () => render(<PWAInstallPrompt />));
    offerInstall();
    fireEvent.click(screen.getByText("not_now"));
    expect(api.dismissHint).not.toHaveBeenCalled();
    offerInstall();
    await act(async () => fireEvent.click(screen.getByText("dont_remind")));
    expect(api.dismissHint).toHaveBeenCalledWith("pwa-install");
    expect(useXenaxioMeStore.getState().me?.dismissedHints).toEqual(["pwa-install"]);
    offerInstall();
    expect(screen.queryByText("dont_remind")).toBeNull();
  });
});

describe("notification card in xenaxio", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const wait = () => act(async () => void (await vi.advanceTimersByTimeAsync(PUSH_NOTIFICATION_PROMPT_DELAY_MS)));

  it("stays hidden when the user said so in another browser", async () => {
    api.me.mockResolvedValue(me(["push-prompt"]));
    render(<PushNotificationPrompt />);
    await wait();
    expect(mocks.isWebPushEnabled).not.toHaveBeenCalled();
    expect(screen.queryByText("dont_remind")).toBeNull();
  });

  it("tells the platform on \"Don't remind me again\"", async () => {
    api.me.mockResolvedValue(me([]));
    render(<PushNotificationPrompt />);
    await wait();
    await act(async () => fireEvent.click(screen.getByText("dont_remind")));
    expect(api.dismissHint).toHaveBeenCalledWith("push-prompt");
  });
});
