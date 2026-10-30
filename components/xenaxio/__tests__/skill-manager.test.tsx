import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SkillManager } from "../skill-manager";
import { ModelProfiles } from "../model-profiles";
import { type SkillApi, type SkillItem, XenaxioApiError } from "@/lib/xenaxio/api";

vi.mock("next-intl", () => ({ useLocale: () => "de" }));
const saveModelProfiles = vi.fn(async (map: Record<string, string | null>) => ({ map }));
vi.mock("@/lib/xenaxio/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/xenaxio/api")>()),
  xenaxio: { saveModelProfiles: (m: never) => saveModelProfiles(m) },
}));

const skill: SkillItem = { id: "s1", name: "angebot", description: "Angebote nach unserem Muster", enabled: true, version: 2, updatedAt: "2026-10-30T10:00:00Z" };

function fakeApi(): SkillApi {
  return {
    base: "/api/ai/skills",
    get: vi.fn(async () => ({ skill: { ...skill, body: "Gültigkeit 30 Tage." } })),
    create: vi.fn(async () => ({ skill })),
    update: vi.fn(async () => ({ skill })),
    setEnabled: vi.fn(async () => ({ skill })),
    remove: vi.fn(async () => ({ ok: true as const })),
    versions: vi.fn(async () => ({ versions: [{ version: 2, name: "angebot", description: "d", createdAt: "2026-10-30T10:00:00Z" }, { version: 1, name: "angebot", description: "d", createdAt: "2026-10-29T10:00:00Z" }] })),
    restore: vi.fn(async () => ({ skill })),
    fileUrl: (id: string) => `/api/ai/skills/${id}/file`,
  } as never;
}

describe("SkillManager (step 84)", () => {
  it("writes a new skill and names the field the server refuses", async () => {
    const api = fakeApi();
    vi.mocked(api.create).mockRejectedValueOnce(new XenaxioApiError(400, "skill_invalid", { reason: "description: at most 300 characters" }));
    const onChanged = vi.fn(async () => {});
    render(<SkillManager api={api} skills={[]} max={20} onChanged={onChanged} />);
    expect(screen.getByText("Noch keine Fähigkeiten.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Neue Fähigkeit" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Protokoll" } });
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("protokoll");
    fireEvent.change(screen.getByLabelText("Wann verwenden"), { target: { value: "Protokolle" } });
    fireEvent.change(screen.getByLabelText("Anleitung"), { target: { value: "In Stichpunkten." } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText(/höchstens 300 Zeichen, wann die Fähigkeit passt/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(api.create).toHaveBeenLastCalledWith({ name: "protokoll", description: "Protokolle", body: "In Stichpunkten." }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(screen.queryByLabelText("Anleitung")).toBeNull();
  });

  it("edits with the stored text, switches off, offers the file, restores an older version", async () => {
    const api = fakeApi();
    const onChanged = vi.fn(async () => {});
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SkillManager api={api} skills={[skill]} max={20} onChanged={onChanged} />);
    expect(screen.getByRole("link", { name: "SKILL.md" }).getAttribute("href")).toContain("/api/ai/skills/s1/file");

    fireEvent.click(screen.getByRole("button", { name: "Ändern" }));
    expect(((await screen.findByLabelText("Anleitung")) as HTMLTextAreaElement).value).toBe("Gültigkeit 30 Tage.");
    fireEvent.change(screen.getByLabelText("Anleitung"), { target: { value: "Gültigkeit 14 Tage." } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith("s1", { name: "angebot", description: "Angebote nach unserem Muster", body: "Gültigkeit 14 Tage." }));

    fireEvent.click(screen.getByRole("button", { name: "Ausschalten" }));
    await waitFor(() => expect(api.setEnabled).toHaveBeenCalledWith("s1", false));

    const history = screen.getByText("Versionen (aktuell 2)").closest("details")!;
    history.open = true;
    fireEvent(history, new Event("toggle"));
    fireEvent.click(await screen.findByRole("button", { name: "Wiederherstellen" }));
    await waitFor(() => expect(api.restore).toHaveBeenCalledWith("s1", 1));
  });

  it("stops at the limit", () => {
    render(<SkillManager api={fakeApi()} skills={[skill]} max={1} onChanged={async () => {}} />);
    expect((screen.getByRole("button", { name: "Neue Fähigkeit" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Es sind bereits 1 Fähigkeiten gespeichert.")).toBeTruthy();
  });
});

describe("ModelProfiles (step 84)", () => {
  it("maps a profile to a model and back to the company's model", async () => {
    const onSaved = vi.fn(async () => {});
    render(<ModelProfiles value={{ map: { smart: "mistral-medium-latest" }, options: ["mistral-small-2603", "mistral-medium-latest"], names: ["fast", "vision", "smart"] }} companyModel="mistral-small-2603" onSaved={onSaved} />);
    const fast = screen.getByLabelText("Schnell") as HTMLSelectElement;
    expect(fast.value).toBe("");
    expect(screen.getAllByRole("option", { name: "Modell des Unternehmens (mistral-small-2603)" })).toHaveLength(3);
    fireEvent.change(fast, { target: { value: "mistral-small-2603" } });
    await waitFor(() => expect(saveModelProfiles).toHaveBeenLastCalledWith({ fast: "mistral-small-2603" }));
    fireEvent.change(screen.getByLabelText("Gründlich"), { target: { value: "" } });
    await waitFor(() => expect(saveModelProfiles).toHaveBeenLastCalledWith({ smart: null }));
    expect(onSaved).toHaveBeenCalledTimes(2);
  });
});
