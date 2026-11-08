// Step 138: a voice message in Rooms — player, waveform and its transcript.
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useVoiceTexts } from "@/lib/xenaxio/chat/voice-texts";
import { bars, VoiceMessage } from "../chat/voice-message";

vi.mock("next-intl", () => ({ useLocale: () => "de" }));

const content = {
  msgtype: "m.audio",
  body: "Sprachnachricht",
  filename: "voice.ogg",
  url: "mxc://acme.de/v1",
  info: { mimetype: "audio/ogg", size: 4000, duration: 12_000 },
  "org.matrix.msc1767.audio": { duration: 12_000, waveform: [0, 1024] },
  "org.matrix.msc3245.voice": {},
};

describe("voice message in Rooms (step 138)", () => {
  const transcribe = vi.fn(async () => {});
  const want = vi.fn();
  beforeEach(() => {
    transcribe.mockClear();
    want.mockClear();
    useVoiceTexts.setState({ byMxc: {}, asked: {}, busy: {}, errors: {}, available: true, known: true, reason: null, transcribe, want });
  });

  it("draws the waveform from the message, and a flat line without one", () => {
    expect(bars([0, 1024], 4)).toEqual([0.12, 0.12, 1, 1]);
    expect(new Set(bars([], 3))).toEqual(new Set([0.15]));
  });

  it("shows the player with the length and asks for the text once it has an id", () => {
    const { rerender } = render(<VoiceMessage content={content} roomId="!r" eventId="~t1" ts={1} />);
    expect(screen.getByRole("button", { name: "Sprachnachricht abspielen" })).toBeTruthy();
    expect(screen.getByText("0:12")).toBeTruthy();
    expect(want).not.toHaveBeenCalled();
    rerender(<VoiceMessage content={content} roomId="!r" eventId="$e1" ts={1} />);
    expect(want).toHaveBeenCalledWith("mxc://acme.de/v1", { roomId: "!r", eventId: "$e1", ts: 1 });
  });

  it("shows the transcript and redoes it in another language", () => {
    useVoiceTexts.setState({ asked: { "mxc://acme.de/v1": true }, byMxc: { "mxc://acme.de/v1": { state: "done", text: "Ab Montag um 6:30.", language: "de" } } });
    render(<VoiceMessage content={content} roomId="!r" eventId="$e1" ts={1} />);
    expect(screen.getByText("Ab Montag um 6:30.")).toBeTruthy();
    fireEvent.click(screen.getByText("Neu transkribieren"));
    fireEvent.change(screen.getByRole("combobox", { name: "Sprache" }), { target: { value: "uk" } });
    expect(transcribe).toHaveBeenCalledWith("mxc://acme.de/v1", { roomId: "!r", eventId: "$e1" }, { language: "uk" });
  });

  it("says while it is being made, and why there is none", () => {
    useVoiceTexts.setState({ byMxc: { "mxc://acme.de/v1": { state: "pending" } } });
    const { unmount } = render(<VoiceMessage content={content} roomId="!r" eventId="$e1" ts={1} />);
    expect(screen.getByText("Wird transkribiert…")).toBeTruthy();
    unmount();
    useVoiceTexts.setState({ byMxc: {}, asked: { "mxc://acme.de/v1": true }, available: false, reason: "free_limit_reached" });
    render(<VoiceMessage content={content} roomId="!r" eventId="$e1" ts={1} />);
    expect(screen.getByText(/XenRooms Free sind aufgebraucht/)).toBeTruthy();
    expect(screen.queryByText("Transkribieren")).toBeNull();
  });

  it("offers the button for an older message without text, and again after a failure", () => {
    useVoiceTexts.setState({ asked: { "mxc://acme.de/v1": true } });
    const { unmount } = render(<VoiceMessage content={content} roomId="!r" eventId="$e1" ts={1} />);
    fireEvent.click(screen.getByText("Transkribieren"));
    expect(transcribe).toHaveBeenCalledWith("mxc://acme.de/v1", { roomId: "!r", eventId: "$e1" }, {});
    unmount();
    useVoiceTexts.setState({ byMxc: { "mxc://acme.de/v1": { state: "failed", error: "audio_refused" } } });
    render(<VoiceMessage content={content} roomId="!r" eventId="$e1" ts={1} />);
    expect(screen.getByText("Das Sprachmodell konnte diese Aufnahme nicht lesen.")).toBeTruthy();
    fireEvent.click(screen.getByText("Neu transkribieren"));
    expect(transcribe).toHaveBeenLastCalledWith("mxc://acme.de/v1", { roomId: "!r", eventId: "$e1" }, { again: true });
  });
});
