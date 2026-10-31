import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Step 106, part A: every person in the operator console.
const api = vi.hoisted(() => ({ peopleSummary: vi.fn(), people: vi.fn(), person: vi.fn(), actions: vi.fn(), blockPerson: vi.fn(), unblockPerson: vi.fn(), blockedSignups: vi.fn(), addBlockedSignup: vi.fn(), removeBlockedSignup: vi.fn() }));
vi.mock("next-intl", () => ({ useLocale: () => "de" }));
vi.mock("@/lib/xenaxio/api", async (orig) => {
  const real = await orig<typeof import("@/lib/xenaxio/api")>();
  return { ...real, xenaxio: { ...real.xenaxio, operator: api } };
});

const { OperatorPeople } = await import("../operator-people");
const { peopleQuery } = await import("@/lib/xenaxio/api");

const account = (company: string, product: "workspace" | "rooms", extra: Record<string, unknown> = {}) => ({
  userId: `u-${company}`,
  tenantId: `t-${company}`,
  company,
  slug: company.toLowerCase(),
  product,
  plan: product === "rooms" ? "free" : null,
  companyStatus: "active",
  role: "admin",
  kind: product === "rooms" ? "chat" : "mailbox",
  status: "active",
  invited: false,
  createdAt: "2026-10-30T10:00:00Z",
  lastLoginAt: "2026-10-31T09:00:00Z",
  lastSeenAt: "2026-10-31T10:00:00Z",
  ...extra,
});

const summary = {
  people: 2, accounts: 3, workspacePeople: 1, roomsPeople: 2, new7: 2, new30: 2, active7: 1, active30: 2, neverSignedIn: 0, disabledAccounts: 1,
  companies: 3, workspaceCompanies: 1, roomsFreeCompanies: 1, roomsPaidCompanies: 1, freeSignups7: 1, freeSignups30: 1,
};

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.actions.mockResolvedValue([]);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  api.peopleSummary.mockResolvedValue(summary);
  api.people.mockResolvedValue({
    total: 2,
    page: 1,
    pageSize: 50,
    people: [
      { email: "max@acme.de", name: "Max Admin", createdAt: "2026-10-30T10:00:00Z", lastLoginAt: null, lastSeenAt: "2026-10-31T10:00:00Z", accounts: [account("Acme", "workspace"), account("Gamma", "rooms")] },
      { email: "eva@gmail.com", name: "Eva Berg", createdAt: "2026-10-29T10:00:00Z", lastLoginAt: null, lastSeenAt: null, accounts: [account("Beta", "rooms", { status: "disabled" })] },
    ],
  });
});

