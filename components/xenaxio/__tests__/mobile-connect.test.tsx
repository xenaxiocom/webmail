import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Step 152 R1: the phone's browser chooses which companies go to XenRooms.
const api = vi.hoisted(() => ({ calls: [] as { url: string; method: string; body?: unknown }[], accounts: [] as unknown[], query: "" }));
vi.mock("next-intl", () => ({ useLocale: () => "de", useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(api.query) }));
vi.mock("@/components/xenaxio/ui", () => ({
  AuthCard: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
  Notice: ({ children }: { children: ReactNode }) => <p role="alert">{children}</p>,
  Spinner: ({ label }: { label: string }) => <p>{label}</p>,
}));
vi.mock("@/components/xenaxio/chat/rooms-rail", () => ({ CompanyMark: () => <span /> }));
vi.mock("@/lib/browser-navigation", async (orig) => ({
  ...(await orig<typeof import("@/lib/browser-navigation")>()),
  apiFetch: vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = String(init.method ?? "GET");
    api.calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined });
    if (url === "/api/auth/accounts") return new Response(JSON.stringify({ accounts: api.accounts, max: 50 }), { status: 200 });
    if (url === "/api/mobile/authorize" && method === "POST") return new Response(JSON.stringify({ url: "xenrooms://auth/callback?code=c&state=state-1234" }), { status: 200 });
    return new Response("{}", { status: 404 });
  }),
}));

const { default: MobileConnectPage } = await import("@/app/(main)/[locale]/mobile/connect/page");
const { readMobileRequest } = await import("@/lib/xenaxio/mobile-connect");

const account = (userId: string, company: string) => ({ userId, email: `${userId}@x.de`, displayName: userId, company, portalUrl: "https://rooms.test", active: false });
const request = "redirect_uri=xenrooms%3A%2F%2Fauth%2Fcallback&state=state-1234&code_challenge=abcdefghijabcdefghijabcdefghijabcdefghij123&code_challenge_method=S256";
const assign = vi.fn();

describe("step 152 R1: companies for XenRooms on the phone", () => {
  beforeEach(() => {
    api.calls = [];
    api.accounts = [account("u1", "Acme GmbH"), account("u2", "Beta AG"), account("u3", "Gamma KG")];
    assign.mockReset();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, assign } });
  });

  it("reads only XenRooms' own request", () => {
    expect(readMobileRequest(new URLSearchParams(request))?.request.redirect_uri).toBe("xenrooms://auth/callback");
    expect(readMobileRequest(new URLSearchParams(request.replace("xenrooms", "xenaxio")))).toBeNull();
    expect(readMobileRequest(new URLSearchParams(request.replace("S256", "plain")))).toBeNull();
    expect([...(readMobileRequest(new URLSearchParams(`${request}&have=u1,u2`))?.have ?? [])]).toEqual(["u1", "u2"]);
  });

  it("ticks every company not yet on the phone and hands the ticked ones over", async () => {
    api.query = `${request}&have=u2`;
    render(<MobileConnectPage />);
    expect(await screen.findByText("Acme GmbH")).toBeTruthy();
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((b) => b.checked)).toEqual([true, false, true]);
    // The person unticks one.
    fireEvent.click(boxes[2] as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Auf das Telefon (1)" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("xenrooms://auth/callback?code=c&state=state-1234"));
    expect(api.calls.find((c) => c.method === "POST")?.body).toMatchObject({ redirect_uri: "xenrooms://auth/callback", state: "state-1234", userIds: ["u1"] });
  });

  it("cancel goes back to the app without a code; another company signs in first", async () => {
    api.query = request;
    render(<MobileConnectPage />);
    await screen.findByText("Acme GmbH");
    expect(screen.getByRole("link", { name: "Weitere Firma anmelden" }).getAttribute("href")).toContain("/api/mobile/authorize?");
    expect(screen.getByRole("link", { name: "Weitere Firma anmelden" }).getAttribute("href")).toContain("prompt=add");
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(assign).toHaveBeenCalledWith("xenrooms://auth/callback?error=access_denied&state=state-1234");
    expect(api.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("an incomplete request shows an error and asks nothing", async () => {
    api.query = "redirect_uri=https%3A%2F%2Fevil.example";
    render(<MobileConnectPage />);
    expect(screen.getByRole("alert").textContent).toMatch(/^Dieser Link ist ungültig/);
    expect(api.calls).toEqual([]);
  });
});
