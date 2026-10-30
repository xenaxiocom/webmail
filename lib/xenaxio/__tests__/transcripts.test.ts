import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileResource } from "@/stores/file-store";

const lookupTranscripts = vi.fn();
const transcribe = vi.fn();
vi.mock("@/lib/xenaxio/api", () => ({ xenaxio: { lookupTranscripts: (...a: unknown[]) => lookupTranscripts(...a), transcribe: (...a: unknown[]) => transcribe(...a) } }));

const { formatTime, isAudioName } = await import("@/lib/xenaxio/audio-player");
const { isAudioResource, transcriptKey, useTranscripts } = await import("@/lib/xenaxio/transcripts");

const file = (over: Partial<FileResource>): FileResource => ({
  id: "v1", name: "WhatsApp Audio 2026-10-30 at 11.28.27.opus", serverName: "x", isDirectory: false, contentType: "application/octet-stream",
  contentLength: 40_000, lastModified: "2026-10-30T10:28:27Z", blobId: "b1", parentId: null, ...over,
});

describe("audio files in Files (step 86)", () => {
  beforeEach(() => {
    lookupTranscripts.mockReset();
    transcribe.mockReset();
    useTranscripts.setState({ byKey: {}, busy: {}, errors: {}, available: false, known: false, reason: null, maxBytes: 0 });
  });

  it("knows voice messages by extension or type, and folders are never audio", () => {
    expect(isAudioName("memo.OPUS")).toBe(true);
    expect(isAudioName("aufnahme", "audio/mpeg")).toBe(true);
    expect(isAudioName("video.mp4", "video/mp4")).toBe(false);
    expect(isAudioResource(file({}))).toBe(true);
    expect(isAudioResource(file({ isDirectory: true }))).toBe(false);
    expect(formatTime(65.9)).toBe("1:05");
  });

  it("keys colleagues' files by their account, as the platform answers", () => {
    expect(transcriptKey(file({}))).toBe("v1");
    expect(transcriptKey(file({ isShared: true, ownerAccountId: "acc-anna" }))).toBe("acc-anna:v1");
  });

  it("looks up only audio files and keeps what the platform answers", async () => {
    lookupTranscripts.mockResolvedValue({ available: true, maxBytes: 100, transcripts: { v1: { text: "Hallo", language: "de", manual: false } } });
    await useTranscripts.getState().lookup([file({}), file({ id: "t", name: "notes.txt", contentType: "text/plain" }), file({ id: "s", isShared: true, ownerAccountId: "acc-anna" })]);
    expect(lookupTranscripts).toHaveBeenCalledWith([{ id: "v1" }, { id: "s", accountId: "acc-anna" }]);
    expect(useTranscripts.getState()).toMatchObject({ available: true, known: true, maxBytes: 100, byKey: { v1: { text: "Hallo" } } });
    lookupTranscripts.mockClear();
    await useTranscripts.getState().lookup([file({ id: "t", name: "notes.txt", contentType: "text/plain" })]);
    expect(lookupTranscripts).not.toHaveBeenCalled();
  });

  it("transcribes again with a chosen language and shows a refusal", async () => {
    transcribe.mockResolvedValue({ id: "v1", transcript: { text: "Привіт", language: "uk", manual: true } });
    await useTranscripts.getState().transcribe(file({}), "uk");
    expect(transcribe).toHaveBeenCalledWith({ id: "v1", language: "uk" });
    expect(useTranscripts.getState().byKey.v1).toMatchObject({ text: "Привіт", manual: true });
    expect(useTranscripts.getState().busy.v1).toBe(false);

    transcribe.mockRejectedValue(Object.assign(new Error("x"), { code: "ai_limit_reached" }));
    await useTranscripts.getState().transcribe(file({}));
    expect(transcribe).toHaveBeenLastCalledWith({ id: "v1" });
    expect(useTranscripts.getState().errors.v1).toBe("ai_limit_reached");
  });
});
