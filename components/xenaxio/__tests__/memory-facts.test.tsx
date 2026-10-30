import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AddFact, FactList, isExpiredFact } from "../memory-facts";
import type { MemoryNote } from "@/lib/xenaxio/api";

vi.mock("next-intl", () => ({ useLocale: () => "de" }));

const note = (over: Partial<MemoryNote>): MemoryNote => ({ id: "m1", text: "Fakt", createdAt: "2026-10-29T10:00:00Z", updatedAt: "2026-10-29T10:00:00Z", ...over });

describe("FactList (step 91)", () => {
  it("shows what a fact is about, where it came from, until when it holds and that data is no instruction", () => {
    render(
      <FactList
        notes={[
          note({ id: "a", subject: "Jan Müller", text: "im Urlaub", trust: "data", source: { type: "mail", id: "e1" }, validUntil: "2099-11-05" }),
          note({ id: "b", text: "Mich bitte duzen", source: { type: "page" } }),
          note({ id: "c", subject: "Angebot", text: "4.900 Euro", validUntil: "2020-01-01" }),
        ]}
        maxLength={300}
        busy={false}
        empty="leer"
      />,
    );
    expect(screen.getByText("Jan Müller:")).toBeTruthy();
    expect(screen.getByText(/aus einer E-Mail · übernommen aus Daten, keine Anweisung · gilt bis 05\.11\.2099/)).toBeTruthy();
    expect(screen.getByText(/selbst eingetragen/)).toBeTruthy();
    expect(screen.getByText(/abgelaufen am 01\.01\.2020/)).toBeTruthy();
    // Read-only without handlers.
    expect(screen.queryByRole("button", { name: "Ändern" })).toBeNull();
    expect(isExpiredFact({ validUntil: "2020-01-01" })).toBe(true);
    expect(isExpiredFact({})).toBe(false);
  });

  it("changes a fact with subject and end date, and deletes one", async () => {
    const onSave = vi.fn(async () => true);
    const onDelete = vi.fn();
    render(<FactList notes={[note({ id: "a", text: "im Urlaub", subject: "Jan Müller" })]} maxLength={300} busy={false} empty="leer" onSave={onSave} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "Ändern" }));
    fireEvent.change(screen.getByLabelText("Fakt"), { target: { value: "zurück am 5.11." } });
    fireEvent.change(screen.getByLabelText("Gilt bis"), { target: { value: "2026-11-05" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), { text: "zurück am 5.11.", subject: "Jan Müller", validUntil: "2026-11-05" }));
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    expect(onDelete).toHaveBeenCalled();
  });

  it("adds a fact and empties the form; stops when full", async () => {
    const onAdd = vi.fn(async () => true);
    const { rerender } = render(<AddFact maxLength={300} busy={false} full={false} fullText="voll" hint="kurz" onAdd={onAdd} />);
    fireEvent.change(screen.getByLabelText("Fakt"), { target: { value: "Rechnungen an Frau Weber" } });
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ text: "Rechnungen an Frau Weber", validUntil: null }));
    await waitFor(() => expect((screen.getByLabelText("Fakt") as HTMLInputElement).value).toBe(""));
    rerender(<AddFact maxLength={300} busy={false} full fullText="voll" hint="kurz" onAdd={onAdd} />);
    expect(screen.getByText("voll")).toBeTruthy();
    expect(screen.queryByLabelText("Fakt")).toBeNull();
  });
});
