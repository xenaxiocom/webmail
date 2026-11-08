"use client";

// Step 139: a voice message in Rooms — ▶/⏸, the waveform (click to jump),
// the time and, below, its transcript: being made, the text (long ones folded),
// copy, another language and "transcribe again", or why there is none.
import { IconCopy, IconDownload, IconLoader2, IconPlayerPauseFilled, IconPlayerPlayFilled, IconRefresh } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { formatTime, useAudioPlayer } from "@/lib/xenaxio/audio-player";
import { mediaUrl } from "@/lib/xenaxio/chat/api";
import { voiceOf, WAVEFORM_BARS } from "@/lib/xenaxio/chat/voice";
import { useVoiceTexts } from "@/lib/xenaxio/chat/voice-texts";
import { useXT } from "@/lib/xenaxio/i18n";
import { toast } from "@/stores/toast-store";

/** Languages offered when the detected one was wrong (ISO 639-1), as in Files. */
const LANGUAGES = ["de", "en", "ru", "uk", "pl", "ro", "tr", "ar", "fr", "es", "it", "nl", "pt", "bg", "hr", "sr", "hu", "cs"];
/** Errors with their own message; others read "did not work". */
const KNOWN_ERRORS = new Set(["audio_refused", "audio_too_large", "transcription_failed", "voice_download_failed", "demo_ai_limit", "rate_limited", "message_not_found", "network"]);
const KNOWN_REASONS = new Set(["ai_disabled", "transcription_off", "ai_not_configured", "transcription_model_missing", "speech_server_missing", "ai_limit_reached", "free_limit_reached"]);
/** A transcript longer than this is folded. */
const FOLD_CHARS = 280;

/** Bars to draw: the message's waveform squeezed or stretched, or a flat line. */
export function bars(waveform: number[], count = WAVEFORM_BARS): number[] {
  if (waveform.length === 0) return Array.from({ length: count }, () => 0.15);
  return Array.from({ length: count }, (_, i) => {
    const v = waveform[Math.min(waveform.length - 1, Math.floor((i * waveform.length) / count))] ?? 0;
    return Math.max(0.12, Math.min(1, v / 1024));
  });
}

export function VoiceMessage({ content, roomId, eventId, ts }: { content: Record<string, unknown>; roomId: string; eventId: string; ts: number }) {
  const t = useXT();
  const voice = voiceOf(content);
  const mxc = voice?.mxc ?? "";
  const id = `chat:${mxc}`;
  const stream = mediaUrl(mxc);
  const download = mediaUrl(mxc, { filename: voice?.name ?? "voice" });
  const playing = useAudioPlayer((s) => s.current === id && s.playing);
  const loading = useAudioPlayer((s) => s.current === id && s.loading);
  const failed = useAudioPlayer((s) => s.current === id && s.failed);
  const time = useAudioPlayer((s) => (s.current === id ? s.time : 0));
  const played = useAudioPlayer((s) => (s.current === id ? s.duration : 0));
  const toggle = useAudioPlayer((s) => s.toggle);
  const seek = useAudioPlayer((s) => s.seek);
  const duration = played || (voice?.durationMs ? voice.durationMs / 1000 : 0);
  const heights = useMemo(() => bars(voice?.waveform ?? []), [voice?.waveform]);
  const progress = duration ? Math.min(1, time / duration) : 0;

  const want = useVoiceTexts((s) => s.want);
  useEffect(() => {
    // While it is being sent it has no event id yet ("~…").
    if (mxc && !eventId.startsWith("~")) want(mxc, { roomId, eventId, ts });
  }, [mxc, roomId, eventId, ts, want]);

  if (!voice || !stream) return null;
  const play = () => void toggle(id, voice.name, async () => (await fetch(stream, { credentials: "same-origin" })).blob());
  const label = playing ? t("chat.voice_pause") : t("chat.voice_play");
  return (
    <div className="mt-1 w-full max-w-sm">
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/40 px-2 py-1.5">
        <button
          type="button"
          onClick={play}
          aria-label={label}
          title={label}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {loading ? <IconLoader2 size={16} className="animate-spin" /> : playing ? <IconPlayerPauseFilled size={14} /> : <IconPlayerPlayFilled size={14} className="ms-px" />}
        </button>
        <div
          role="slider"
          tabIndex={0}
          aria-label={t("chat.voice_message")}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          className="flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-[2px]"
          onClick={(e) => {
            if (useAudioPlayer.getState().current !== id || !duration) return play();
            const box = e.currentTarget.getBoundingClientRect();
            seek(((e.clientX - box.left) / box.width) * duration);
          }}
          onKeyDown={(e) => {
            if (useAudioPlayer.getState().current !== id) return;
            if (e.key === "ArrowRight") seek(time + 5);
            if (e.key === "ArrowLeft") seek(time - 5);
          }}
        >
          {heights.map((h, i) => (
            <span
              key={i}
              aria-hidden
              className={cn("min-w-[2px] flex-1 rounded-full", i / heights.length < progress ? "bg-primary" : "bg-muted-foreground/40")}
              style={{ height: `${Math.round(h * 100)}%` }}
            />
          ))}
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatTime(time > 0 ? time : duration)}</span>
        {download && (
          <a href={download} download={voice.name} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={t("chat.download")} title={t("chat.download")}>
            <IconDownload size={14} />
          </a>
        )}
      </div>
      {failed && <div className="mt-1 text-xs text-destructive">{t("chat.voice_cannot_play")}</div>}
      <VoiceTranscript mxc={mxc} roomId={roomId} eventId={eventId} />
    </div>
  );
}

