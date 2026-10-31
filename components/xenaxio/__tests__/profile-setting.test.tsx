import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Step 105: one profile for Xenaxio and XenRooms — Settings → Account shows the chat's form.
const api = vi.hoisted(() => ({ calls: [] as { url: string; method: string; body?: unknown }[], stored: null as unknown }));
vi.mock("next-intl", () => ({ useLocale: () => "de" }));
vi.mock("@/lib/xenaxio/bff", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/bff")>()), XENAXIO_BFF: true }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/lib/browser-navigation", async (orig) => ({
  ...(await orig<typeof import("@/lib/browser-navigation")>()),
  apiFetch: vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = String(init.method ?? "GET");
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    api.calls.push({ url, method, body });
    if (url === "/api/profile" && method === "GET") return new Response(JSON.stringify(api.stored), { status: 200 });
    if (url === "/api/profile" && method === "PUT") return new Response(JSON.stringify({ ...body, bannerImage: null }), { status: 200 });
    return new Response("{}", { status: 404 });
  }),
}));

const { useXenaxioMeStore } = await import("@/lib/xenaxio/me-store");
const { useChatStore } = await import("@/lib/xenaxio/chat/store");
const { usePeopleStore, resetPeopleForTests } = await import("@/lib/xenaxio/people");
const { XenaxioPasswordSetting, XenaxioProfileSetting } = await import("../profile-setting");

const empty = { title: null, department: null, phone: null, about: null, pronouns: null, contacts: [], banner: "none", frame: "none", bannerImage: null };

describe("step 105: the profile in Settings → Account", () => {
  beforeEach(() => {
    api.calls = [];
    api.stored = { ...empty, title: "Vertrieb", contacts: [{ kind: "telegram", value: "@anna_s" }] };
    resetPeopleForTests();
    useXenaxioMeStore.setState({
      me: { user: { id: "u1", email: "anna@acme.de", displayName: "Anna Schmidt", role: "user", mustChangePassword: false, kind: "chat" }, tenant: { id: "t1", name: "Acme", status: "active", product: "rooms" }, edition: "cloud" },
      loadedAt: Date.now(),
    } as never);
    useChatStore.setState({ colleagues: new Map([["@anna:acme.xenrooms.app", { address: "@anna:acme.xenrooms.app", email: "anna@acme.de", displayName: "Anna Schmidt", avatarUrl: null, profile: api.stored as never }]]) });
    usePeopleStore.setState({ people: new Map([["anna@acme.de", { id: "u1", email: "anna@acme.de", displayName: "Anna Schmidt", avatarUrl: null, avatarAnimation: null, profile: api.stored as never, chatAddress: null }]]) });
  });

  it("loads the own profile, saves it and updates the chat and the colleagues' cards at once", async () => {
    render(<XenaxioProfileSetting />);
    const title = (await screen.findByLabelText("Position")) as HTMLInputElement;
    expect(title.value).toBe("Vertrieb");
    expect(screen.getByDisplayValue("@anna_s")).toBeTruthy();
    // The picture has its own row in Settings → Account.
    expect(screen.queryByText("Profilbild")).toBeNull();
    fireEvent.change(title, { target: { value: "Vertriebsleitung" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(api.calls.some((c) => c.method === "PUT")).toBe(true));
    expect(api.calls.find((c) => c.method === "PUT")?.body).toMatchObject({ title: "Vertriebsleitung", contacts: [{ kind: "telegram", value: "@anna_s" }] });
    await waitFor(() => expect(useChatStore.getState().colleagues.get("@anna:acme.xenrooms.app")?.profile?.title).toBe("Vertriebsleitung"));
    expect(usePeopleStore.getState().people.get("anna@acme.de")?.profile.title).toBe("Vertriebsleitung");
  });

  it("marks a wrong contact at its field and sends nothing", async () => {
    api.stored = { ...empty, contacts: [{ kind: "x", value: "Esso.dev" }] };
    render(<XenaxioProfileSetting />);
    await screen.findByDisplayValue("Esso.dev");
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(api.calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("leads to the own password", () => {
    render(<XenaxioPasswordSetting />);
    expect(screen.getByTestId("settings-password-link").getAttribute("href")).toBe("/workspace/password");
  });
});
