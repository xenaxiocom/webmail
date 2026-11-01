import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// XenRooms asked for the password on every start of the installed app: the
// app opens on "/", moves on to the chat, and the cut-off /api/me looked like
// "signed out". Only a 401 means signed out; the sign-in form on XenRooms with
// a live session goes straight to the chat.
const api = vi.hoisted(() => ({ me: vi.fn(), roomsSignupOpen: vi.fn() }));
vi.mock("@/lib/xenaxio/api", async (orig) => {
  const real = await orig<typeof import("@/lib/xenaxio/api")>();
  return { ...real, xenaxio: { ...real.xenaxio, ...api } };
});
const portal = vi.hoisted(() => ({ current: { kind: "rooms" } as { kind: string } }));
vi.mock("@/lib/xenaxio/portal", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/portal")>()), usePortal: () => portal.current }));
const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("@/lib/browser-navigation", async (orig) => ({ ...(await orig<typeof import("@/lib/browser-navigation")>()), replaceWindowLocation: nav.replace }));
const search = vi.hoisted(() => ({ current: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => search.current, usePathname: () => "/en/login/", useRouter: () => router }));
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => router, Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("next-intl", async (orig) => ({ ...(await orig<typeof import("next-intl")>()), useLocale: () => "en" }));

import { XenaxioApiError } from "@/lib/xenaxio/api";
import { meWithRetry } from "@/stores/auth-store";
import LoginPage from "@/app/(main)/[locale]/login/page";

const me = (over: { mustChangePassword?: boolean } = {}) => ({ user: { id: "u1", email: "es@botkontor.com", displayName: "Yevgen", role: "admin", mustChangePassword: false, ...over } });

describe("XenRooms keeps the session when the app starts", () => {
  beforeEach(() => {
    api.me.mockReset();
    api.roomsSignupOpen.mockReset().mockResolvedValue({ open: false });
    nav.replace.mockReset();
    router.replace.mockReset();
    portal.current = { kind: "rooms" };
    search.current = new URLSearchParams();
  });

  it("asks /api/me again when a request got no answer", async () => {
    api.me.mockRejectedValueOnce(new XenaxioApiError(0, "network")).mockResolvedValueOnce(me());
    await expect(meWithRetry([0, 0])).resolves.toMatchObject({ user: { id: "u1" } });
    expect(api.me).toHaveBeenCalledTimes(2);
  });

  it("does not ask again after 401, and gives up after the last try", async () => {
    api.me.mockRejectedValue(new XenaxioApiError(401, "unauthorized"));
    await expect(meWithRetry([0, 0])).rejects.toMatchObject({ status: 401 });
    expect(api.me).toHaveBeenCalledTimes(1);
    api.me.mockReset().mockRejectedValue(new XenaxioApiError(0, "network"));
    await expect(meWithRetry([0, 0])).rejects.toMatchObject({ status: 0 });
    expect(api.me).toHaveBeenCalledTimes(3);
  });

  it("goes from the sign-in form straight to the chat with a live session", async () => {
    api.me.mockResolvedValue(me());
    render(<LoginPage />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/en/chat/"));
  });

  it("sends a temporary password to the change page", async () => {
    api.me.mockResolvedValue(me({ mustChangePassword: true }));
    render(<LoginPage />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/workspace/password"));
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("shows the form without a session, when adding a company, and outside XenRooms", async () => {
    api.me.mockRejectedValue(new XenaxioApiError(401, "unauthorized"));
    const { unmount } = render(<LoginPage />);
    await waitFor(() => expect(api.me).toHaveBeenCalled());
    expect(screen.getAllByLabelText(/password|passwort/i).length).toBeGreaterThan(0);
    unmount();

    api.me.mockReset().mockResolvedValue(me());
    search.current = new URLSearchParams("mode=add-account");
    render(<LoginPage />).unmount();
    portal.current = { kind: "tenant" };
    search.current = new URLSearchParams();
    render(<LoginPage />);
    await new Promise((r) => setTimeout(r, 10));
    expect(api.me).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
