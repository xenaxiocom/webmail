import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Step 90, part F: the installation's models in the operator console.
const api = vi.hoisted(() => ({ models: vi.fn(), availableModels: vi.fn(), saveModels: vi.fn(), testModels: vi.fn() }));
vi.mock("next-intl", () => ({ useLocale: () => "de" }));
vi.mock("@/lib/xenaxio/api", async (orig) => {
  const real = await orig<typeof import("@/lib/xenaxio/api")>();
  return { ...real, xenaxio: { ...real.xenaxio, operator: api } };
});

const { OperatorModels } = await import("../operator-models");

const view = {
  platformKey: true,
  chat: { model: "mistral-small-2603", models: ["mistral-small-2603", "mistral-medium-latest"], fromConfig: { model: "mistral-small-2603", models: ["mistral-small-2603", "mistral-medium-latest"] } },
  speech: { source: "mistral" as const, model: "voxtral-mini-transcribe-3", fromConfig: "voxtral-mini-transcribe-3" },
  updatedAt: null,
};

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.availableModels.mockResolvedValue(["mistral-large-latest", "mistral-small-2603"]);
});

describe("step 90, part F: installation models", () => {
  it("shows the models, saves another default and switches speech to an own Whisper server", async () => {
    api.models.mockResolvedValue(view);
    api.saveModels.mockImplementation(async (change: { chatModel?: string }) => ({ ...view, chat: { ...view.chat, model: change.chatModel ?? view.chat.model } }));
    render(<OperatorModels />);
    const chat = await screen.findByDisplayValue("mistral-small-2603");
    fireEvent.change(chat, { target: { value: "mistral-large-latest" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Speichern" })[0]!);
    await waitFor(() => expect(api.saveModels).toHaveBeenCalledWith({ chatModel: "mistral-large-latest", models: ["mistral-small-2603", "mistral-medium-latest"] }));

    fireEvent.click(screen.getByRole("radio", { name: /Eigener Whisper-Server/ }));
    fireEvent.change(screen.getByPlaceholderText("https://whisper.example.com/v1"), { target: { value: "https://whisper.xenaxio.com/v1" } });
    fireEvent.change(screen.getByDisplayValue("voxtral-mini-transcribe-3"), { target: { value: "whisper-large-v3-turbo" } });
    fireEvent.change(screen.getByLabelText("API-Schlüssel"), { target: { value: "w-key" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Speichern" })[1]!);
    await waitFor(() =>
      expect(api.saveModels).toHaveBeenLastCalledWith({ speech: { source: "own", baseUrl: "https://whisper.xenaxio.com/v1", profile: "openai", model: "whisper-large-v3-turbo", apiKey: "w-key" } }),
    );
    api.testModels.mockResolvedValue({ ok: true, error: null, ms: 310 });
    fireEvent.click(screen.getAllByRole("button", { name: "Testen" })[1]!);
    expect(await screen.findByText("Funktioniert (310 ms).")).toBeInTheDocument();
    expect(api.testModels).toHaveBeenCalledWith("speech", undefined);
  });
});
