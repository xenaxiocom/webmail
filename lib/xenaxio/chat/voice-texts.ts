// Step 138: texts of the voice messages on screen. Asked for in batches; one
// still being transcribed is asked for again a little later. A voice message
// without a text (from Element, another company, or a sender without AI) is
// transcribed by the first reader who opens it, if it is recent; older ones by
// the button only (the platform checks that too).
import { create } from "zustand";
import { xenaxio, type TranscriptionUnavailable, type VoiceTranscript } from "@/lib/xenaxio/api";

/** Messages newer than this are transcribed when a reader opens them (as on the platform). */
export const AUTO_MS = 24 * 3600_000;
/** How often a pending text is asked for again, and how many times. */
export const POLL_MS = 2500;
const POLL_TIMES = 40;

interface VoiceTextState {
  byMxc: Record<string, VoiceTranscript>;
  /** Asked for once (a missing entry then means: no text yet). */
  asked: Record<string, boolean>;
  busy: Record<string, boolean>;
  errors: Record<string, string>;
  available: boolean;
  /** The platform answered a lookup. */
  known: boolean;
  reason: TranscriptionUnavailable | null;
  /** The text of this message (batched with the others on screen). */
  want: (mxc: string, message: { roomId: string; eventId: string; ts: number }) => void;
  transcribe: (mxc: string, message: { roomId: string; eventId: string }, opts?: { language?: string; again?: boolean; auto?: boolean }) => Promise<void>;
}

const queue = new Map<string, { roomId: string; eventId: string; ts: number }>();
const polls = new Map<string, number>();
/** Pending texts to ask for again at the next poll. */
const waiting = new Map<string, { roomId: string; eventId: string; ts: number }>();
let flushing: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

const codeOf = (err: unknown) => (err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "internal");

export const useVoiceTexts = create<VoiceTextState>((set, get) => {
  /** Asks the platform for the queued files; starts the model for recent ones without a text. */
  async function flush() {
    flushing = null;
    const batch = [...queue].slice(0, 200);
    for (const [mxc] of batch) queue.delete(mxc);
    if (batch.length === 0) return;
    let res;
    try {
      res = await xenaxio.lookupVoice(batch.map(([mxc]) => mxc));
    } catch {
      // Without an answer the messages show no text; the next screen asks again.
      for (const [mxc] of batch) polls.delete(mxc);
      return;
    }
    set((s) => ({
      byMxc: { ...s.byMxc, ...res.transcripts },
      asked: { ...s.asked, ...Object.fromEntries(batch.map(([mxc]) => [mxc, true])) },
      available: res.available,
      known: true,
      reason: res.reason ?? null,
    }));
    for (const [mxc, message] of batch) {
      const found = res.transcripts[mxc];
      if (found?.state === "pending") {
        poll(mxc, message);
        continue;
      }
      polls.delete(mxc);
      if (!found && res.available && Date.now() - message.ts < AUTO_MS) void get().transcribe(mxc, message, { auto: true });
    }
    if (queue.size) schedule();
  }

  function schedule() {
    if (!flushing) flushing = setTimeout(() => void flush(), 60);
  }

  /** Asks again for a text being made, a limited number of times. */
  function poll(mxc: string, message: { roomId: string; eventId: string; ts: number }) {
    const n = (polls.get(mxc) ?? 0) + 1;
    if (n > POLL_TIMES) {
      polls.delete(mxc);
      return;
    }
    polls.set(mxc, n);
    waiting.set(mxc, message);
    if (pollTimer) return;
    pollTimer = setTimeout(() => {
      pollTimer = null;
      for (const [m, msg] of waiting) queue.set(m, msg);
      waiting.clear();
      schedule();
    }, POLL_MS);
  }

  return {
    byMxc: {},
    asked: {},
    busy: {},
    errors: {},
    available: false,
    known: false,
    reason: null,
    want: (mxc, message) => {
      if (get().asked[mxc] || queue.has(mxc)) return;
      queue.set(mxc, message);
      schedule();
    },
    transcribe: async (mxc, message, opts = {}) => {
      if (get().busy[mxc]) return;
      set((s) => ({ busy: { ...s.busy, [mxc]: true }, errors: { ...s.errors, [mxc]: "" } }));
      try {
        const res = await xenaxio.transcribeVoice({ roomId: message.roomId, eventId: message.eventId, ...opts });
        const transcript = res.transcript;
        if (transcript) set((s) => ({ byMxc: { ...s.byMxc, [mxc]: transcript } }));
        if (transcript?.state === "pending") poll(mxc, { ...message, ts: Date.now() });
      } catch (err) {
        // Opened by a reader: a refusal (AI off, limit) shows as the reason, not as an error.
        if (!opts.auto) set((s) => ({ errors: { ...s.errors, [mxc]: codeOf(err) } }));
      } finally {
        set((s) => ({ busy: { ...s.busy, [mxc]: false } }));
      }
    },
  };
});
