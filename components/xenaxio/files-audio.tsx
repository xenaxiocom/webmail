"use client";

// Step 86: audio files in Files — play right in the list (no preview window)
// and the transcript next to the file: in the details panel, with the language
// detected or chosen and "transcribe again".
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Copy, FileText, Loader2, Pause, Play, RefreshCw } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatTime, useAudioPlayer } from "@/lib/xenaxio/audio-player";
import { XENAXIO_BFF } from "@/lib/xenaxio/bff";
import { useXT } from "@/lib/xenaxio/i18n";
import { transcriptKey, useTranscripts } from "@/lib/xenaxio/transcripts";
import type { FileResource } from "@/stores/file-store";

/** Languages offered when the detected one was wrong (ISO 639-1). */
const LANGUAGES = ["de", "en", "ru", "uk", "fr", "es", "it", "pl", "tr", "nl", "pt", "ar"];

/** Errors with their own message; others read "did not work". */
const KNOWN_ERRORS = new Set([
  "ai_disabled", "transcription_off", "ai_not_configured", "transcription_model_missing", "ai_limit_reached",
  "audio_too_large", "audio_refused", "transcription_failed", "demo_ai_limit", "rate_limited", "file_not_found", "network",
]);

/**
 * Texts of the audio files among the folder's resources, again whenever the
 * listing is refreshed (a text made meanwhile by the assistant or a colleague).
 */
export function useTranscriptLookup(resources: FileResource[]): void {
  const lookup = useTranscripts((s) => s.lookup);
  useEffect(() => {
    if (XENAXIO_BFF) void lookup(resources);
  }, [resources, lookup]);
  // Leaving Files stops the sound.
  useEffect(() => () => useAudioPlayer.getState().stop(), []);
}

/** ▶/⏸ in place of the file's icon; `onToggle` is the row's "open". */
export function AudioPlayButton({ resource, onToggle, className }: { resource: FileResource; onToggle: () => void; className?: string }) {
  const t = useXT();
  const current = useAudioPlayer((s) => s.current === resource.id);
  const playing = useAudioPlayer((s) => s.current === resource.id && s.playing);
  const loading = useAudioPlayer((s) => s.current === resource.id && s.loading);
  const label = playing ? t("files_audio.pause", { name: resource.name }) : t("files_audio.play", { name: resource.name });
  return (
    <button
      type="button"
      data-item-action
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      className={cn(
        "shrink-0 inline-flex items-center justify-center rounded-full transition-colors",
        current ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20",
        className ?? "w-6 h-6",
      )}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ms-px" />}
    </button>
  );
}

/** Bar and time under the name while this file is the one playing. */
export function AudioProgress({ resource, className }: { resource: FileResource; className?: string }) {
  const t = useXT();
  const current = useAudioPlayer((s) => s.current === resource.id);
  const time = useAudioPlayer((s) => (s.current === resource.id ? s.time : 0));
  const duration = useAudioPlayer((s) => (s.current === resource.id ? s.duration : 0));
  const failed = useAudioPlayer((s) => s.current === resource.id && s.failed);
  const seek = useAudioPlayer((s) => s.seek);
  if (!current) return null;
  if (failed) return <div className={cn("text-xs text-destructive", className)}>{t("files_audio.cannot_play")}</div>;
  return (
    <div className={cn("flex items-center gap-2 min-w-0", className)} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={Math.min(time, duration || 0)}
        onChange={(e) => seek(Number(e.target.value))}
        aria-label={t("files_audio.position")}
        className="flex-1 min-w-0 h-1 accent-primary cursor-pointer"
      />
      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
        {formatTime(time)} / {formatTime(duration)}
      </span>
    </div>
  );
}

/**
 * In the file's row: the transcript icon when the file has a text (opens it in
 * the details panel), else a "Transcribe" button; a spinner while it runs.
 */
export function TranscriptAction({ resource, onShow }: { resource: FileResource; onShow: () => void }) {
  const t = useXT();
  const key = transcriptKey(resource);
  const transcript = useTranscripts((s) => s.byKey[key]);
  const busy = useTranscripts((s) => !!s.busy[key]);
  const error = useTranscripts((s) => s.errors[key] ?? "");
  const available = useTranscripts((s) => s.available || !s.known);
  const maxBytes = useTranscripts((s) => s.maxBytes);
  const transcribe = useTranscripts((s) => s.transcribe);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  if (busy) {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground" title={t("files_audio.transcribing")}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      </span>
    );
  }
  if (transcript) {
    const preview = transcript.text.length > 200 ? `${transcript.text.slice(0, 200)}…` : transcript.text;
    return (
      <button
        type="button"
        data-item-action
        onClick={(e) => {
          stop(e);
          onShow();
        }}
        onDoubleClick={stop}
        title={preview || t("files_audio.no_speech")}
        aria-label={t("files_audio.show_transcript", { name: resource.name })}
        className="shrink-0 p-0.5 rounded text-primary hover:bg-primary/10"
      >
        <FileText className="w-3.5 h-3.5" />
      </button>
    );
  }
  if (!available || (maxBytes > 0 && resource.contentLength > maxBytes)) return null;
  return (
    <button
      type="button"
      data-item-action
      onClick={(e) => {
        stop(e);
        void transcribe(resource).then(() => {
          if (useTranscripts.getState().byKey[key]) onShow();
        });
      }}
      onDoubleClick={stop}
      title={error ? t(`files_audio.errors.${KNOWN_ERRORS.has(error) ? error : "internal"}`) : t("files_audio.transcribe")}
      className={cn(
        "shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs border transition-colors",
        error ? "border-destructive/40 text-destructive" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted",
      )}
    >
      <FileText className="w-3 h-3" />
      {t("files_audio.transcribe")}
    </button>
  );
}

