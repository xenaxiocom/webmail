import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnswerSettings } from "../answer-settings";
import { CustomModelList } from "../custom-model-list";
import type { AnswerSettings as Settings, CustomModel } from "@/lib/xenaxio/api";

vi.mock("next-intl", () => ({ useLocale: () => "de" }));
const saveAnswerSettings = vi.fn(async (s: { maxToolCalls: number | null; inputTokens: number | null }) => s);
const setCustomModelContext = vi.fn(async () => ({}));
vi.mock("@/lib/xenaxio/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/xenaxio/api")>()),
  xenaxio: { saveAnswerSettings: (s: never) => saveAnswerSettings(s), setCustomModelContext: (n: never) => setCustomModelContext(n) },
}));

const value: Settings = {
  engine: "xenacore",
  maxToolCalls: null,
  inputTokens: null,
  defaults: { toolCalls: 20, inputTokens: 150_000 },
  caps: { toolCalls: { min: 1, max: 30 }, inputTokens: { min: 20_000, max: 500_000 } },
};

describe("AnswerSettings (step 83)", () => {
  it("starts at the defaults and stores a change, the default as none", async () => {
    const onSaved = vi.fn(async () => {});
    render(<AnswerSettings value={value} onSaved={onSaved} />);
    const steps = screen.getByLabelText("Schritte pro Antwort") as HTMLInputElement;
    expect(steps.value).toBe("20");
    fireEvent.change(steps, { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(saveAnswerSettings).toHaveBeenLastCalledWith({ maxToolCalls: 12, inputTokens: null }));
    fireEvent.click(screen.getByRole("button", { name: "Standard" }));
    await waitFor(() => expect(saveAnswerSettings).toHaveBeenLastCalledWith({ maxToolCalls: null, inputTokens: null }));
    expect(onSaved).toHaveBeenCalledTimes(2);
  });

  it("tells a company on the classic engine that the limits apply with Xenacore", () => {
    render(<AnswerSettings value={{ ...value, engine: "classic" }} onSaved={async () => {}} />);
    expect(screen.getByText(/klassische KI-Engine/)).toBeTruthy();
  });
});

describe("CustomModelList: context size (step 83)", () => {
  const custom: CustomModel = {
    baseUrl: "https://llm.firma.de/v1",
    profile: "openai",
    model: "qwen",
    models: [{ name: "qwen", check: null, checkedAt: null }],
    apiKeySet: false,
    headers: [],
    fallback: false,
    contextTokens: 32_000,
    check: null,
    checkedAt: null,
    health: { status: null, since: null, error: null, checkedAt: null },
  };

  it("saves a new window and hides the field on older servers", async () => {
    const { unmount } = render(<CustomModelList custom={custom} platformConfigured onChanged={async () => {}} />);
    const field = screen.getByLabelText("Kontextgröße (Tokens)") as HTMLInputElement;
    const apply = screen.getByRole("button", { name: "Übernehmen" }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    fireEvent.change(field, { target: { value: "64000" } });
    fireEvent.click(apply);
    await waitFor(() => expect(setCustomModelContext).toHaveBeenCalledWith(64_000));
    unmount();
    const { contextTokens: _omit, ...older } = custom;
    render(<CustomModelList custom={older} platformConfigured onChanged={async () => {}} />);
    expect(screen.queryByLabelText("Kontextgröße (Tokens)")).toBeNull();
  });
});
