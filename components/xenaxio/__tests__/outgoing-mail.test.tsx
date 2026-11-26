import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translate } from "@/lib/xenaxio/i18n";
import type { OutgoingEntry, OutgoingFilter } from "@/lib/xenaxio/api";

const mocks = vi.hoisted(() => ({
  outgoing: vi.fn(),
  users: vi.fn(),
  saved: [] as Record<string, unknown>[],
  stored: {} as Record<string, unknown>,
}));

vi.mock("next-intl", () => ({ useLocale: () => "de" }));
vi.mock("@/lib/xenaxio/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/xenaxio/api")>()),
  xenaxio: { outgoing: mocks.outgoing, users: mocks.users },
}));
// The view is kept on the platform (rule 10): here, what the page saves is recorded.
vi.mock("@/lib/xenaxio/view-prefs", () => ({
  useViewPrefs: <T,>(_place: string, parse: (raw: Record<string, unknown>) => T) => {
    const [raw, setRaw] = useState<Record<string, unknown>>(mocks.stored);
    return [
      parse(raw),
      (change: Record<string, unknown>) => {
        mocks.saved.push(change);
        setRaw((r) => ({ ...r, ...change }));
      },
    ] as const;
  },
}));

import { OutgoingMailView, parseOutgoingFilter } from "../outgoing-mail";

const entries: OutgoingEntry[] = [
  {
    id: "1",
    at: "2026-11-26T10:00:01.000Z",
    sender: "info@acme.de",
    login: "lea@acme.de",
    user: { id: "u-lea", name: "Lea Lang", email: "lea@acme.de" },
    channel: "smtp",
    size: 1200,
    recipients: [
      { address: "kunde@example.com", state: "delivered", reply: "250 OK" },
      { address: "x@gone.de", state: "failed", reply: "550 5.1.1 User unknown", reason: "no_mailbox" },
    ],
  },
  { id: "2", at: "2026-11-26T12:00:00.000Z", sender: "info@acme.de", login: null, user: null, channel: "xenaxio", size: null, recipients: [{ address: "kunde@example.com", state: "pending" }] },
];

describe("OutgoingMailView (step 153)", () => {
  beforeEach(() => {
    mocks.saved.length = 0;
    mocks.stored = {};
    mocks.outgoing.mockReset().mockResolvedValue({ entries, next: null });
    mocks.users.mockReset().mockResolvedValue({ users: [{ id: "u-lea", email: "lea@acme.de", displayName: "Lea Lang" }] });
  });

  it("shows who sent what from which address over which channel, and each recipient's delivery", async () => {
    render(<OutgoingMailView />);
    expect(await screen.findByText("Anmeldung: lea@acme.de")).toBeTruthy();
    // In the table and in the person filter.
    expect(screen.getAllByText("Lea Lang")).toHaveLength(2);
    expect(screen.getAllByText("info@acme.de")).toHaveLength(2);
    // In the table and in the channel filter.
    expect(screen.getAllByText("SMTP (Programm oder Skript)")).toHaveLength(2);
    expect(screen.getByText("Gemeinsames Postfach")).toBeTruthy();
    expect(screen.getAllByText("Xenaxio (Web, Assistent, MCP, Flows)").length).toBeGreaterThan(0);
    expect(screen.getByText("zugestellt")).toBeTruthy();
    expect(screen.getByText("nicht zugestellt")).toBeTruthy();
    expect(screen.getByText("Dieses Postfach gibt es nicht. Bitte prüfen Sie die Adresse.")).toBeTruthy();
    expect(screen.getByText(/ohne Betreff und Inhalt/)).toBeTruthy();
    expect(mocks.outgoing).toHaveBeenCalledWith({});
  });

  it("keeps the applied filter on the platform and loads with it", async () => {
    render(<OutgoingMailView />);
    await screen.findByText("Anmeldung: lea@acme.de");
    fireEvent.change(screen.getByPlaceholderText("example.com"), { target: { value: " gone.de " } });
    fireEvent.change(screen.getByLabelText("Weg"), { target: { value: "smtp" } });
    fireEvent.click(screen.getByText("Filtern"));
    await waitFor(() => expect(mocks.outgoing).toHaveBeenLastCalledWith({ recipient: "gone.de", channel: "smtp" }));
    expect(mocks.saved).toEqual([{ filter: { recipient: "gone.de", channel: "smtp" } }]);
    expect(screen.getByText("Als CSV herunterladen").getAttribute("href")).toContain("/api/admin/outgoing.csv?recipient=gone.de&channel=smtp");
    fireEvent.click(screen.getByText("Filter zurücksetzen"));
    await waitFor(() => expect(mocks.outgoing).toHaveBeenLastCalledWith({}));
  });

  it("opens with the filter saved before", async () => {
    mocks.stored = { filter: { status: "failed", from: "2026-11-01", bogus: 1 } };
    render(<OutgoingMailView />);
    await waitFor(() => expect(mocks.outgoing).toHaveBeenCalledWith({ status: "failed", from: "2026-11-01" }));
    expect((screen.getByLabelText("Zustellung") as HTMLSelectElement).value).toBe("failed");
  });

  it("drops unknown or broken stored values", () => {
    const f: OutgoingFilter = parseOutgoingFilter({ channel: "fax", status: "lost", from: "gestern", to: "2026-11-30", sender: "  ", userId: "u1" });
    expect(f).toEqual({ to: "2026-11-30", userId: "u1" });
  });

  it("has every text in German and English", () => {
    const keys = ["title", "filter_person", "filter_sender", "filter_recipient", "filter_channel", "filter_status", "filter_from", "filter_to", "all", "apply", "reset", "csv", "empty", "more", "col_time", "col_person", "col_sender", "col_channel", "col_recipients", "person_unknown", "channel_smtp", "channel_xenaxio", "status_failed", "status_deferred", "status_pending", "status_delivered", "state_delivered", "state_deferred", "state_failed", "state_pending", "note"];
    for (const locale of ["de", "en"]) {
      for (const key of keys) expect(translate(locale, `outgoing.${key}`), `${locale} ${key}`).not.toBe(`outgoing.${key}`);
      expect(translate(locale, "workspace.outgoing")).not.toBe("workspace.outgoing");
      expect(translate(locale, "workspace.outgoing_desc")).not.toBe("workspace.outgoing_desc");
    }
  });
});
