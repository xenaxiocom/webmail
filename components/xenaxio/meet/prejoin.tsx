"use client";

// xenaxio step 78: before entering — the own camera picture, microphone level,
// devices, and the name (guests). Nothing is sent before "Join".
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMediaDevices, usePreviewTracks } from "@livekit/components-react";
import { type LocalAudioTrack, type LocalVideoTrack, Track } from "livekit-client";
import { MeetBackgroundIcon, Mic, MicOff, Video, VideoOff } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MeetBackground } from "@/lib/xenaxio/meet";
import { BackgroundPicker, backgroundsSupported, useBackgroundChoice, useBackgroundEffect } from "./background";
import { useMeetLang } from "./lang";

export interface Choices {
  name: string;
  video: boolean;
  audio: boolean;
  videoDeviceId: string;
  audioDeviceId: string;
}

const CHOICES_KEY = "xenaxio-meet-devices";

function savedChoices(): Partial<Choices> {
  try {
    return JSON.parse(localStorage.getItem(CHOICES_KEY) ?? "{}") as Partial<Choices>;
  } catch {
    return {};
  }
}

function saveChoices(c: Choices) {
  try {
    localStorage.setItem(CHOICES_KEY, JSON.stringify({ ...c, name: undefined }));
  } catch {
    // No storage: chosen again next time.
  }
}

