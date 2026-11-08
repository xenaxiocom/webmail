import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Step 126: formula and rule editors with the platform's live check; computed values read only.
const api = vi.hoisted(() => ({ checkExpression: vi.fn(), setRules: vi.fn() }));
vi.mock("@/lib/xenaxio/projects", async (orig) => {
  const real = await orig<typeof import("@/lib/xenaxio/projects")>();
  return { ...real, projectsApi: { ...real.projectsApi, ...api } };
});
vi.mock("next-intl", async (orig) => ({ ...(await orig<typeof import("next-intl")>()), useLocale: () => "en" }));

import type { ObjectType, TypeField } from "@/lib/xenaxio/projects";
import { FormulaEditor, RulesEditor } from "../projects/computed";
import { FieldInput, fieldText } from "../projects/fields";

const t = (s: string) => ({ de: s, en: s });
const type = {
  key: "deal",
  fields: [
    { key: "amount", type: "money", label: t("Amount") },
    { key: "iban", type: "text", label: t("IBAN"), sensitive: true },
  ],
  rules: [],
} as unknown as ObjectType;

describe("FormulaEditor", () => {
  it("checks the expression while typing and shows an example or the error; field names are one click away", async () => {
    api.checkExpression.mockResolvedValueOnce({ ok: false, error: 'unknown name "nope"' });
    const onChange = vi.fn();
    const { rerender } = render(<FormulaEditor type={type} fieldKey={null} value={{ expr: "nope", result: "number" }} onChange={onChange} />);
    expect(await screen.findByText('Error: unknown name "nope"', {}, { timeout: 2000 })).toBeTruthy();
    expect(api.checkExpression).toHaveBeenCalledWith("deal", { kind: "formula", expr: "nope", result: "number" });
    // Sensitive fields are not offered.
    expect(screen.queryByRole("button", { name: "iban" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "amount" }));
    expect(onChange).toHaveBeenCalledWith({ expr: "nope amount", result: "number" });
    api.checkExpression.mockResolvedValueOnce({ ok: true, example: 6000 });
    rerender(<FormulaEditor type={type} fieldKey={null} value={{ expr: "amount * 0.6", result: "number" }} onChange={onChange} />);
    expect(await screen.findByText(/Example \(newest record\): 6000/, {}, { timeout: 2000 })).toBeTruthy();
  });
});

describe("RulesEditor", () => {
  it("adds a rule with its messages and saves the list", async () => {
    api.checkExpression.mockResolvedValue({ ok: true, example: false });
    api.setRules.mockResolvedValue({ ...type, rules: [] });
    const onSaved = vi.fn();
    render(<RulesEditor type={type} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Error when" }), { target: { value: "amount > 1000" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Message (English)" }), { target: { value: "Too much" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.setRules).toHaveBeenCalled());
    expect(api.setRules.mock.calls[0]![1]).toEqual([expect.objectContaining({ when: "amount > 1000", message: { de: "", en: "Too much" } })]);
  });
});

describe("computed values", () => {
  const weighted = { key: "weighted", type: "formula", label: t("Weighted"), formula: { expr: "amount * 0.5", result: "money", currency: "EUR" } } as TypeField;
  it("read like their result and are never inputs", () => {
    expect(fieldText(weighted, { amount: 5, currency: "EUR" }, "en")).toBe("€5.00");
    expect(fieldText({ key: "n", type: "rollup", label: t("N"), rollup: { from: "d", via: "c", op: "count" } } as TypeField, 3, "en")).toBe("3");
    render(<FieldInput field={weighted} value={{ amount: 5, currency: "EUR" }} onSave={vi.fn()} />);
    expect(screen.getByText("€5.00").tagName).toBe("P");
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
