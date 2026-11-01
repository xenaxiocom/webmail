import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Step 110: the administration of a company without email (XenRooms) — the
// overview, the look without the portal's address and app icon, the AI page
// for Free, and the AI per person in "Personen".
const me = vi.hoisted(() => ({
  current: {
    user: { id: "u-eva", email: "eva@studio.io", displayName: "Eva", role: "admin", mustChangePassword: false, kind: "chat" },
    tenant: { id: "t1", name: "Studio", status: "active", product: "rooms", plan: "paid" },
    edition: "cloud",
  } as Record<string, unknown> & { user: { role: string }; tenant: { product: string; plan: string | null } },
}));
const api = vi.hoisted(() => ({ adminPortal: vi.fn(), roomsPeople: vi.fn(), setUserAi: vi.fn() }));
vi.mock("next-intl", () => ({ useLocale: () => "de" }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/xenaxio/workspace-shell", () => ({
  WorkspaceShell: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
  useMe: () => me.current,
}));
vi.mock("@/lib/xenaxio/me-store", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/me-store")>()), useXenaxioMe: () => me.current }));
vi.mock("@/components/xenaxio/booking-admin", () => ({ BookingAdmin: () => <div>booking pages</div> }));
vi.mock("@/lib/xenaxio/api", async (orig) => {
  const real = await orig<typeof import("@/lib/xenaxio/api")>();
  return { ...real, xenaxio: { ...real.xenaxio, ...api } };
});

const { default: WorkspacePage } = await import("@/app/(main)/[locale]/workspace/page");
const { default: AppearancePage } = await import("@/app/(main)/[locale]/workspace/appearance/page");
const { default: AiAdminPage } = await import("@/app/(main)/[locale]/workspace/ai/page");
const { default: PeoplePage } = await import("@/app/(main)/[locale]/workspace/rooms/people/page");

const links = () => screen.queryAllByRole("link").map((a) => a.getAttribute("href"));
const portal = { name: "Studio", slug: "studio", url: "https://xenrooms.app", color: "#1d4ed8", colorText: "#ffffff", logoUrl: "/api/portal/logo?v=1", iconUrl: "/api/portal/icon/180?v=1", iconBackground: null, background: null, baseDomain: "xenaxio.com", customHostnames: { target: "custom.xenaxio.com" }, hostname: null };

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  me.current = { ...me.current, user: { ...me.current.user, role: "admin" }, tenant: { ...me.current.tenant, product: "rooms", plan: "paid" } };
});

describe("step 110: Verwaltung in XenRooms", () => {
  it("paid: people, Rooms, look, meetings, AI, audit log, and the own assistant — nothing about mail", () => {
    render(<WorkspacePage />);
    expect(screen.getByRole("heading", { name: "Verwaltung" })).toBeTruthy();
    expect(links()).toEqual(["/workspace/rooms/people", "/workspace/chat", "/workspace/appearance", "/workspace/meetings", "/workspace/ai", "/workspace/audit", "/workspace/assistant", "/workspace/mcp", "/workspace/permissions", "/workspace/password"]);
  });

  it("Free: the AI tile says where it is and links nowhere; no assistant", () => {
    me.current = { ...me.current, tenant: { ...me.current.tenant, plan: "free" } };
    render(<WorkspacePage />);
    expect(links()).toEqual(["/workspace/rooms/people", "/workspace/chat", "/workspace/appearance", "/workspace/meetings", "/workspace/audit", "/workspace/password"]);
    expect(screen.getByTestId("workspace-tile-disabled").textContent).toContain("Im bezahlten XenRooms");
  });

  it("a colleague (not admin) sees only the own pages", () => {
    me.current = { ...me.current, user: { ...me.current.user, role: "user" } };
    render(<WorkspacePage />);
    expect(links()).toEqual(["/workspace/assistant", "/workspace/mcp", "/workspace/permissions", "/workspace/password"]);
  });

  it("Erscheinungsbild: logo, colour, the background behind the logo and for everyone (step 113); no portal address, own hostname, app icon or booking pages", async () => {
    api.adminPortal.mockResolvedValue(portal);
    render(<AppearancePage />);
    expect(await screen.findByText("Erscheint bei Ihrer Firma in XenRooms: in der Spalte der Firmen und oben in der Kanalliste.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Logo ersetzen|Logo hochladen|ersetzen/ })).toBeTruthy();
    expect(screen.queryByText(/Adresse/)).toBeNull();
    expect(screen.queryByText("booking pages")).toBeNull();
    // Step 113: the background behind the logo — about XenRooms, not about installing an app icon.
    expect(screen.getByText("Hintergrund hinter dem Logo")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Vorschau des Logos in XenRooms" })).toBeTruthy();
    expect(screen.queryByText("App-Symbol")).toBeNull();
    expect(screen.queryByText(/Zum Dock hinzufügen/)).toBeNull();
    // Step 113: the background for everyone shows behind the column of companies and the channel list.
    expect(screen.getByText("Hintergrund für alle")).toBeTruthy();
    expect(screen.getByText(/hinter der Spalte der Firmen und der Kanalliste/)).toBeTruthy();
  });

  it("Erscheinungsbild in Xenaxio keeps the address and the booking pages", async () => {
    me.current = { ...me.current, tenant: { ...me.current.tenant, product: "workspace", plan: null } };
    api.adminPortal.mockResolvedValue(portal);
    render(<AppearancePage />);
    await waitFor(() => expect(screen.getAllByText(/Adresse/).length).toBeGreaterThan(0));
    expect(screen.getByText("booking pages")).toBeTruthy();
  });

  it("KI in XenRooms Free: where to get it, no switches", () => {
    me.current = { ...me.current, tenant: { ...me.current.tenant, plan: "free" } };
    render(<AiAdminPage />);
    expect(screen.getByText(/Im bezahlten XenRooms/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("Personen (paid): the admin switches the AI per person", async () => {
    const person = { id: "u-anna", email: "anna@studio.io", displayName: "Anna", role: "user", status: "active", invited: false, chatAddress: "@anna:studio.xenrooms.app", createdAt: "2026-10-31T00:00:00Z", aiEnabled: true };
    api.roomsPeople.mockResolvedValueOnce({ people: [person], limit: null, chatDomain: "studio.xenrooms.app", plan: { plan: "paid" } });
    api.roomsPeople.mockResolvedValueOnce({ people: [{ ...person, aiEnabled: false }], limit: null, chatDomain: "studio.xenrooms.app", plan: { plan: "paid" } });
    api.setUserAi.mockResolvedValue({ ok: true });
    render(<PeoplePage />);
    fireEvent.click(await screen.findByRole("button", { name: "KI ausschalten" }));
    await waitFor(() => expect(api.setUserAi).toHaveBeenCalledWith("u-anna", false));
    expect(await screen.findByRole("button", { name: "KI einschalten" })).toBeTruthy();
  });

  it("Personen (Free): no AI switch", async () => {
    me.current = { ...me.current, tenant: { ...me.current.tenant, plan: "free" } };
    api.roomsPeople.mockResolvedValue({ people: [{ id: "u-anna", email: "anna@studio.io", displayName: "Anna", role: "user", status: "active", invited: false, chatAddress: null, createdAt: "2026-10-31T00:00:00Z", aiEnabled: false }], limit: 10, chatDomain: null, plan: { plan: "free", people: 1, maxPeople: 10, storageBytes: 1, usedBytes: 0 } });
    render(<PeoplePage />);
    await screen.findByText("anna@studio.io");
    expect(screen.queryByRole("button", { name: /KI/ })).toBeNull();
  });
});