/** A round button that turns camera or microphone on and off. */
export function MediaButton({ on, onClick, label, kind, disabled }: { on: boolean; onClick: () => void; label: string; kind: "audio" | "video"; disabled?: boolean }) {
  const Icon = kind === "audio" ? (on ? Mic : MicOff) : on ? Video : VideoOff;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={cn(
        "h-12 w-12 rounded-full flex items-center justify-center transition-colors disabled:opacity-50",
        on ? "bg-white/15 text-white hover:bg-white/25" : "bg-red-600 text-white hover:bg-red-700",
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

function DeviceSelect({ kind, value, onChange, label }: { kind: MediaDeviceKind; value: string; onChange: (id: string) => void; label: string }) {
  const devices = useMediaDevices({ kind });
  if (devices.length < 2) return null;
  return (
    <label className="block text-xs text-white/70">
      {label}
      <select
        className="mt-1 block w-full rounded-md bg-white/10 px-2 py-1.5 text-sm text-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId} className="text-black">
            {d.label || d.deviceId.slice(0, 8)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PreJoin({
  askName,
  defaultName,
  submitLabel,
  busy,
  onSubmit,
  companyBackground,
}: {
  askName: boolean;
  defaultName: string;
  submitLabel: string;
  busy: boolean;
  onSubmit: (c: Choices) => void;
  /** Step 89: the company's background picture (its own people only). */
  companyBackground?: MeetBackground | null;
}) {
  const { t } = useMeetLang();
  const saved = useRef(savedChoices()).current;
  const [name, setName] = useState(defaultName);
  const [video, setVideo] = useState(saved.video ?? true);
  const [audio, setAudio] = useState(saved.audio ?? true);
  const [videoDeviceId, setVideoDeviceId] = useState(saved.videoDeviceId ?? "");
  const [audioDeviceId, setAudioDeviceId] = useState(saved.audioDeviceId ?? "");
  const [deviceError, setDeviceError] = useState(false);

  // Both must stay the same object between renders: the hook opens camera and
  // microphone again whenever they change (the level meter renders every frame).
  const onDeviceError = useCallback(() => setDeviceError(true), []);
  const trackOptions = useMemo(
    () => ({
      audio: audio ? { deviceId: audioDeviceId || undefined } : false,
      video: video ? { deviceId: videoDeviceId || undefined } : false,
    }),
    [audio, audioDeviceId, video, videoDeviceId],
  );
  const tracks = usePreviewTracks(trackOptions, onDeviceError);
  const videoTrack = tracks?.find((tr) => tr.kind === Track.Kind.Video) as LocalVideoTrack | undefined;
  const audioTrack = tracks?.find((tr) => tr.kind === Track.Kind.Audio) as LocalAudioTrack | undefined;
  // Step 89: the background, seen here before entering; the meeting puts the same one on its camera.
  const [canBackground] = useState(backgroundsSupported);
  const [pickerOpen, setPickerOpen] = useState(false);
  const background = useBackgroundChoice(companyBackground);
  const effect = useBackgroundEffect(canBackground ? videoTrack : undefined, background.choice, background.url);
  const videoEl = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = videoEl.current;
    if (!el || !videoTrack) return;
    videoTrack.attach(el);
    return () => {
      videoTrack.detach(el);
    };
  }, [videoTrack]);

  // The microphone level, so people see they are heard.
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!audioTrack?.mediaStreamTrack) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    ctx.createMediaStreamSource(new MediaStream([audioTrack.mediaStreamTrack])).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;
    const tick = () => {
      analyser.getByteFrequencyData(data);
      setLevel(Math.min(1, data.reduce((a, b) => a + b, 0) / data.length / 80));
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      void ctx.close();
    };
  }, [audioTrack]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const choices = { name: name.trim(), video, audio, videoDeviceId: videoTrack?.mediaStreamTrack.getSettings().deviceId ?? videoDeviceId, audioDeviceId: audioTrack?.mediaStreamTrack.getSettings().deviceId ?? audioDeviceId };
    if (askName && !choices.name) return;
    saveChoices(choices);
    // The preview stops; the meeting opens its own camera and microphone.
    for (const tr of tracks ?? []) tr.stop();
    onSubmit(choices);
  };

  return (
    <form onSubmit={submit} className="w-full max-w-xl space-y-4">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
        {video && videoTrack ? (
          <video ref={videoEl} muted playsInline className="h-full w-full object-cover [transform:scaleX(-1)]" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-white/60">{video ? t("camera_starting") : t("camera_off")}</div>
        )}
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-3">
          <MediaButton kind="audio" on={audio} onClick={() => setAudio((v) => !v)} label={audio ? t("mic_off") : t("mic_on")} />
          <MediaButton kind="video" on={video} onClick={() => setVideo((v) => !v)} label={video ? t("camera_off_action") : t("camera_on")} />
          {canBackground && video && (
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              aria-pressed={pickerOpen}
              aria-label={t("background")}
              title={t("background")}
              className={cn("flex h-12 w-12 items-center justify-center rounded-full text-white transition-colors", pickerOpen || background.choice.kind !== "none" ? "bg-[var(--meet-accent,#2563eb)]" : "bg-white/15 hover:bg-white/25")}
            >
              <MeetBackgroundIcon className="h-5 w-5" />
            </button>
          )}
        </div>
        {audio && (
          <div className="absolute left-3 top-3 h-1.5 w-24 overflow-hidden rounded-full bg-white/20" aria-hidden>
            <div className="h-full bg-green-400 transition-[width]" style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
        )}
      </div>
      {deviceError && <p className="text-sm text-amber-300">{t("no_devices")}</p>}
      {canBackground && video && pickerOpen && (
        <section className="space-y-2">
          <h2 className="text-xs text-white/70">{t("background")}</h2>
          <BackgroundPicker
            choice={background.choice}
            onChoose={background.choose}
            company={companyBackground}
            own={background.own}
            onOwnPicture={background.setOwnPicture}
            failed={effect.failed}
            busy={effect.busy}
          />
        </section>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <DeviceSelect kind="videoinput" value={videoDeviceId} onChange={setVideoDeviceId} label={t("camera")} />
        <DeviceSelect kind="audioinput" value={audioDeviceId} onChange={setAudioDeviceId} label={t("microphone")} />
      </div>
      {askName && (
        <label className="block text-sm text-white/80">
          {t("your_name")}
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoComplete="name" className="mt-1 bg-white text-black" />
        </label>
      )}
      <button
        type="submit"
        disabled={busy || (askName && !name.trim())}
        className="w-full rounded-lg bg-[var(--meet-accent,#2563eb)] px-4 py-3 font-medium text-[var(--meet-accent-text,#fff)] disabled:opacity-50"
      >
        {submitLabel}
      </button>
    </form>
  );
}