describe("step 106: people in the operator console", () => {
  it("shows the counters and one row per person with all their companies", async () => {
    render(<OperatorPeople />);
    expect(await screen.findByText("Max Admin")).toBeInTheDocument();
    expect(screen.getByText("+1 weitere")).toBeInTheDocument();
    expect(screen.getByText("Xenaxio, XenRooms Free")).toBeInTheDocument();
    expect(within(screen.getByText("Eva Berg").closest("tr")!).getByText("Gesperrt")).toBeInTheDocument();
    expect(screen.getByText("Nie angemeldet")).toBeInTheDocument();
    expect(screen.getByText("Xenaxio 1 · Free 1 · XenRooms 1")).toBeInTheDocument();
    expect(screen.getByText("2 Personen")).toBeInTheDocument();
  });

  it("filters, searches after a pause and opens a person's card", async () => {
    api.person.mockResolvedValue({
      email: "max@acme.de",
      name: "Max Admin",
      accounts: [account("Acme", "workspace"), account("Gamma", "rooms")],
      devices: [{ company: "Acme", browser: "Chrome", os: "macOS", signedInAt: "2026-10-31T09:00:00Z", lastSeenAt: "2026-10-31T10:00:00Z" }],
      lastLogin: { at: "2026-10-31T09:00:00Z", ip: "203.0.113.7", country: "DE" },
    });
    render(<OperatorPeople />);
    await screen.findByText("Max Admin");
    fireEvent.change(screen.getByLabelText("Produkt"), { target: { value: "rooms" } });
    await waitFor(() => expect(api.people).toHaveBeenLastCalledWith({ sort: "created", page: 1, product: "rooms" }));
    fireEvent.change(screen.getByLabelText("Suche"), { target: { value: "gamma" } });
    await waitFor(() => expect(api.people).toHaveBeenLastCalledWith({ sort: "created", page: 1, product: "rooms", q: "gamma" }));

    fireEvent.click(screen.getByText("Max Admin"));
    expect(await screen.findByText(/IP 203\.0\.113\.7 · DE/)).toBeInTheDocument();
    expect(screen.getByText(/Chrome · macOS — Acme/)).toBeInTheDocument();
    expect(api.person).toHaveBeenCalledWith("max@acme.de");
  });

  it("builds the CSV link from the filter without empty values", () => {
    expect(peopleQuery({ q: "max", product: undefined, sort: "seen" })).toBe("?q=max&sort=seen");
    expect(peopleQuery({})).toBe("");
  });

  it("step 106, part B: blocks every account with a reason, then lifts it; the history shows both", async () => {
    const card = {
      email: "max@acme.de",
      name: "Max Admin",
      accounts: [account("Acme", "workspace"), account("Gamma", "rooms")],
      devices: [],
      lastLogin: null,
      signupBlocked: false,
    };
    api.person.mockResolvedValue(card);
    api.blockPerson.mockResolvedValue({ blocked: 2 });
    render(<OperatorPeople />);
    fireEvent.click(await screen.findByText("Max Admin"));
    const form = (await screen.findByText("Person sperren")).closest("form")!;
    const block = within(form).getByRole("button", { name: "Sperren" });
    expect(block).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("z. B. Spam, Phishing, Missbrauch"), { target: { value: "Spam" } });
    fireEvent.click(screen.getByLabelText("Auch die ganze Domain @acme.de sperren"));
    // After the block: the card again, with the mark, the history and "Sperre aufheben".
    api.person.mockResolvedValue({
      ...card,
      signupBlocked: true,
      accounts: card.accounts.map((a) => ({ ...a, status: "disabled", operatorBlockedAt: "2026-10-31T11:00:00Z", operatorBlockReason: "Spam" })),
    });
    api.actions.mockResolvedValue([{ id: "1", operator: "op@xenaxio.test", action: "person_blocked", email: "max@acme.de", reason: "Spam", details: { scope: "all" }, createdAt: "2026-10-31T11:00:00Z" }]);
    fireEvent.click(block);
    await waitFor(() => expect(api.blockPerson).toHaveBeenCalledWith({ email: "max@acme.de", reason: "Spam", blockSignup: true, blockDomain: true, notify: true }));

    expect(await screen.findByText("Gesperrt: 2 Konto/Konten.")).toBeInTheDocument();
    expect(await screen.findByText(/op@xenaxio\.test/)).toBeInTheDocument();
    expect(screen.getByText(/darf sich nicht registrieren/)).toBeInTheDocument();
    expect(screen.queryByText("Person sperren")).toBeNull();
    api.unblockPerson.mockResolvedValue({ unblocked: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Sperre aufheben" }));
    await waitFor(() => expect(api.unblockPerson).toHaveBeenCalledWith({ email: "max@acme.de" }));
  });

  it("step 106, part B: blocked addresses and domains — list, add, allow again", async () => {
    api.blockedSignups.mockResolvedValue([{ id: "b1", kind: "domain", value: "spam.io", reason: "Spam", createdAt: "2026-10-31T11:00:00Z", createdBy: "op@xenaxio.test" }]);
    api.addBlockedSignup.mockResolvedValue([
      { id: "b2", kind: "email", value: "x@y.de", reason: null, createdAt: "2026-10-31T12:00:00Z", createdBy: "op@xenaxio.test" },
      { id: "b1", kind: "domain", value: "spam.io", reason: "Spam", createdAt: "2026-10-31T11:00:00Z", createdBy: "op@xenaxio.test" },
    ]);
    api.removeBlockedSignup.mockResolvedValue([]);
    render(<OperatorPeople />);
    fireEvent.click(await screen.findByText("Gesperrte Adressen und Domains"));
    expect(await screen.findByText("@spam.io")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Adresse oder Domain"), { target: { value: "x@y.de" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Sperren" }).at(-1)!);
    await waitFor(() => expect(api.addBlockedSignup).toHaveBeenCalledWith("email", "x@y.de", undefined));
    expect(await screen.findByText("x@y.de")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Erlauben" })[0]!);
    await waitFor(() => expect(api.removeBlockedSignup).toHaveBeenCalledWith("b2"));
    expect(await screen.findByText("Keine gesperrten Adressen.")).toBeInTheDocument();
  });
});