/** The start of the transcript under the file's name; opens the whole text. */
export function TranscriptLine({ resource, onShow }: { resource: FileResource; onShow: () => void }) {
  const t = useXT();
  const transcript = useTranscripts((s) => s.byKey[transcriptKey(resource)]);
  if (!transcript) return null;
  return (
    <button
      type="button"
      data-item-action
      onClick={(e) => {
        e.stopPropagation();
        onShow();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      className="block w-full truncate text-start text-xs text-muted-foreground hover:text-foreground"
      title={t("files_audio.show_transcript", { name: resource.name })}
    >
      {transcript.text || t("files_audio.no_speech")}
    </button>
  );
}

function languageName(locale: string, code: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** The details panel of an audio file: player, transcript, language and "again". */
export function AudioDetails({ resource, onToggle }: { resource: FileResource; onToggle: () => void }) {
  const t = useXT();
  const locale = useLocale();
  const key = transcriptKey(resource);
  const transcript = useTranscripts((s) => s.byKey[key]);
  const busy = useTranscripts((s) => !!s.busy[key]);
  const error = useTranscripts((s) => s.errors[key] ?? "");
  const available = useTranscripts((s) => s.available || !s.known);
  const reason = useTranscripts((s) => s.reason);
  const maxBytes = useTranscripts((s) => s.maxBytes);
  const transcribe = useTranscripts((s) => s.transcribe);
  const [language, setLanguage] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => setLanguage(transcript?.manual ? (transcript.language ?? "") : ""), [key, transcript?.manual, transcript?.language]);

  const tooLarge = maxBytes > 0 && resource.contentLength > maxBytes;
  const copy = async () => {
    if (!transcript) return;
    await navigator.clipboard.writeText(transcript.text).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="space-y-3" aria-label={t("files_audio.title")}>
      <div className="flex items-center gap-2">
        <AudioPlayButton resource={resource} onToggle={onToggle} className="w-8 h-8" />
        <AudioProgress resource={resource} className="flex-1" />
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("files_audio.transcript")}</div>
        {busy ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> {t("files_audio.transcribing")}
          </div>
        ) : transcript ? (
          <>
            <p className="text-sm whitespace-pre-wrap break-words max-h-80 overflow-auto select-text">{transcript.text || t("files_audio.no_speech")}</p>
            <div className="text-xs text-muted-foreground">
              {transcript.language
                ? t(transcript.manual ? "files_audio.language_chosen" : "files_audio.language_detected", { language: languageName(locale, transcript.language) })
                : null}
            </div>
            {transcript.text && (
              <Button variant="ghost" size="sm" onClick={() => void copy()}>
                <Copy className="w-4 h-4 me-1.5" /> {copied ? t("files_audio.copied") : t("files_audio.copy")}
              </Button>
            )}
          </>
        ) : (
          !available && reason && <p className="text-xs text-muted-foreground">{t(`files_audio.unavailable.${reason}`)}</p>
        )}

        {error && <p className="text-xs text-destructive">{t(`files_audio.errors.${KNOWN_ERRORS.has(error) ? error : "internal"}`)}</p>}
        {tooLarge && !transcript && <p className="text-xs text-muted-foreground">{t("files_audio.errors.audio_too_large")}</p>}

        {available && !busy && !tooLarge && (
          <div className="space-y-2">
            {transcript && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                {t("files_audio.language")}
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="h-7 rounded-md border border-input bg-background px-1.5 text-xs text-foreground"
                >
                  <option value="">{t("files_audio.language_auto")}</option>
                  {LANGUAGES.map((code) => (
                    <option key={code} value={code}>
                      {languageName(locale, code)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button size="sm" variant={transcript ? "outline" : "default"} onClick={() => void transcribe(resource, language || undefined)}>
              {transcript ? <RefreshCw className="w-4 h-4 me-1.5" /> : <FileText className="w-4 h-4 me-1.5" />}
              {transcript ? t("files_audio.again") : t("files_audio.transcribe")}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
