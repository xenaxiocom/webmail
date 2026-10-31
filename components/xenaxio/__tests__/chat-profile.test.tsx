import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const saved = vi.hoisted(() => ({ body: null as unknown }));
vi.mock("@/lib/browser-navigation", async (orig) => ({
  ...(await orig<typeof import("@/lib/browser-navigation")>()),
  apiFetch: vi.fn(async (_url: string, init: RequestInit) => {
    saved.body = JSON.parse(String(init.body));
    return new Response(String(init.body), { status: 200 });
  }),
}));

const { contactLink } = await import("@/lib/xenaxio/chat/profile");
const { ChatClient } = await import("@/lib/xenaxio/chat/client");
const { useChatStore } = await import("@/lib/xenaxio/chat/store");
type Colleague = import("@/lib/xenaxio/chat/store").Colleague;
const { ChatSidePanel } = await import("../chat/side-panels");
const { ChatDialogsProvider } = await import("../chat/dialogs");

describe("profiles in Rooms (step 99, part G)", () => {
  it("contacts become safe links", () => {
    expect(contactLink({ kind: "telegram", value: "@anna_s" })).toBe("https://t.me/anna_s");
    expect(contactLink({ kind: "whatsapp", value: "+49 170 123 45 67" })).toBe("https://wa.me/491701234567");
    expect(contactLink({ kind: "linkedin", value: "anna-schmidt" })).toBe("https://www.linkedin.com/in/anna-schmidt");
    expect(contactLink({ kind: "website", value: "javascript:alert(1)" })).toBeNull();
    expect(contactLink({ kind: "phone", value: "+49 30 1234" })).toBe("tel:+49301234");
  });

  it("shows a colleague's job title, contacts and banner; one edits one's own", async () => {
    const client = new ChatClient();
    client.userId = "@max:acme.de";
    const anna = { address: "@anna:acme.de", email: "anna@acme.de", displayName: "Anna Schmidt", avatarUrl: null, profile: { title: "Vertrieb", department: "Nord", phone: null, about: "Fragt mich zu Angeboten", pronouns: "sie/ihr", contacts: [{ kind: "telegram" as const, value: "@anna_s" }], banner: "ocean" as const, frame: "gold" as const } };
    const max = { address: "@max:acme.de", email: "max@acme.de", displayName: "Max", avatarUrl: null, profile: { ...anna.profile, title: null, contacts: [], banner: "none" as const, frame: "none" as const } };
    useChatStore.setState({ client, colleagues: new Map<string, Colleague>([["@anna:acme.de", anna], ["@max:acme.de", max]]) });
    const ui = render(
      <ChatDialogsProvider>
        <ChatSidePanel client={client} panel={{ kind: "profile", userId: "@anna:acme.de" }} />
      </ChatDialogsProvider>,
    );
    expect(screen.getByText(/Vertrieb · Nord/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "@anna_s" }).getAttribute("href")).toBe("https://t.me/anna_s");
    expect(screen.getByTestId("profile-banner")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit profile" })).toBeNull();
    ui.rerender(
      <ChatDialogsProvider>
        <ChatSidePanel client={client} panel={{ kind: "profile", userId: "@max:acme.de" }} />
      </ChatDialogsProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    fireEvent.change(screen.getByLabelText("Job title"), { target: { value: "Geschäftsführung" } });
    fireEvent.click(screen.getByRole("radio", { name: "Sunset" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog", { name: "Edit profile" })).getByRole("button", { name: "Save" }));
    });
    expect(saved.body).toMatchObject({ title: "Geschäftsführung", banner: "sunset" });
    expect(useChatStore.getState().colleagues.get("@max:acme.de")?.profile?.title).toBe("Geschäftsführung");
  });
});
