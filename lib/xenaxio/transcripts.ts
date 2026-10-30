// Step 86: texts of the audio files on screen in Files, and making them.
import { create } from "zustand";
import { isAudioName } from "@/lib/xenaxio/audio-player";
import { xenaxio, type FileTranscript, type TranscriptionUnavailable } from "@/lib/xenaxio/api";
import type { FileResource } from "@/stores/file-store";

/** The key the platform answers with: the id, with the owner's account for colleagues' files. */
export function transcriptKey(r: Pick<FileResource, "id" | "isShared" | "ownerAccountId">): string {
  return r.isShared && r.ownerAccountId ? `${r.ownerAccountId}:${r.id}` : r.id;
}

const ref = (r: FileResource) => ({ id: r.id, ...(r.isShared && r.ownerAccountId ? { accountId: r.ownerAccountId } : {}) });

export const isAudioResource = (r: FileResource) => !r.isDirectory && isAudioName(r.name, r.contentType);

interface TranscriptState {
  byKey: Record<string, FileTranscript>;
  /** Being transcribed now. */
  busy: Record<string, boolean>;
  errors: Record<string, string>;
  available: boolean;
  /** The platform answered a lookup; until then the button is offered and the platform decides. */
  known: boolean;
  reason: TranscriptionUnavailable | null;
  maxBytes: number;
  /** Texts of the audio files among these (the folder on screen). */
  lookup: (resources: FileResource[]) => Promise<void>;
  transcribe: (resource: FileResource, language?: string) => Promise<void>;
}

export const useTranscripts = create<TranscriptState>((set, get) => ({
  byKey: {},
  busy: {},
  errors: {},
  available: false,
  known: false,
  reason: null,
  maxBytes: 0,
  lookup: async (resources) => {
    const audio = resources.filter(isAudioResource);
    if (audio.length === 0) return;
    try {
      const res = await xenaxio.lookupTranscripts(audio.slice(0, 500).map(ref));
      set((s) => ({ byKey: { ...s.byKey, ...res.transcripts }, available: res.available, known: true, reason: res.reason ?? null, maxBytes: res.maxBytes }));
    } catch {
      // Without the platform's answer the files simply show no texts.
    }
  },
  transcribe: async (resource, language) => {
    const key = transcriptKey(resource);
    if (get().busy[key]) return;
    set((s) => ({ busy: { ...s.busy, [key]: true }, errors: { ...s.errors, [key]: "" } }));
    try {
      const { transcript } = await xenaxio.transcribe({ ...ref(resource), ...(language ? { language } : {}) });
      set((s) => ({ byKey: { ...s.byKey, [key]: transcript } }));
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "internal";
      set((s) => ({ errors: { ...s.errors, [key]: code } }));
    } finally {
      set((s) => ({ busy: { ...s.busy, [key]: false } }));
    }
  },
}));