function VoiceTranscript({ mxc, roomId, eventId }: { mxc: string; roomId: string; eventId: string }) {
  const t = useXT();
  const transcript = useVoiceTexts((s) => s.byMxc[mxc]);
  const asked = useVoiceTexts((s) => !!s.asked[mxc]);
  const busy = useVoiceTexts((s) => !!s.busy[mxc]);
  const error = useVoiceTexts((s) => s.errors[mxc] ?? "");
  const available = useVoiceTexts((s) => s.available);
  const reason = useVoiceTexts((s) => s.reason);
  const transcribe = useVoiceTexts((s) => s.transcribe);
  const [open, setOpen] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const message = { roomId, eventId };
  const errorText = error ? t(`chat.voice_errors.${KNOWN_ERRORS.has(error) ? error : "internal"}`) : "";

  if (busy || transcript?.state === "pending") {
    return (
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
        <IconLoader2 size={12} className="animate-spin" />
        {t("chat.voice_transcribing")}
      </div>
    );
  }
  if (transcript?.state === "done") {
    const text = transcript.text?.trim() ?? "";
    const long = text.length > FOLD_CHARS;
    return (
      <div className="mt-1 rounded-md border-l-2 border-primary/40 bg-muted/30 px-2.5 py-1.5 text-sm">
        {text ? (
          <p className={cn("whitespace-pre-wrap break-words", long && !open && "line-clamp-4")}>{text}</p>
        ) : (
          <p className="text-xs italic text-muted-foreground">{t("chat.voice_no_speech")}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {long && (
            <button type="button" className="hover:text-foreground hover:underline" onClick={() => setOpen(!open)}>
              {open ? t("chat.voice_less") : t("chat.voice_more")}
            </button>
          )}
          {transcript.language && <span>{languageName(transcript.language)}</span>}
          {text && (
            <button
              type="button"
              className="inline-flex items-center gap-1 hover:text-foreground"
              onClick={() => void navigator.clipboard?.writeText(text).then(() => toast.success(t("common.copied")), () => undefined)}
            >
              <IconCopy size={12} />
              {t("common.copy")}
            </button>
          )}
          {available && (choosing ? <LanguagePicker onPick={(language) => { setChoosing(false); void transcribe(mxc, message, language ? { language } : { again: true }); }} onClose={() => setChoosing(false)} /> : (
            <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setChoosing(true)}>
              <IconRefresh size={12} />
              {t("chat.voice_again")}
            </button>
          ))}
        </div>
        {errorText && <div className="mt-1 text-xs text-destructive">{errorText}</div>}
      </div>
    );
  }
  // No text: why, or the button (failed before, or older than a day).
  if (!asked) return null;
  if (!available) {
    return reason && KNOWN_REASONS.has(reason) ? <div className="mt-1 text-xs text-muted-foreground">{t(`chat.voice_unavailable.${reason}`)}</div> : null;
  }
  const failedBefore = transcript?.state === "failed" ? t(`chat.voice_errors.${KNOWN_ERRORS.has(transcript.error ?? "") ? transcript.error : "internal"}`) : "";
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
      {(errorText || failedBefore) && <span className="text-destructive">{errorText || failedBefore}</span>}
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() => void transcribe(mxc, message, transcript?.state === "failed" ? { again: true } : {})}
      >
        {transcript?.state === "failed" ? <IconRefresh size={12} /> : null}
        {transcript?.state === "failed" ? t("chat.voice_again") : t("chat.voice_transcribe")}
      </button>
    </div>
  );
}

function LanguagePicker({ onPick, onClose }: { onPick: (language: string) => void; onClose: () => void }) {
  const t = useXT();
  return (
    <select
      autoFocus
      aria-label={t("chat.voice_language")}
      defaultValue="-"
      className="h-6 rounded border border-border bg-background px-1 text-xs text-foreground"
      onBlur={onClose}
      onChange={(e) => {
        if (e.target.value !== "-") onPick(e.target.value);
      }}
    >
      <option value="-" disabled>
        {t("chat.voice_language")}…
      </option>
      <option value="">{t("chat.voice_language_auto")}</option>
      {LANGUAGES.map((code) => (
        <option key={code} value={code}>
          {languageName(code)}
        </option>
      ))}
    </select>
  );
}

/** "Deutsch", "українська": each language in its own name. */
function languageName(code: string): string {
  try {
    return new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
