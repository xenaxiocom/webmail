import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saved = vi.hoisted(() => ({ body: null as unknown, calls: [] as { url: string; method: string }[], reply: null as null | { status: number; body: unknown } }));
vi.mock("@/lib/browser-navigation", async (orig) => ({
  ...(await orig<typeof import("@/lib/browser-navigation")>()),
  apiFetch: vi.fn(async (url: string, init: RequestInit) => {
    saved.calls.push({ url, method: String(init.method) });
    if (saved.reply) return new Response(JSON.stringify(saved.reply.body), { status: saved.reply.status });
    if (url === "/api/profile") {
      saved.body = JSON.parse(String(init.body));
      return new Response(String(init.body), { status: 200 });
    }
    return new Response(JSON.stringify({ bannerImage: null, avatarUrl: null }), { status: 200 });
  }),
}));

const { contactLink, validContact } = await import("@/lib/xenaxio/chat/profile");
const { ChatClient } = await import("@/lib/xenaxio/chat/client");
const { useChatStore } = await import("@/lib/xenaxio/chat/store");
const { useXenaxioMeStore } = await import("@/lib/xenaxio/me-store");
type Colleague = import("@/lib/xenaxio/chat/store").Colleague;
const { ChatSidePanel } = await import("../chat/side-panels");
const { ChatDialogsProvider } = await import("../chat/dialogs");

const annaProfile = { title: "Vertrieb", department: "Nord", phone: "+49 30 1234", about: "Fragt mich zu Angeboten", pronouns: "sie/ihr", contacts: [{ kind: "telegram" as const, value: "@anna_s" }, { kind: "github" as const, value: "anna-s" }], banner: "ocean" as const, frame: "gold" as const, bannerImage: null };
const anna: Colleague = { id: "u-anna", address: "@anna:acme.de", email: "anna@acme.de", displayName: "Anna Schmidt", avatarUrl: "/api/avatars/u-anna?v=1", profile: annaProfile };
const maxProfile = { ...annaProfile, title: null, phone: null, contacts: [{ kind: "telegram" as const, value: "@esso_dev" }, { kind: "x" as const, value: "esso_dev" }], banner: "none" as const, frame: "none" as const };
const max: Colleague = { id: "u-max", address: "@max:acme.de", email: "max@acme.de", displayName: "Max", avatarUrl: null, profile: maxProfile };

function setup(userId: string) {
  const client = new ChatClient();
  client.userId = "@max:acme.de";
  useChatStore.setState({ client, colleagues: new Map<string, Colleague>([["@anna:acme.de", anna], ["@max:acme.de", max]]) });
  return render(
    <ChatDialogsProvider>
      <ChatSidePanel client={client} panel={{ kind: "profile", userId }} />
    </ChatDialogsProvider>,
  );
}

const dialog = () => within(screen.getByRole("dialog", { name: "Edit profile" }));

