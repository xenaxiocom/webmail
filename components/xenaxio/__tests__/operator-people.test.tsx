import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Step 106, part A: every person in the operator console.
const api = vi.hoisted(() => ({ peopleSummary: vi.fn(), people: vi.fn(), person: vi.fn() }));
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
});
