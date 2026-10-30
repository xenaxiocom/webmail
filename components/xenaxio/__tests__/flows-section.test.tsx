import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Step F1.1: the Flows section of an employee — create a flow from a template
// with its own name and language, then give it people of the company.
vi.mock("next-intl", () => ({ useLocale: () => "de" }));
const flows = vi.hoisted(() => ({
  status: vi.fn(),
  overview: vi.fn(),
  install: vi.fn(),
  flow: vi.fn(),
  addPerson: vi.fn(),
  runs: vi.fn(),
}));
vi.mock("@/lib/xenaxio/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/xenaxio/api")>()),
  xenaxio: { flows },
}));

import { type FlowDetail, type FlowsOverview, XenaxioApiError } from "@/lib/xenaxio/api";
import { FlowsSection } from "../flows/flows-app";

const overview = (patch: Partial<FlowsOverview> = {}): FlowsOverview => ({
  enabled: true,
  admin: false,
  templates: [
    {
      flow: "procurement",
      version: 1,
      title: { de: "Einkauf", en: "Procurement" },
      description: { de: "Anfrage per Telegram, Brief an Lieferanten", en: "Request in Telegram" },
      params: {},
      directories: {},
    },
  ],
  installations: [],
  employees: [
    { id: "u1", name: "Olena", email: "olena@bau.ua" },
    { id: "u2", name: "Ivan", email: "ivan@bau.ua" },
  ],
  mailboxes: [{ id: "m1", email: "zakupky@bau.ua" }],
  ...patch,
});

const detail = (patch: Partial<FlowDetail> = {}): FlowDetail => ({
  id: "f1",
  flow: "procurement",
  version: 1,
  title: "Einkauf Sihiv",
  templateTitle: { de: "Einkauf" },
  params: {},
  paramDefs: {
    supplier_mailbox: { type: "mailbox", required: true, label: { de: "Postfach für Lieferanten" } },
    buyer: { type: "person", required: true, label: { de: "Einkäufer" } },
  },
  directories: {},
  language: "uk",
  status: "paused",
  sendsPerHour: 200,
  botName: null,
  hasBot: false,
  createdAt: "2026-10-30T10:00:00Z",
  owners: [{ id: "u1", name: "Olena", email: "olena@bau.ua" }],
  people: [],
  ...patch,
});

describe("Flows section (step F1.1)", () => {
  it("creates a flow with its own name and language and adds people of the company", async () => {
    flows.overview.mockResolvedValueOnce(overview());
    render(<FlowsSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Neuer Flow" }));
    fireEvent.change(screen.getByLabelText("Name des Flows"), { target: { value: "Einkauf Sihiv" } });
    fireEvent.change(screen.getByLabelText("Sprache der Texte"), { target: { value: "uk" } });
    flows.install.mockResolvedValueOnce(detail());
    flows.overview.mockResolvedValue(overview({ installations: [detail()] }));
    flows.flow.mockResolvedValue(detail());
    flows.runs.mockResolvedValue({ runs: [] });
    fireEvent.click(screen.getByRole("button", { name: "Anlegen" }));
    await waitFor(() => expect(flows.install).toHaveBeenCalledWith("procurement", "uk", "Einkauf Sihiv"));
    expect(await screen.findByText(/Angelegt: Einkauf Sihiv/)).toBeTruthy();

    // The new flow is open: its people, its owners; the mailbox list holds only what Olena may send from.
    expect(await screen.findByText("Besitzer")).toBeTruthy();
    expect(screen.getByText("Zuerst Personen zu diesem Flow hinzufügen.")).toBeTruthy();
    const mailbox = screen.getByLabelText("Postfach für Lieferanten *") as HTMLSelectElement;
    expect([...mailbox.options].map((o) => o.textContent)).toEqual(["— wählen —", "zakupky@bau.ua"]);

    flows.addPerson.mockResolvedValueOnce({ id: "p1", name: "Olena", language: "uk", userId: "u1", linked: false });
    flows.flow.mockResolvedValue(detail({ people: [{ id: "p1", name: "Olena", language: "uk", userId: "u1", linked: false }] }));
    fireEvent.change(screen.getByLabelText("Aus Ihrer Firma"), { target: { value: "u1" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Hinzufügen" })[0]!);
    await waitFor(() => expect(flows.addPerson).toHaveBeenCalledWith("f1", { userId: "u1", language: "uk" }));
    expect(await screen.findByText("Noch nicht verbunden")).toBeTruthy();
  });

  it("says when the company has no flows", async () => {
    flows.overview.mockRejectedValueOnce(new XenaxioApiError(403, "flows_disabled"));
    render(<FlowsSection />);
    expect(await screen.findByText(/noch nicht freigeschaltet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Neuer Flow" })).toBeNull();
  });
});