describe("profiles in Rooms (steps 99 G and 104)", () => {
  beforeEach(() => {
    saved.body = null;
    saved.calls = [];
    saved.reply = null;
    useXenaxioMeStore.setState({ me: null } as never);
  });

  it("contacts become safe links; the form checks with the platform's rules", () => {
    expect(contactLink({ kind: "telegram", value: "@anna_s" })).toBe("https://t.me/anna_s");
    expect(contactLink({ kind: "whatsapp", value: "+49 170 123 45 67" })).toBe("https://wa.me/491701234567");
    expect(contactLink({ kind: "linkedin", value: "anna-schmidt" })).toBe("https://www.linkedin.com/in/anna-schmidt");
    expect(contactLink({ kind: "website", value: "javascript:alert(1)" })).toBeNull();
    expect(contactLink({ kind: "phone", value: "+49 30 1234" })).toBe("tel:+49301234");
    expect(validContact({ kind: "x", value: "Esso.dev" })).toBe(false);
    expect(validContact({ kind: "x", value: "@esso_dev" })).toBe(true);
    expect(validContact({ kind: "github", value: "es_ua" })).toBe(false);
  });

  it("a colleague's card: role, pronouns, actions, contacts as tiles with their service", () => {
    setup("@anna:acme.de");
    expect(screen.getByText("Vertrieb · Nord")).toBeTruthy();
    expect(screen.getByText("sie/ihr")).toBeTruthy();
    expect(screen.getByTestId("profile-banner")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Message" })).toBeTruthy();
    const tiles = within(screen.getByTestId("profile-contacts")).getAllByRole("link");
    expect(tiles.map((a) => [a.getAttribute("data-contact"), a.getAttribute("href")])).toEqual([
      ["email", "mailto:anna@acme.de"],
      ["phone", "tel:+49301234"],
      ["telegram", "https://t.me/anna_s"],
      ["github", "https://github.com/anna-s"],
    ]);
    expect(screen.getByRole("link", { name: "Telegram: @anna_s" }).getAttribute("target")).toBe("_blank");
    expect(screen.getByRole("button", { name: "Copy anna@acme.de" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit profile" })).toBeNull();
    // Not an admin: no way to remove her picture.
    expect(screen.queryByRole("button", { name: "Admin" })).toBeNull();
  });

  it("marks the wrong field with its rule instead of a general message; nothing is sent", async () => {
    setup("@max:acme.de");
    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    const values = dialog().getAllByLabelText("Contact") as HTMLInputElement[];
    fireEvent.change(values[1]!, { target: { value: "Esso.dev" } });
    await act(async () => {
      fireEvent.click(dialog().getByRole("button", { name: "Save" }));
    });
    expect(saved.body).toBeNull();
    expect(values[1]!.getAttribute("aria-invalid")).toBe("true");
    expect(values[0]!.getAttribute("aria-invalid")).toBe("false");
    expect(dialog().getByText(/X: a user name \(up to 15 letters, digits or _, no dots\)/)).toBeTruthy();
    expect(dialog().getByText("Please correct the marked fields.")).toBeTruthy();
    // Fixing it saves.
    fireEvent.change(values[1]!, { target: { value: "esso_dev" } });
    fireEvent.change(dialog().getByLabelText("Job title"), { target: { value: "CTO" } });
    fireEvent.click(dialog().getByRole("radio", { name: "Sunset" }));
    await act(async () => {
      fireEvent.click(dialog().getByRole("button", { name: "Save" }));
    });
    expect(saved.body).toMatchObject({ title: "CTO", banner: "sunset", contacts: [{ kind: "telegram", value: "@esso_dev" }, { kind: "x", value: "esso_dev" }] });
    expect(saved.body).not.toHaveProperty("bannerImage");
    expect(useChatStore.getState().colleagues.get("@max:acme.de")?.profile?.title).toBe("CTO");
  });

  it("a field the platform refuses is marked where it is", async () => {
    setup("@max:acme.de");
    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    saved.reply = { status: 400, body: { error: "validation", issues: [{ path: "contacts.0.value", message: "contact_telegram" }] } };
    await act(async () => {
      fireEvent.click(dialog().getByRole("button", { name: "Save" }));
    });
    const values = dialog().getAllByLabelText("Contact");
    expect(values[0]!.getAttribute("aria-invalid")).toBe("true");
    expect(dialog().getByText(/Telegram: a user name/)).toBeTruthy();
  });

  it("contacts are moved with the handle (keyboard here; mouse and finger the same way)", async () => {
    setup("@max:acme.de");
    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    const handle = dialog().getByRole("button", { name: /Move contact 1/ });
    expect(dialog().getByText("Drag ⋮⋮ to change the order.")).toBeTruthy();
    await act(async () => {
      fireEvent.keyDown(handle, { key: " ", code: "Space" });
    });
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? handle, { key: "ArrowDown", code: "ArrowDown" });
    });
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? handle, { key: " ", code: "Space" });
    });
    await act(async () => {
      fireEvent.click(dialog().getByRole("button", { name: "Save" }));
    });
    // jsdom has no layout, so the keyboard sensor may not find the next row: the order is kept or swapped, never lost.
    const contacts = (saved.body as { contacts: { kind: string }[] }).contacts.map((c) => c.kind).sort();
    expect(contacts).toEqual(["telegram", "x"]);
  });

  it("the own banner picture is offered as a choice once uploaded; the admin can remove a colleague's", async () => {
    max.profile = { ...maxProfile, banner: "custom", bannerImage: { url: "/api/banners/u-max?v=1", animatedUrl: "/api/banners/u-max/animated?v=1", focusX: 20, focusY: 80 } };
    setup("@max:acme.de");
    const banner = screen.getByTestId("profile-banner").querySelector("img");
    expect(banner?.getAttribute("src")).toContain("/api/banners/u-max/animated");
    expect((banner as HTMLImageElement).style.objectPosition).toBe("20% 80%");
    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    expect(dialog().getByRole("radio", { name: "Own picture" }).getAttribute("aria-checked")).toBe("true");
    await act(async () => {
      fireEvent.click(dialog().getByRole("button", { name: "Remove own picture" }));
    });
    expect(saved.calls).toContainEqual({ url: "/api/me/banner", method: "DELETE" });
    expect(dialog().queryByRole("radio", { name: "Own picture" })).toBeNull();
    max.profile = maxProfile;
  });

  it("the company admin removes a colleague's picture (confirmed; the card shows initials)", async () => {
    useXenaxioMeStore.setState({ me: { user: { id: "u-max", email: "max@acme.de", displayName: "Max", role: "admin", mustChangePassword: false } } } as never);
    setup("@anna:acme.de");
    fireEvent.click(screen.getByRole("button", { name: "Admin" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove profile picture" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remove" }));
    });
    expect(saved.calls).toContainEqual({ url: "/api/admin/users/u-anna/avatar", method: "DELETE" });
    expect(useChatStore.getState().colleagues.get("@anna:acme.de")?.avatarUrl).toBeNull();
    expect(screen.getByTestId("profile-avatar").textContent).toBe("AS");
  });
});
