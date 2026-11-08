// Step 138: voice messages in Rooms. A voice message is an m.audio message
// marked as voice (Matrix MSC3245), with its length and waveform (MSC1767), so
// Element shows it as a voice message too. Recording uses what the browser
// can: Ogg/Opus (Firefox), WebM/Opus (Chrome, Edge), MP4/AAC (Safari).

/** The marker of a voice message (MSC3245). */
export const VOICE_FIELD = "org.matrix.msc3245.voice";
/** Length (ms) and waveform (0–1024) of an audio message (MSC1767). */
export const AUDIO_FIELD = "org.matrix.msc1767.audio";

/** A voice message stops by itself after this long. */
export const MAX_VOICE_MS = 5 * 60_000;
/** Bars of the waveform kept with the message. */
export const WAVEFORM_BARS = 48;

const FORMATS = [
  { mime: "audio/ogg;codecs=opus", type: "audio/ogg", ext: "ogg" },
  { mime: "audio/webm;codecs=opus", type: "audio/webm", ext: "webm" },
  { mime: "audio/mp4", type: "audio/mp4", ext: "m4a" },
] as const;

export type RecordingFormat = (typeof FORMATS)[number];

/** The first format this browser records, or null (no voice messages then). */
export function recordingFormat(isSupported: (mime: string) => boolean): RecordingFormat | null {
  for (const f of FORMATS) {
    try {
      if (isSupported(f.mime)) return f;
    } catch {
      // A browser that throws for a type it does not know.
    }
  }
  return null;
}

/** Whether this browser can record voice messages at all. */
export function canRecordVoice(): boolean {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;
  return recordingFormat((m) => MediaRecorder.isTypeSupported(m)) !== null;
}

/** Loudness samples (0–1) squeezed into `bars` bars of 0–1024, the loudest part of each. */
export function waveform(levels: number[], bars = WAVEFORM_BARS): number[] {
  if (levels.length === 0) return Array.from({ length: bars }, () => 0);
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const from = Math.floor((i * levels.length) / bars);
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / bars));
    let peak = 0;
    for (let j = from; j < to && j < levels.length; j++) peak = Math.max(peak, levels[j] ?? 0);
    out.push(Math.round(Math.min(1, Math.max(0, peak)) * 1024));
  }
  // Quiet recordings still show their shape.
  const top = Math.max(...out);
  return top > 0 && top < 1024 ? out.map((v) => Math.round((v / top) * 1024)) : out;
}

export interface VoiceFields {
  mxc: string;
  durationMs: number | null;
  waveform: number[];
  name: string;
  type: string;
  size: number;
}

/** The fields of a voice message, or null for any other message. */
export function voiceOf(content: Record<string, unknown>): VoiceFields | null {
  if (content.msgtype !== "m.audio" || !(VOICE_FIELD in content) || typeof content.url !== "string" || !content.url.startsWith("mxc://")) return null;
  const info = (content.info && typeof content.info === "object" ? content.info : {}) as { duration?: unknown; mimetype?: unknown; size?: unknown };
  const audio = (content[AUDIO_FIELD] && typeof content[AUDIO_FIELD] === "object" ? content[AUDIO_FIELD] : {}) as { duration?: unknown; waveform?: unknown };
  const ms = typeof info.duration === "number" ? info.duration : typeof audio.duration === "number" ? audio.duration : null;
  const wave = Array.isArray(audio.waveform) ? audio.waveform.filter((v): v is number => typeof v === "number" && Number.isFinite(v)).map((v) => Math.min(1024, Math.max(0, v))) : [];
  return {
    mxc: content.url,
    durationMs: ms !== null && Number.isFinite(ms) && ms >= 0 ? ms : null,
    waveform: wave.slice(0, 256),
    name: String(content.filename ?? content.body ?? "voice"),
    type: typeof info.mimetype === "string" ? info.mimetype : "audio/ogg",
    size: typeof info.size === "number" ? info.size : 0,
  };
}

/** The message for a recorded voice message, after its file went up. */
export function voiceContent(input: { url: string; format: Pick<RecordingFormat, "type" | "ext">; size: number; durationMs: number; waveform: number[]; label: string; at?: Date }): Record<string, unknown> {
  const at = input.at ?? new Date();
  const stamp = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}-${String(at.getHours()).padStart(2, "0")}${String(at.getMinutes()).padStart(2, "0")}`;
  const duration = Math.max(0, Math.round(input.durationMs));
  return {
    msgtype: "m.audio",
    body: input.label,
    filename: `voice-${stamp}.${input.format.ext}`,
    url: input.url,
    info: { mimetype: input.format.type, size: input.size, duration },
    [AUDIO_FIELD]: { duration, waveform: input.waveform },
    [VOICE_FIELD]: {},
  };
}

export interface Recording {
  blob: Blob;
  format: RecordingFormat;
  durationMs: number;
  waveform: number[];
}

/**
 * One recording from the microphone. `level` gets the loudness (0–1) about ten
 * times a second; `onLimit` is called when the five minutes are reached.
 */
export class VoiceRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private limit: ReturnType<typeof setTimeout> | null = null;
  private chunks: Blob[] = [];
  private levels: number[] = [];
  private started = 0;
  private format: RecordingFormat | null = null;

  constructor(private readonly opts: { level?: (value: number) => void; onLimit?: () => void } = {}) {}

  /** Asks for the microphone and starts; throws "mic_denied" or "unsupported". */
  async start(): Promise<void> {
    const format = typeof MediaRecorder === "undefined" ? null : recordingFormat((m) => MediaRecorder.isTypeSupported(m));
    if (!format || !navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      throw new Error("mic_denied");
    }
    this.format = format;
    this.chunks = [];
    this.levels = [];
    this.recorder = new MediaRecorder(this.stream, { mimeType: format.mime, audioBitsPerSecond: 32_000 });
    this.recorder.addEventListener("dataavailable", (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    });
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        this.context = new Ctx();
        const analyser = this.context.createAnalyser();
        analyser.fftSize = 512;
        this.context.createMediaStreamSource(this.stream).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        this.timer = setInterval(() => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (const v of data) sum += ((v - 128) / 128) ** 2;
          const level = Math.min(1, Math.sqrt(sum / data.length) * 3);
          this.levels.push(level);
          this.opts.level?.(level);
        }, 100);
      }
    } catch {
      // Without the waveform: the recording works anyway.
    }
    this.recorder.start(1000);
    this.started = Date.now();
    this.limit = setTimeout(() => this.opts.onLimit?.(), MAX_VOICE_MS);
  }

  get elapsedMs(): number {
    return this.started ? Date.now() - this.started : 0;
  }

  /** Stops and returns the recording (null when nothing was recorded). */
  async stop(): Promise<Recording | null> {
    const recorder = this.recorder;
    const format = this.format;
    if (!recorder || !format) return null;
    const durationMs = Math.min(MAX_VOICE_MS, this.elapsedMs);
    const done = new Promise<void>((resolve) => recorder.addEventListener("stop", () => resolve(), { once: true }));
    if (recorder.state !== "inactive") recorder.stop();
    await done;
    const blob = new Blob(this.chunks, { type: format.type });
    const wave = waveform(this.levels);
    this.release();
    return blob.size > 0 ? { blob, format, durationMs, waveform: wave } : null;
  }

  /** Stops without keeping anything. */
  cancel(): void {
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    this.release();
  }

  private release(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.limit) clearTimeout(this.limit);
    this.timer = null;
    this.limit = null;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    void this.context?.close().catch(() => undefined);
    this.stream = null;
    this.context = null;
    this.recorder = null;
    this.chunks = [];
    this.started = 0;
  }
}
