import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Step 151 A: the phones with the Xenaxio app in Settings → Account.
const api = vi.hoisted(() => ({ calls: [] as { url: string; method: string }[], devices: [] as unknown[] }));
vi.mock("next-intl", () => ({ useLocale: () => "de", useTranslations: () => (key: string) => key }));
vi.mock("@/lib/xenaxio/bff", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/bff")>()), XENAXIO_BFF: true }));
vi.mock("@/lib/browser-navigation", async (orig) => ({
  ...(await orig<typeof import("@/lib/browser-navigation")>()),
  apiFetch: vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = String(init.method ?? "GET");
    api.calls.push({ url, method });
    if (url === "/api/mobile/devices" && method === "GET") return new Response(JSON.stringify({ devices: api.devices }), { status: 200 });
    if (url.startsWith("/api/mobile/devices/") && method === "DELETE") return new Response(JSON.stringify({ ok: true }), { status: 200 });
    return new Response("{}", { status: 404 });
  }),
}));

const { XenaxioDevicesSetting } = await import("../devices-setting");

const phone = (id: string, name: string, platform: "ios" | "android") => ({ id, name, platform, createdAt: "2026-11-01T10:00:00Z", lastSeenAt: "2026-11-16T10:00:00Z", current: false });

describe("step 151 A: phones in Settings → Account", () => {
  beforeEach(() => {
    api.calls = [];
    api.devices = [];
  });

  it("shows nothing while no phone is signed in", async () => {
    const { container } = render(<XenaxioDevicesSetting />);
    await waitFor(() => expect(api.calls).toHaveLength(1));
    expect(container.textContent).toBe("");
  });

  it("lists the phones and signs one out after asking; the other stays", async () => {
    api.devices = [phone("d1", "iPhone von Max", "ios"), phone("d2", "Pixel", "android")];
    render(<XenaxioDevicesSetting />);
    expect(await screen.findByText("iPhone von Max")).toBeTruthy();
    expect(screen.getByText("Pixel")).toBeTruthy();
    expect(screen.getByText(/iPhone · zuletzt genutzt am 16\.11\.2026/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Abmelden" })[0] as HTMLElement);
    expect(api.calls.some((c) => c.method === "DELETE")).toBe(false);
    fireEvent.click(screen.getAllByRole("button", { name: "Abmelden" }).at(-1) as HTMLElement);
    await waitFor(() => expect(api.calls).toContainEqual({ url: "/api/mobile/devices/d1", method: "DELETE" }));
    await waitFor(() => expect(screen.queryByText("iPhone von Max")).toBeNull());
    expect(screen.getByText("Pixel")).toBeTruthy();
  });
});
