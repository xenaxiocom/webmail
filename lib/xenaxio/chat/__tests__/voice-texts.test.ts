// Step 139: texts of the voice messages on screen — asked for in one batch;
// a recent message without text is transcribed by the reader, an old one not.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  lookupVoice: vi.fn(),
  transcribeVoice: vi.fn(),
}));
vi.mock("@/lib/xenaxio/api", () => ({ xenaxio: api }));

import { useVoiceTexts } from "../voice-texts";

describe("voice texts (step 139)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.lookupVoice.mockReset();
    api.transcribeVoice.mockReset();
    useVoiceTexts.setState({ byMxc: {}, asked: {}, busy: {}, errors: {}, available: false, known: false, reason: null });
  });
  afterEach(() => vi.useRealTimers());

  it("asks once for all messages on screen and starts the model only for recent ones", async () => {
    api.lookupVoice.mockResolvedValue({ available: true, transcripts: { "mxc://a/1": { state: "done", text: "Hallo" } } });
    api.transcribeVoice.mockResolvedValue({ mxc: "mxc://a/2", transcript: { state: "done", text: "Neu" } });
    const now = Date.now();
    const { want } = useVoiceTexts.getState();
    want("mxc://a/1", { roomId: "!r", eventId: "$1", ts: now });
    want("mxc://a/2", { roomId: "!r", eventId: "$2", ts: now - 60_000 });
    want("mxc://a/3", { roomId: "!r", eventId: "$3", ts: now - 3 * 24 * 3600_000 });
    want("mxc://a/1", { roomId: "!r", eventId: "$1", ts: now });
    await vi.advanceTimersByTimeAsync(100);
    expect(api.lookupVoice).toHaveBeenCalledTimes(1);
    expect(api.lookupVoice).toHaveBeenCalledWith(["mxc://a/1", "mxc://a/2", "mxc://a/3"]);
    expect(api.transcribeVoice).toHaveBeenCalledTimes(1);
    expect(api.transcribeVoice).toHaveBeenCalledWith({ roomId: "!r", eventId: "$2", auto: true });
    const s = useVoiceTexts.getState();
    expect(s.byMxc["mxc://a/1"]?.text).toBe("Hallo");
    expect(s.byMxc["mxc://a/2"]?.text).toBe("Neu");
    expect(s.byMxc["mxc://a/3"]).toBeUndefined();
    expect(s.asked["mxc://a/3"]).toBe(true);
  });

  it("asks again for a text being made until it is there", async () => {
    api.lookupVoice
      .mockResolvedValueOnce({ available: true, transcripts: { "mxc://a/1": { state: "pending" } } })
      .mockResolvedValueOnce({ available: true, transcripts: { "mxc://a/1": { state: "done", text: "Fertig" } } });
    useVoiceTexts.getState().want("mxc://a/1", { roomId: "!r", eventId: "$1", ts: Date.now() });
    await vi.advanceTimersByTimeAsync(100);
    expect(useVoiceTexts.getState().byMxc["mxc://a/1"]?.state).toBe("pending");
    await vi.advanceTimersByTimeAsync(3000);
    expect(api.lookupVoice).toHaveBeenCalledTimes(2);
    expect(useVoiceTexts.getState().byMxc["mxc://a/1"]?.text).toBe("Fertig");
    expect(api.transcribeVoice).not.toHaveBeenCalled();
  });

  it("does not start the model when the person cannot transcribe, and keeps the reason", async () => {
    api.lookupVoice.mockResolvedValue({ available: false, reason: "ai_disabled", transcripts: {} });
    useVoiceTexts.getState().want("mxc://a/9", { roomId: "!r", eventId: "$9", ts: Date.now() });
    await vi.advanceTimersByTimeAsync(100);
    expect(api.transcribeVoice).not.toHaveBeenCalled();
    expect(useVoiceTexts.getState().reason).toBe("ai_disabled");
  });
});
