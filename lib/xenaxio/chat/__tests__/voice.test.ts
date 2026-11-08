// Step 139: voice messages — recording format, waveform, the message fields.
import { describe, expect, it } from "vitest";
import { plainPreview } from "../format";
import { AUDIO_FIELD, recordingFormat, VOICE_FIELD, voiceContent, voiceOf, waveform } from "../voice";

describe("voice messages (step 139)", () => {
  it("records in the first format the browser knows", () => {
    expect(recordingFormat((m) => m.startsWith("audio/ogg"))?.ext).toBe("ogg");
    expect(recordingFormat((m) => m.startsWith("audio/webm"))?.ext).toBe("webm");
    // Safari: MP4/AAC.
    expect(recordingFormat((m) => m === "audio/mp4")).toMatchObject({ type: "audio/mp4", ext: "m4a" });
    expect(recordingFormat(() => false)).toBeNull();
    expect(
      recordingFormat(() => {
        throw new Error("unknown");
      }),
    ).toBeNull();
  });

  it("squeezes loudness into bars of 0–1024, the loudest part of each, scaled up when quiet", () => {
    expect(waveform([], 4)).toEqual([0, 0, 0, 0]);
    expect(waveform([0.1, 0.5, 0.2, 0.25], 2)).toEqual([1024, 512]);
    expect(waveform([1, 0, 0.5, 0], 4)).toEqual([1024, 0, 512, 0]);
    expect(waveform([0.5], 3)).toEqual([1024, 1024, 1024]);
  });

  it("makes a message Element also shows as a voice message, and reads it back", () => {
    const content = voiceContent({ url: "mxc://acme.de/v1", format: { type: "audio/webm", ext: "webm" }, size: 4096, durationMs: 12_400.4, waveform: [0, 512, 1024], label: "Sprachnachricht", at: new Date(2026, 10, 8, 9, 5) });
    expect(content).toEqual({
      msgtype: "m.audio",
      body: "Sprachnachricht",
      filename: "voice-2026-11-08-0905.webm",
      url: "mxc://acme.de/v1",
      info: { mimetype: "audio/webm", size: 4096, duration: 12_400 },
      [AUDIO_FIELD]: { duration: 12_400, waveform: [0, 512, 1024] },
      [VOICE_FIELD]: {},
    });
    expect(voiceOf(content)).toEqual({ mxc: "mxc://acme.de/v1", durationMs: 12_400, waveform: [0, 512, 1024], name: "voice-2026-11-08-0905.webm", type: "audio/webm", size: 4096 });
    // An audio file is not a voice message.
    const { [VOICE_FIELD]: _marker, ...file } = content;
    expect(voiceOf(file)).toBeNull();
    expect(plainPreview(content)).toBe("🎤 Sprachnachricht");
    expect(plainPreview({ ...file, body: "song.mp3" })).toBe("🎵 song.mp3");
  });
});
