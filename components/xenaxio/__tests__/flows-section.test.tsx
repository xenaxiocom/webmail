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
  setConnection: vi.fn(),
  removeConnection: vi.fn(),
  tasks: vi.fn(async () => ({ tasks: [] as FlowTask[], count: 0 })),
  answerTask: vi.fn(),
  run: vi.fn(),
  fileUrl: vi.fn((runId: string, n: number) => `/api/flows/runs/${runId}/files/${n}`),
  sendAs: vi.fn(async () => ({ on: false, expiresAt: null })),
  setSendAs: vi.fn(async (on: boolean) => ({ on, expiresAt: on ? "2027-01-28T00:00:00Z" : null })),
}));
vi.mock("@/lib/xenaxio/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/xenaxio/api")>()),
  xenaxio: { flows },
}));

import { type FlowDetail, type FlowsOverview, type FlowTask, XenaxioApiError } from "@/lib/xenaxio/api";
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
  connections: [],
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

  it("lets the employee allow letters in their name and take it back (stage E2)", async () => {
    flows.overview.mockResolvedValueOnce(overview());
    render(<FlowsSection />);
    const box = (await screen.findByLabelText(/Flows dürfen in meinem Namen handeln/)) as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    await waitFor(() => expect(flows.setSendAs).toHaveBeenCalledWith(true));
    expect(await screen.findByText("Flows dürfen jetzt in Ihrem Namen handeln.")).toBeTruthy();
    expect(box.checked).toBe(true);
  });

  it("sets a connection's address and key; the key is sent once and never shown (stage E2, B1)", async () => {
    const conn = { name: "crm", label: { de: "CRM" }, note: null, hosts: ["api.crm.example"], kind: "http" as const, auth: "bearer" as const, baseUrl: null, hasSecret: false };
    flows.overview.mockResolvedValueOnce(overview({ installations: [detail()] }));
    flows.flow.mockResolvedValue(detail({ connections: [conn] }));
    flows.runs.mockResolvedValue({ runs: [] });
    flows.setConnection.mockResolvedValueOnce(detail({ connections: [{ ...conn, baseUrl: "https://api.crm.example", hasSecret: true }] }));
    render(<FlowsSection />);
    fireEvent.click(await screen.findByText("Einkauf Sihiv"));
    expect(await screen.findByText("Verbindungen")).toBeTruthy();
    expect(screen.getByText("Noch nicht eingerichtet")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Adresse"), { target: { value: "https://api.crm.example" } });
    fireEvent.change(screen.getByLabelText("Token"), { target: { value: "secret-token" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Speichern" }).at(-1)!);
    await waitFor(() => expect(flows.setConnection).toHaveBeenCalledWith("f1", "crm", { baseUrl: "https://api.crm.example", secret: { token: "secret-token" } }));
    expect(await screen.findByText("Eingerichtet")).toBeTruthy();
    expect((screen.getByLabelText("Token") as HTMLInputElement).value).toBe("");
  });

  it("shows decisions waiting for me and answers them like Telegram buttons (stage E2, part C)", async () => {
    const task = (patch: Partial<FlowTask> = {}): FlowTask => ({
      key: "k1",
      flowId: "f9",
      flowTitle: "Einkauf Lviv",
      runId: "r1",
      runNumber: "1-1",
      kind: "decide",
      title: "Entscheidung nötig",
      text: "Rechnung 1187",
      show: { total: 8400 },
      options: [
        { id: "approve", label: "Freigeben", comment: false },
        { id: "question", label: "Rückfrage", comment: true },
      ],
      askedAt: "2026-10-30T10:00:00Z",
      ...patch,
    });
    flows.overview.mockResolvedValueOnce(overview({ working: [{ id: "f9", flow: "procurement", title: "Einkauf Lviv", status: "active" }] }));
    flows.tasks.mockResolvedValueOnce({ tasks: [task(), task({ key: "k2", runNumber: "2-1" })], count: 2 });
    render(<FlowsSection />);
    expect(await screen.findByText("Wartet auf mich (2)")).toBeTruthy();
    expect(screen.getByText("Flows, in denen ich mitarbeite")).toBeTruthy();
    expect(screen.getAllByText("8400")).toHaveLength(2);

    // A question back needs a comment first.
    fireEvent.click(screen.getAllByRole("button", { name: "Rückfrage" })[0]!);
    const send = screen.getByRole("button", { name: "Senden" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Ihr Kommentar"), { target: { value: "Warum teurer?" } });
    flows.answerTask.mockResolvedValueOnce({ ok: true });
    flows.tasks.mockResolvedValueOnce({ tasks: [task({ key: "k2", runNumber: "2-1" })], count: 1 });
    fireEvent.click(send);
    await waitFor(() => expect(flows.answerTask).toHaveBeenCalledWith("k1", "question", "Warum teurer?"));
    expect(await screen.findByText("Beantwortet: Nr. 1-1.")).toBeTruthy();
    expect(await screen.findByText("Wartet auf mich (1)")).toBeTruthy();

    // Someone else answered first: "already decided".
    flows.answerTask.mockRejectedValueOnce(new XenaxioApiError(409, "flow_task_closed"));
    flows.tasks.mockResolvedValueOnce({ tasks: [], count: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Freigeben" }));
    await waitFor(() => expect(flows.answerTask).toHaveBeenCalledWith("k2", "approve", undefined));
    expect(await screen.findByText(/Schon entschieden/)).toBeTruthy();
    expect(await screen.findByText("Nichts wartet auf Ihre Entscheidung.")).toBeTruthy();
  });

  it("says when the company has no flows", async () => {
    flows.overview.mockRejectedValueOnce(new XenaxioApiError(403, "flows_disabled"));
    render(<FlowsSection />);
    expect(await screen.findByText(/noch nicht freigeschaltet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Neuer Flow" })).toBeNull();
  });
});
