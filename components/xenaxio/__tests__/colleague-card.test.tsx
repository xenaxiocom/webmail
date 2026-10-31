import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Step 107: a colleague's card outside the chat — mail, contacts' directory — with the same profile as in Rooms.
const api = vi.hoisted(() => ({ calls: 0 }));
vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => (ns ? `${ns}.${key}` : key),
  useLocale: () => "de",
}));
vi.mock("@/lib/xenaxio/bff", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/bff")>()), XENAXIO_BFF: true }));
vi.mock("@/lib/browser-navigation", async (orig) => ({
  ...(await orig<typeof import("@/lib/browser-navigation")>()),
  apiFetch: vi.fn(async (url: string) => {
    if (url !== "/api/people") return new Response("{}", { status: 404 });
    api.calls += 1;
    return new Response(
      JSON.stringify({
        people: [
          {
            id: "u-anna",
            email: "Anna@acme.de",
            displayName: "Anna Schmidt",
            avatarUrl: null,
            avatarAnimation: null,
            chatAddress: "@anna:acme.de",
            profile: { title: "Vertrieb", department: "Nord", phone: null, about: "Fragt mich zu Angeboten", pronouns: "sie/ihr", contacts: [{ kind: "telegram", value: "@anna_s" }], banner: "ocean", frame: "gold", bannerImage: null },
          },
        ],
      }),
      { status: 200 },
    );
  }),
}));

const { RecipientCard } = await import("@/components/email/recipient-popover");
const { DirectoryEntryDetail } = await import("@/components/contacts/directory-entry-detail");
const { resetPeopleForTests } = await import("@/lib/xenaxio/people");
const { useXenaxioMeStore } = await import("@/lib/xenaxio/me-store");

describe("step 107: a colleague's card outside the chat", () => {
  beforeEach(() => {
    api.calls = 0;
    resetPeopleForTests();
    useXenaxioMeStore.setState({
      me: { user: { id: "u-max", email: "max@acme.de", displayName: "Max", role: "user", mustChangePassword: false }, tenant: { id: "t1", name: "Acme", status: "active" }, edition: "cloud" },
      loadedAt: Date.now(),
      load: vi.fn(async () => undefined),
    } as never);
  });

  it("mail: the sender's card shows the profile and leads to Rooms", async () => {
    render(<RecipientCard name="Anna" email="anna@acme.de" />);
    const card = await screen.findByTestId("colleague-card");
    expect(within(card).getByText("Anna Schmidt")).toBeTruthy();
    expect(within(card).getByText("sie/ihr")).toBeTruthy();
    expect(within(card).getByText("Vertrieb · Nord")).toBeTruthy();
    expect(screen.getByText("Fragt mich zu Angeboten")).toBeTruthy();
    expect(screen.getByRole("link", { name: /@anna_s/ }).getAttribute("href")).toBe("https://t.me/anna_s");
    expect(screen.getByTestId("colleague-card-message").getAttribute("href")).toBe("/de/chat/?dm=%40anna%3Aacme.de");
    expect(screen.getByTestId("profile-banner")).toBeTruthy();
  });

  it("someone outside the company keeps the plain card; one request for all cards", async () => {
    render(
      <>
        <RecipientCard name="Bob" email="bob@other.de" />
        <RecipientCard name="Anna" email="anna@acme.de" />
      </>,
    );
    await screen.findByTestId("colleague-card");
    expect(screen.getAllByTestId("colleague-card")).toHaveLength(1);
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(api.calls).toBe(1);
  });

  it("contacts: the directory entry shows the same card", async () => {
    render(<DirectoryEntryDetail entry={{ id: "d1", name: "Anna Schmidt", email: "anna@acme.de", type: "individual" } as never} onCompose={vi.fn()} onAddToContacts={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("colleague-card")).toBeTruthy());
    expect(screen.getByText("Vertrieb · Nord")).toBeTruthy();
    expect(screen.getByTestId("colleague-card-message")).toBeTruthy();
  });

  it("no 'Message in Rooms' on one's own card", async () => {
    useXenaxioMeStore.setState({ me: { user: { id: "u-anna", email: "anna@acme.de", displayName: "Anna", role: "user", mustChangePassword: false }, tenant: { id: "t1", name: "Acme", status: "active" }, edition: "cloud" } } as never);
    render(<RecipientCard name="Anna" email="anna@acme.de" />);
    await screen.findByTestId("colleague-card");
    expect(screen.queryByTestId("colleague-card-message")).toBeNull();
  });
});
