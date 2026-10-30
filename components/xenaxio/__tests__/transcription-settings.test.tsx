import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Step 90, part E: the company's own speech server — stored, tested, then chosen.
const api = vi.hoisted(() => ({ setTranscription: vi.fn(), saveSpeechServer: vi.fn(), testSpeechServer: vi.fn(), removeSpeechServer: vi.fn() }));
vi.mock("next-intl", () => ({ useLocale: () => "de" }));
vi.mock("@/lib/xenaxio/api", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/api")>()), xenaxio: api }));

const { TranscriptionSettings } = await import("../transcription-settings");

const base = { mode: "xenaxio" as const, platformModel: "voxtral-mini-transcribe-3", customModel: null };
const server = { baseUrl: "https://stt.acme.de/v1", profile: "openai" as const, model: "whisper-large-v3-turbo", hasKey: true, checkedAt: null };

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
});

describe("step 90, part E: own speech server", () => {
  it("stores the connection, tests it, and only a tested server can be chosen", async () => {
    const onSaved = vi.fn(async () => {});
    api.saveSpeechServer.mockResolvedValue({ ...server, check: null });
    const { rerender } = render(<TranscriptionSettings value={{ ...base, ownServer: null }} hasOwnServer={false} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("radio", { name: /Eigener Sprachserver/ }));
    expect(screen.getByRole("button", { name: "Speichern" })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("https://stt.example.com/v1"), { target: { value: "https://stt.acme.de/v1" } });
    fireEvent.change(screen.getByPlaceholderText("whisper-large-v3-turbo"), { target: { value: "whisper-large-v3-turbo" } });
    fireEvent.change(screen.getByLabelText("API-Schlüssel"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Server speichern" }));
    await waitFor(() => expect(api.saveSpeechServer).toHaveBeenCalledWith({ baseUrl: "https://stt.acme.de/v1", profile: "openai", model: "whisper-large-v3-turbo", apiKey: "secret" }));

    // The parent reloads: the server is stored, not tested.
    rerender(<TranscriptionSettings value={{ ...base, ownServer: { ...server, check: null } }} hasOwnServer={false} onSaved={onSaved} />);
    expect(screen.getByText(/Noch nicht getestet/)).toBeInTheDocument();
    api.testSpeechServer.mockResolvedValue({ result: { ok: false, error: "unauthorized", status: 401, ms: null, text: null }, settings: server });
    fireEvent.click(screen.getByRole("button", { name: "Verbindung testen" }));
    await waitFor(() => expect(api.testSpeechServer).toHaveBeenCalled());
    rerender(<TranscriptionSettings value={{ ...base, ownServer: { ...server, check: { ok: false, error: "unauthorized", status: 401, ms: null, text: null } } }} hasOwnServer={false} onSaved={onSaved} />);
    expect(screen.getByText("Der Server hat den Schlüssel abgelehnt.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Speichern" })).toBeDisabled();

    rerender(<TranscriptionSettings value={{ ...base, ownServer: { ...server, check: { ok: true, error: null, status: null, ms: 420, text: "" } } }} hasOwnServer={false} onSaved={onSaved} />);
    expect(screen.getByText(/Verbindung klappt.*420 ms/)).toBeInTheDocument();
    api.setTranscription.mockResolvedValue({ mode: "own_server", customModel: null });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(api.setTranscription).toHaveBeenCalledWith({ mode: "own_server" }));
  });
});
