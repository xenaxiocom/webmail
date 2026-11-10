import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Step 129 G: the admin installs an industry package, hands out its rights and chooses its model.
const api = vi.hoisted(() => ({ list: vi.fn(), install: vi.fn(), remove: vi.fn(), setGrants: vi.fn(), setModel: vi.fn() }));
vi.mock("@/lib/xenaxio/packages", () => ({ packagesApi: api }));
vi.mock("@/lib/browser-navigation", () => ({ apiFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ groups: [{ id: "g1", name: "Kapitäne" }] }) }) }));
vi.mock("@/components/ui/confirm-dialog", () => ({ ConfirmDialog: () => null }));
vi.mock("@/components/xenaxio/projects/bits", () => ({ PeoplePicker: () => null }));
vi.mock("next-intl", async (orig) => ({ ...(await orig<typeof import("next-intl")>()), useLocale: () => "en" }));

import { PackagesAdmin } from "../packages-admin";

const t = (s: string) => ({ de: s, en: s });
const pkg = (installed: boolean) => ({
  key: "maritime",
  version: "0.1.0",
  name: t("Xenaxio Maritime"),
  description: t("Stability and loading"),
  rights: [{ key: "board", name: t("Board access") }],
  types: ["vessel"],
  web: true,
  tools: true,
  models: true,
  installed,
  installedAt: installed ? "2026-11-09T10:00:00Z" : null,
  grants: {},
  model: { mode: "company" as const },
});

describe("PackagesAdmin", () => {
  it("installs a package, then hands a right to a group and saves", async () => {
    api.list.mockResolvedValueOnce({ packages: [pkg(false)] }).mockResolvedValue({ packages: [pkg(true)] });
    api.install.mockResolvedValue(pkg(true));
    api.setGrants.mockResolvedValue(pkg(true));
    render(<PackagesAdmin />);
    expect(await screen.findByText("Brings: vessel")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    await waitFor(() => expect(api.install).toHaveBeenCalledWith("maritime"));
    expect(await screen.findByText("Board access")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open app" }).getAttribute("href")).toBe("/maritime/");
    fireEvent.click(await screen.findByRole("checkbox", { name: "Kapitäne" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]!);
    await waitFor(() => expect(api.setGrants).toHaveBeenCalledWith("maritime", { board: { groups: ["g1"] } }));
  });

  it("an own model needs an address and a model name before it can be checked and saved", async () => {
    api.list.mockResolvedValue({ packages: [pkg(true)] });
    api.setModel.mockResolvedValue(pkg(true));
    render(<PackagesAdmin />);
    fireEvent.click(await screen.findByRole("radio", { name: "Own model for this package" }));
    const save = screen.getAllByRole("button", { name: "Save" }).at(-1)!;
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Address (OpenAI-compatible)" }), { target: { value: "https://llm.example/v1" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Model" }), { target: { value: "pixtral" } });
    fireEvent.click(save);
    await waitFor(() => expect(api.setModel).toHaveBeenCalledWith("maritime", { mode: "own", baseUrl: "https://llm.example/v1", model: "pixtral" }));
  });
});
