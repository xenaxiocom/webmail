import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileResource } from "@/stores/file-store";
import { useTranscripts } from "@/lib/xenaxio/transcripts";
import { AudioDetails, AudioPlayButton, TranscriptAction, TranscriptLine } from "../files-audio";

vi.mock("next-intl", () => ({ useLocale: () => "de" }));

const voice: FileResource = {
  id: "v1", name: "WhatsApp Audio 2026-10-30 at 11.31.56.opus", serverName: "x", isDirectory: false, contentType: "audio/ogg",
  contentLength: 40_000, lastModified: "2026-10-30T10:31:56Z", blobId: "b1", parentId: null,
};

describe("audio files in Files (step 86)", () => {
  const transcribe = vi.fn(async () => {});
  beforeEach(() => {
    transcribe.mockClear();
    useTranscripts.setState({ byKey: {}, busy: {}, errors: {}, available: true, known: true, reason: null, maxBytes: 25 * 1024 * 1024, transcribe });
  });

  it("plays from the row through the row's open action", () => {
    const toggle = vi.fn();
    render(<AudioPlayButton resource={voice} onToggle={toggle} />);
    fireEvent.click(screen.getByRole("button", { name: `${voice.name} abspielen` }));
    expect(toggle).toHaveBeenCalledOnce();
  });

  it("offers to transcribe a file without text", () => {
    render(<AudioDetails resource={voice} onToggle={() => {}} />);
    expect(screen.queryByText("Sprache")).toBeNull();
    fireEvent.click(screen.getByText("Transkribieren"));
    expect(transcribe).toHaveBeenCalledWith(voice, undefined);
  });

  it("shows the text, the detected language, and redoes it in a chosen language", () => {
    useTranscripts.setState({ byKey: { v1: { text: "Привет, перезвони мне.", language: "ru", manual: false, model: "m", audioSeconds: 7, updatedAt: "" } } });
    render(<AudioDetails resource={voice} onToggle={() => {}} />);
    expect(screen.getByText("Привет, перезвони мне.")).toBeTruthy();
    expect(screen.getByText(/Erkannte Sprache: Russisch/)).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "uk" } });
    fireEvent.click(screen.getByText("Neu transkribieren"));
    expect(transcribe).toHaveBeenCalledWith(voice, "uk");
  });

  it("shows in the row the start of the text and an icon that opens it", () => {
    useTranscripts.setState({ byKey: { v1: { text: "Привет, перезвони мне.", language: "ru", manual: false, model: "m", audioSeconds: 7, updatedAt: "" } } });
    const show = vi.fn();
    render(<><TranscriptAction resource={voice} onShow={show} /><TranscriptLine resource={voice} onShow={show} /></>);
    const icon = screen.getByLabelText(`Transkript von ${voice.name} anzeigen`);
    expect(icon.getAttribute("title")).toBe("Привет, перезвони мне.");
    fireEvent.click(icon);
    fireEvent.click(screen.getByText("Привет, перезвони мне."));
    expect(show).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Transkribieren")).toBeNull();
  });

  it("offers to transcribe right in the row and opens the text when done", async () => {
    const show = vi.fn();
    transcribe.mockImplementationOnce(async () => {
      useTranscripts.setState({ byKey: { v1: { text: "Hallo", language: "de", manual: false, model: "m", audioSeconds: 2, updatedAt: "" } } });
    });
    render(<TranscriptAction resource={voice} onShow={show} />);
    fireEvent.click(screen.getByText("Transkribieren"));
    expect(transcribe).toHaveBeenCalledWith(voice);
    await vi.waitFor(() => expect(show).toHaveBeenCalledOnce());
  });

  it("offers the button when the platform has not answered yet (it decides then)", () => {
    useTranscripts.setState({ available: false, known: false, reason: null });
    render(<AudioDetails resource={voice} onToggle={() => {}} />);
    expect(screen.getByText("Transkribieren")).toBeTruthy();
  });

  it("says why there is no button", () => {
    useTranscripts.setState({ available: false, reason: "transcription_off" });
    render(<AudioDetails resource={voice} onToggle={() => {}} />);
    expect(screen.getByText(/hat das Transkribieren ausgeschaltet/)).toBeTruthy();
    expect(screen.queryByText("Transkribieren")).toBeNull();
  });
});
