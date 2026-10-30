// Step 86: one audio file plays at a time, right in the list of Files (no
// preview window). The file is fetched once per page and kept as an object URL.
import { create } from "zustand";

const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "oga", "opus", "m4a", "flac", "aac", "amr"]);

export function isAudioName(name: string, type?: string | null): boolean {
  if (type?.toLowerCase().startsWith("audio/")) return true;
  const dot = name.lastIndexOf(".");
  return dot >= 0 && AUDIO_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/** Ogg Opus (WhatsApp voice messages) as a type browsers play; "audio/opus" is the RTP payload. */
function playableType(name: string, type: string): string {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "opus" || ext === "oga" || ext === "ogg") return "audio/ogg";
  return type.startsWith("audio/") ? type : "";
}

interface PlayerState {
  /** The file playing or paused (its id), or null. */
  current: string | null;
  playing: boolean;
  loading: boolean;
  failed: boolean;
  time: number;
  duration: number;
  /** Play or pause this file; another file stops the one before. */
  toggle: (id: string, name: string, load: () => Promise<Blob | null>) => Promise<void>;
  seek: (seconds: number) => void;
  stop: () => void;
}

let audio: HTMLAudioElement | null = null;
const urls = new Map<string, string>();

function element(set: (p: Partial<PlayerState>) => void): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "auto";
  audio.addEventListener("timeupdate", () => set({ time: audio?.currentTime ?? 0 }));
  audio.addEventListener("durationchange", () => set({ duration: Number.isFinite(audio?.duration) ? (audio?.duration ?? 0) : 0 }));
  audio.addEventListener("play", () => set({ playing: true }));
  audio.addEventListener("pause", () => set({ playing: false }));
  audio.addEventListener("ended", () => set({ playing: false, time: 0 }));
  audio.addEventListener("error", () => set({ playing: false, loading: false, failed: true }));
  return audio;
}

export const useAudioPlayer = create<PlayerState>((set, get) => ({
  current: null,
  playing: false,
  loading: false,
  failed: false,
  time: 0,
  duration: 0,
  toggle: async (id, name, load) => {
    const el = element(set);
    if (get().current === id && !get().failed) {
      if (el.paused) await el.play().catch(() => set({ failed: true }));
      else el.pause();
      return;
    }
    el.pause();
    set({ current: id, playing: false, loading: true, failed: false, time: 0, duration: 0 });
    let url = urls.get(id);
    if (!url) {
      const blob = await load().catch(() => null);
      if (get().current !== id) return;
      if (!blob) return set({ loading: false, failed: true });
      const type = playableType(name, blob.type);
      url = URL.createObjectURL(type && type !== blob.type ? new Blob([blob], { type }) : blob);
      urls.set(id, url);
    }
    if (get().current !== id) return;
    el.src = url;
    set({ loading: false });
    await el.play().catch(() => set({ failed: true }));
  },
  seek: (seconds) => {
    if (audio && Number.isFinite(seconds)) audio.currentTime = Math.max(0, seconds);
  },
  stop: () => {
    audio?.pause();
    set({ current: null, playing: false, loading: false, failed: false, time: 0, duration: 0 });
  },
}));

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
