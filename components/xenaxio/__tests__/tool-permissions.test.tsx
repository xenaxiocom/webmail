import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolCeilingPage, ToolPermission, ToolPermissionPage } from "@/lib/xenaxio/api";
import de from "@/lib/xenaxio/messages-de.json";
import en from "@/lib/xenaxio/messages-en.json";

vi.mock("next-intl", () => ({ useLocale: () => "de" }));

const tool = (p: Partial<ToolPermission> & Pick<ToolPermission, "name" | "group" | "kind">): ToolPermission => ({
  where: "both",
  choices: p.kind === "read" ? ["allow", "deny"] : ["allow", "ask", "deny"],
  defaultLevel: p.kind === "write-confirm" ? "ask" : "allow",
  choice: null,
  ceiling: null,
  level: p.kind === "write-confirm" ? "ask" : "allow",
  ...p,
});

const page: ToolPermissionPage = {
  groups: ["mail", "calendar", "memory", "other"],
  externalConfirm: "client",
  tools: [
    tool({ name: "search_mail", group: "mail", kind: "read" }),
    tool({ name: "create_draft", group: "mail", kind: "write-safe" }),
    tool({ name: "create_event", group: "calendar", kind: "write-confirm", ceiling: "ask", choice: "allow" }),
    tool({ name: "remember", group: "memory", kind: "write-confirm", where: "panel" }),
  ],
};
const ceilings: ToolCeilingPage = {
  groups: ["mail", "calendar"],
  tools: [
    { name: "search_mail", kind: "read", where: "both", group: "mail" },
    { name: "create_event", kind: "write-confirm", where: "both", group: "calendar" },
  ],
  ceilings: [{ scope: "group:calendar", level: "ask" }],
};

const api = vi.hoisted(() => ({
  toolPermissions: vi.fn(),
  setToolPermission: vi.fn(),
  setExternalConfirm: vi.fn(),
  resetToolPermissions: vi.fn(),
  toolCeilings: vi.fn(),
  setToolCeiling: vi.fn(),
}));
vi.mock("@/lib/xenaxio/api", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/api")>()), xenaxio: api }));

const { ToolCeilings, ToolPermissions } = await import("../tool-permissions");

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.toolPermissions.mockResolvedValue(page);
  api.setToolPermission.mockResolvedValue(page);
  api.setExternalConfirm.mockResolvedValue({ ...page, externalConfirm: "app" });
  api.toolCeilings.mockResolvedValue(ceilings);
  api.setToolCeiling.mockResolvedValue(ceilings);
});

describe("ToolPermissions (step 85)", () => {
  it("shows the tools by group with their level; reading tools have no ask", async () => {
    render(<ToolPermissions />);
    const search = await screen.findByRole("group", { name: "E-Mails durchsuchen" });
    expect(within(search).getAllByRole("button").map((b) => b.textContent)).toEqual(["Ausführen", "Verboten"]);
    expect(within(search).getByRole("button", { name: "Ausführen" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Kalender")).toBeTruthy();
    expect(screen.getByText("nur im Assistenten")).toBeTruthy();
  });

  it("stores a choice; going back to the default resets it", async () => {
    render(<ToolPermissions />);
    const draft = await screen.findByRole("group", { name: "Entwurf speichern" });
    fireEvent.click(within(draft).getByRole("button", { name: "Nachfragen" }));
    await waitFor(() => expect(api.setToolPermission).toHaveBeenLastCalledWith("create_draft", "ask"));
    const remember = screen.getByRole("group", { name: "Notiz merken" });
    fireEvent.click(within(remember).getByRole("button", { name: "Verboten" }));
    await waitFor(() => expect(api.setToolPermission).toHaveBeenLastCalledWith("remember", "deny"));
  });

  it("the company's limit: looser choices are locked and the limit is named", async () => {
    render(<ToolPermissions />);
    const event = await screen.findByRole("group", { name: "Termin anlegen und einladen" });
    expect((within(event).getByRole("button", { name: "Ausführen" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(event).getByRole("button", { name: "Verboten" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("Ihre Firma erlaubt höchstens: Nachfragen")).toBeTruthy();
  });

  it("chooses who confirms for connected AI chats", async () => {
    render(<ToolPermissions />);
    fireEvent.click(await screen.findByLabelText(/In Xenaxio/));
    await waitFor(() => expect(api.setExternalConfirm).toHaveBeenCalledWith("app"));
  });
});

describe("ToolCeilings (step 85)", () => {
  it("sets the company's limit per group, without ask for reading tools", async () => {
    render(<ToolCeilings />);
    const calendar = await screen.findByRole("group", { name: "Kalender" });
    expect(within(calendar).getByRole("button", { name: "Höchstens nachfragen" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(calendar).getByRole("button", { name: "Keine Grenze" }));
    await waitFor(() => expect(api.setToolCeiling).toHaveBeenLastCalledWith("group:calendar", null));
    const search = screen.getByRole("group", { name: "E-Mails durchsuchen" });
    expect(within(search).getAllByRole("button").map((b) => b.textContent)).toEqual(["Keine Grenze", "Verboten"]);
  });
});

describe("texts (step 85)", () => {
  it("German and English name the same tools and groups", () => {
    expect(Object.keys(de.permissions.tool).sort()).toEqual(Object.keys(en.permissions.tool).sort());
    expect(Object.keys(de.permissions.group).sort()).toEqual(Object.keys(en.permissions.group).sort());
  });
});
