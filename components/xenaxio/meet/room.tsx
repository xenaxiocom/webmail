"use client";

// xenaxio step 78: inside the meeting. LiveKit's tiles and layouts
// (@livekit/components-react, Apache-2.0) with our own controls and panels:
// grid with pages or the speaker view, screen sharing, hand, reactions, the
// people (and for the company: the lobby, mute, remove), the meeting chat,
// devices, full screen. The meeting chat and hands are not stored anywhere.
//
// Step 79: a webinar. Viewers see only the stage (hosts and presenters), send
// no video or sound, and raise a hand or react through the platform; hosts see
// the hands, bring viewers onto the stage and take them off, name co-hosts.
//
// Step 90, part C: recording. Only the one who started the meeting switches
// it; everyone sees an alert when it starts (and on coming in while it runs)
// and a red bar while it runs.
import "@livekit/components-styles";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CarouselLayout,
  ConnectionQualityIndicator,
  FocusLayout,
  FocusLayoutContainer,
  GridLayout,
  LiveKitRoom,
  ParticipantName,
  ParticipantTile,
  RoomAudioRenderer,
  TrackMutedIndicator,
  VideoTrack,
  isTrackReference,
  useChat,
  useConnectionState,
  useDataChannel,
  useEnsureTrackRef,
  useIsSpeaking,
  useLocalParticipant,
  useMediaDevices,
  useParticipants,
  useRoomContext,
  useStartAudio,
  useTrackToggle,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { ConnectionState, DisconnectReason, type LocalVideoTrack, type Participant, RoomEvent, Track } from "livekit-client";
import {
  Copy,
  Hand,
  LayoutGrid,
  Maximize2,
  MeetBackgroundIcon,
  Minimize2,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  Record,
  ScreenShare,
  Settings,
  Smile,
  SwitchCamera,
  UserX,
  Users,
  Video,
  VideoOff,
  X,
} from "@/components/icons";
import { cn } from "@/lib/utils";
import { type GuestKey, isGuest, type LobbyGuest, meet, type MeetBackground, type MeetingKind, type MeetingRole, meetingLink, signalUrl, type WebinarStage } from "@/lib/xenaxio/meet";
import { XenaxioApiError } from "@/lib/xenaxio/api";
import { showsVideo } from "@/lib/xenaxio/meet-call";
import type { Choices } from "./prejoin";
import { BackgroundPicker, backgroundsSupported, useBackgroundChoice, useBackgroundEffect } from "./background";
import { meetError, useMeetLang } from "./lang";
import { useWebinarLive, WebinarPanel } from "./webinar-panel";

export type LeaveReason = "left" | "removed" | "ended" | "lost" | "full" | "failed";

const HAND_TOPIC = "xen.hand";
const REACTION_TOPIC = "xen.reaction";
/** Step 79: the platform tells who went onto the stage or off it. */
const STAGE_TOPIC = "xen.stage";
/** Step 90: the platform tells everyone when recording starts and stops. */
const RECORDING_TOPIC = "xen.recording";
const REACTIONS = ["👍", "👏", "😂", "❤️", "🎉", "😮"];
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Step 79: in a webinar only those with the right to send are on the stage. */
function onStage(p: Participant): boolean {
  return p.permissions ? p.permissions.canPublish : true;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

/** One tile: video or initials, name, muted microphone, hand, connection. */
function Tile({ hands }: { hands: Set<string> }) {
  const trackRef = useEnsureTrackRef();
  const { t } = useMeetLang();
  const speaking = useIsSpeaking(trackRef.participant);
  const p = trackRef.participant;
  const screen = trackRef.source === Track.Source.ScreenShare;
  const hasVideo = isTrackReference(trackRef) && !trackRef.publication.isMuted && trackRef.publication.isSubscribed !== false;
  const name = p.name || p.identity;
  return (
    <ParticipantTile trackRef={trackRef} data-lk-speaking={speaking && !screen} className="!rounded-xl">
      {hasVideo ? (
        <VideoTrack trackRef={trackRef} className={screen ? "!object-contain" : undefined} />
      ) : (
        <div className="lk-participant-placeholder flex items-center justify-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/15 text-2xl font-semibold text-white">{initials(name)}</span>
        </div>
      )}
      <div className="lk-participant-metadata">
        <div className="lk-participant-metadata-item">
          {!screen && <TrackMutedIndicator trackRef={{ participant: p, source: Track.Source.Microphone }} show="muted" />}
          {screen ? <span>{t("screen_of", { name })}</span> : <ParticipantName />}
          {p.isLocal && <span className="opacity-70"> {t("you")}</span>}
          {isGuest(p.identity) && <span className="ml-1 rounded bg-white/20 px-1 text-[10px] uppercase">{t("guest")}</span>}
          {hands.has(p.identity) && !screen && (
            <span className="ml-1" aria-label={t("hand_raised_short")}>
              ✋
            </span>
          )}
        </div>
        <ConnectionQualityIndicator className="lk-participant-metadata-item" />
      </div>
    </ParticipantTile>
  );
}

/** Grid with pages, or one person big (speaker view, a shared screen, a pinned tile). */
function Stage({
  layout,
  hands,
  pinned,
  setPinned,
  compact = false,
  stageOnly = false,
}: {
  layout: "grid" | "speaker";
  hands: Set<string>;
  pinned: string | null;
  setPinned: (id: string | null) => void;
  /** The dock of a call: only the one who speaks (or a shared screen), no strip of the others. */
  compact?: boolean;
  /** Step 79: a webinar shows its stage only, not the viewers. */
  stageOnly?: boolean;
}) {
  const { t } = useMeetLang();
  const all = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { updateOnlyOn: [RoomEvent.ActiveSpeakersChanged], onlySubscribed: false },
  );
  const tracks = stageOnly ? all.filter((tr) => onStage(tr.participant)) : all;
  const room = useRoomContext();
  const screen = tracks.find((tr) => isTrackReference(tr) && tr.publication.source === Track.Source.ScreenShare);
  const key = (tr: TrackReferenceOrPlaceholder) => `${tr.participant.identity}:${tr.source}`;
  const speaker = useMemo(() => {
    if (layout !== "speaker") return undefined;
    const active = room.activeSpeakers.find((p) => !p.isLocal) ?? room.activeSpeakers[0];
    return tracks.find((tr) => tr.source === Track.Source.Camera && tr.participant.identity === active?.identity) ?? tracks.find((tr) => !tr.participant.isLocal) ?? tracks[0];
    // Recomputed whenever the tracks change (active speakers are part of that).
  }, [layout, room, tracks]);
  const focus = (pinned && tracks.find((tr) => key(tr) === pinned)) || screen || speaker;
  const click = (tr: TrackReferenceOrPlaceholder) => setPinned(pinned === key(tr) ? null : key(tr));

  if (stageOnly && tracks.length === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-white/60">{t("stage_empty")}</div>;
  }
  if (compact && focus) {
    return (
      <div className="h-full">
        <FocusLayout trackRef={focus} />
      </div>
    );
  }
  if (focus && tracks.length > 1) {
    const others = tracks.filter((tr) => key(tr) !== key(focus));
    return (
      <FocusLayoutContainer className="h-full">
        <CarouselLayout tracks={others}>
          <ClickableTile hands={hands} onClick={click} />
        </CarouselLayout>
        <FocusLayout trackRef={focus} onParticipantClick={() => setPinned(null)} />
      </FocusLayoutContainer>
    );
  }
  return (
    // A webinar's stage changes who is in the list: a new grid then (its stable pages would look for the old tiles).
    <GridLayout key={stageOnly ? tracks.map(key).join("|") : undefined} tracks={tracks} className="h-full">
      <ClickableTile hands={hands} onClick={click} />
    </GridLayout>
  );
}

/** Step 117: a call's dock without video — everyone as a face; who speaks lights up. */
function VoiceStrip({ hands }: { hands: Set<string> }) {
  const people = useParticipants();
  return (
    <ul className="flex h-full items-center gap-2 overflow-x-auto px-2 py-1">
      {people.map((p) => (
        <VoiceFace key={p.identity} participant={p} hand={hands.has(p.identity)} />
      ))}
    </ul>
  );
}

function VoiceFace({ participant: p, hand }: { participant: Participant; hand: boolean }) {
  const { t } = useMeetLang();
  const speaking = useIsSpeaking(p);
  const name = p.name || p.identity;
  return (
    <li className="flex w-14 shrink-0 flex-col items-center gap-1" title={name} data-speaking={speaking || undefined}>
      <span className={cn("relative flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-sm font-semibold ring-2 transition-shadow", speaking ? "ring-green-500" : "ring-transparent")}>
        {initials(name)}
        <span className="absolute -bottom-1 -right-1 [&_svg]:h-3.5 [&_svg]:w-3.5">
          <TrackMutedIndicator trackRef={{ participant: p, source: Track.Source.Microphone }} show="muted" />
        </span>
        {hand && (
          <span className="absolute -right-1 -top-1 text-sm" aria-label={t("hand_raised_short")}>
            ✋
          </span>
        )}
      </span>
      <span className="w-full truncate text-center text-[11px] text-white/80">{p.isLocal ? t("you_short") : name.split(/\s+/)[0]}</span>
    </li>
  );
}

function ClickableTile({ hands, onClick }: { hands: Set<string>; onClick: (tr: TrackReferenceOrPlaceholder) => void }) {
  const trackRef = useEnsureTrackRef();
  return (
    <div className="contents" onDoubleClick={() => onClick(trackRef)}>
      <Tile hands={hands} />
    </div>
  );
}

function RoundButton({
  label,
  onClick,
  active,
  danger,
  off,
  children,
  badge,
  disabled,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  off?: boolean;
  children: React.ReactNode;
  badge?: number;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className={cn(
        "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition-colors disabled:opacity-40",
        danger ? "bg-red-600 hover:bg-red-700" : off ? "bg-red-600/90 hover:bg-red-700" : active ? "bg-[var(--meet-accent,#2563eb)]" : "bg-white/10 hover:bg-white/20",
      )}
    >
      {children}
      {!!badge && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-amber-500 px-1 text-xs font-semibold leading-5">{badge}</span>}
    </button>
  );
}

function MediaToggle({ source }: { source: Track.Source.Microphone | Track.Source.Camera | Track.Source.ScreenShare }) {
  const { t } = useMeetLang();
  const { enabled, toggle, pending } = useTrackToggle({ source });
  if (source === Track.Source.ScreenShare) {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) return null;
    return (
      <RoundButton label={enabled ? t("stop_share") : t("share_screen")} onClick={() => void toggle()} active={enabled} disabled={pending}>
        <ScreenShare className="h-5 w-5" />
      </RoundButton>
    );
  }
  const mic = source === Track.Source.Microphone;
  const Icon = mic ? (enabled ? Mic : MicOff) : enabled ? Video : VideoOff;
  return (
    <RoundButton
      label={mic ? (enabled ? t("mic_off") : t("mic_on")) : enabled ? t("camera_off_action") : t("camera_on")}
      onClick={() => void toggle()}
      off={!enabled}
      disabled={pending}
    >
      <Icon className="h-5 w-5" />
    </RoundButton>
  );
}

function DevicePanel({ background }: { background?: ReactNode }) {
  const { t } = useMeetLang();
  const room = useRoomContext();
  const kinds: { kind: MediaDeviceKind; label: string }[] = [
    { kind: "videoinput", label: t("camera") },
    { kind: "audioinput", label: t("microphone") },
    { kind: "audiooutput", label: t("speaker") },
  ];
  return (
    <div className="space-y-3">
      {kinds.map((k) => (
        <DeviceRow key={k.kind} kind={k.kind} label={k.label} onChange={(id) => void room.switchActiveDevice(k.kind, id)} active={room.getActiveDevice(k.kind)} />
      ))}
      {/* Step 92: the background behind one's own camera. */}
      {background && (
        <section className="space-y-2 border-t border-white/10 pt-3">
          <h3 className="text-xs text-white/70">{t("background")}</h3>
          {background}
        </section>
      )}
    </div>
  );
}

function DeviceRow({ kind, label, onChange, active }: { kind: MediaDeviceKind; label: string; onChange: (id: string) => void; active?: string }) {
  const devices = useMediaDevices({ kind });
  const [value, setValue] = useState(active ?? "");
  // Choosing the speaker works only where the browser can (not in Safari and Firefox).
  if (devices.length === 0 || (kind === "audiooutput" && !("setSinkId" in HTMLMediaElement.prototype))) return null;
  return (
    <label className="block text-xs text-white/70">
      {label}
      <select
        className="mt-1 block w-full rounded-md bg-white/10 px-2 py-1.5 text-sm text-white"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onChange(e.target.value);
        }}
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

type MeetingChat = ReturnType<typeof useChat>;

/** The meeting chat; the messages are collected by the meeting itself, also while this panel is closed. */
function ChatPanel({ chat }: { chat: MeetingChat }) {
  const { t } = useMeetLang();
  const { send, chatMessages, isSending } = chat;
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  // Newer browsers return a promise from scrollIntoView: never hand it to React as a cleanup.
  useEffect(() => {
    void end.current?.scrollIntoView({ block: "end" });
  }, [chatMessages.length]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const message = text.trim();
    if (!message) return;
    setText("");
    void send(message);
  };
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {chatMessages.length === 0 && <p className="text-sm text-white/60">{t("chat_empty")}</p>}
        {chatMessages.map((m) => (
          <div key={m.id} className="text-sm">
            <span className="font-medium text-white">{m.from?.name || m.from?.identity}</span>{" "}
            <span className="text-xs text-white/50">{new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            <p className="whitespace-pre-wrap break-words text-white/90">{m.message}</p>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={submit} className="mt-2 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          placeholder={t("chat_placeholder")}
          className="min-w-0 flex-1 rounded-md bg-white/10 px-2 py-1.5 text-sm text-white placeholder:text-white/40"
        />
        <button type="submit" disabled={isSending || !text.trim()} className="rounded-md bg-[var(--meet-accent,#2563eb)] px-3 text-sm text-[var(--meet-accent-text,#fff)] disabled:opacity-50">
          {t("chat_send")}
        </button>
      </form>
    </div>
  );
}

function PeoplePanel({ code, member, hands, lobby, onDecide }: { code: string; member: boolean; hands: Set<string>; lobby: LobbyGuest[]; onDecide: (id: string, admit: boolean) => void }) {
  const { t } = useMeetLang();
  const people = useParticipants();
  const [error, setError] = useState<string | null>(null);
  const act = async (fn: () => Promise<unknown>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(meetError(t, err instanceof XenaxioApiError ? err.code : "internal"));
    }
  };
  return (
    <div className="space-y-4">
      {member && lobby.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">{t("lobby_title")}</h3>
          <ul className="space-y-2">
            {lobby.map((g) => (
              <li key={g.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{g.name}</span>
                <button type="button" onClick={() => onDecide(g.id, true)} className="rounded-md bg-green-600 px-2 py-1 text-xs">
                  {t("admit")}
                </button>
                <button type="button" onClick={() => onDecide(g.id, false)} className="rounded-md bg-white/10 px-2 py-1 text-xs">
                  {t("deny")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">{t(people.length === 1 ? "people_one" : "people", { count: people.length })}</h3>
        <ul className="space-y-1.5">
          {people.map((p: Participant) => {
            const name = p.name || p.identity;
            return (
              <li key={p.identity} className="flex items-center gap-2 text-sm">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs">{initials(name)}</span>
                <span className="min-w-0 flex-1 truncate">
                  {name}
                  {p.isLocal && <span className="text-white/60"> {t("you")}</span>}
                  {isGuest(p.identity) && <span className="ml-1 text-xs text-white/60">· {t("guest")}</span>}
                  {hands.has(p.identity) && <span className="ml-1">✋</span>}
                </span>
                {p.isMicrophoneEnabled ? <Mic className="h-4 w-4 text-white/70" /> : <MicOff className="h-4 w-4 text-white/40" />}
                {member && !p.isLocal && (
                  <>
                    {p.isMicrophoneEnabled && (
                      <button type="button" title={t("mute")} aria-label={t("mute")} onClick={() => void act(() => meet.mute(code, p.identity))} className="rounded p-1 hover:bg-white/10">
                        <MicOff className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      title={t("remove")}
                      aria-label={t("remove")}
                      onClick={() => void act(() => meet.remove(code, p.identity), t("remove_confirm", { name }))}
                      className="rounded p-1 hover:bg-white/10"
                    >
                      <UserX className="h-4 w-4" />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}

/**
 * Step 79: the people of a webinar. Hosts see the raised hands (from the
 * platform, also those raised before they came), the stage and the viewers,
 * and bring people onto the stage or take them off; viewers see the stage and
 * how many watch.
 */
function WebinarPeople({ code, host, hands }: { code: string; host: boolean; hands: Set<string> }) {
  const { t } = useMeetLang();
  const people = useParticipants();
  const [stage, setStage] = useState<WebinarStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!host) return;
    try {
      setStage(await meet.stage(code));
    } catch {
      // Next round.
    }
  }, [code, host]);
  useEffect(() => {
    void load();
    if (!host) return;
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [load, host, hands.size]);
  const act = async (fn: () => Promise<unknown>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(meetError(t, err instanceof XenaxioApiError ? err.code : "internal"));
    }
  };
  const front = people.filter(onStage);
  const viewers = people.filter((p) => !onStage(p));
  const hostIds = new Set(stage?.hosts.map((h) => h.identity) ?? []);
  const raised = stage ? stage.hands : viewers.filter((p) => hands.has(p.identity)).map((p) => ({ identity: p.identity, name: p.name || p.identity, since: "" }));
  const small = "rounded-md px-2 py-1 text-xs";
  const name = (p: Participant) => p.name || p.identity;
  return (
    <div className="space-y-4">
      {host && raised.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">{t("hands_title", { count: raised.length })}</h3>
          <ul className="space-y-2">
            {raised.map((h) => (
              <li key={h.identity} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">✋ {h.name}</span>
                <button type="button" onClick={() => void act(() => meet.setStage(code, h.identity, true))} className={cn(small, "bg-green-600")}>
                  {t("bring_on_stage")}
                </button>
                <button type="button" onClick={() => void act(() => meet.setStage(code, h.identity, false))} className={cn(small, "bg-white/10")}>
                  {t("lower_their_hand")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">{t("stage_title")}</h3>
        <ul className="space-y-1.5">
          {front.map((p) => (
            <li key={p.identity} className="flex items-center gap-2 text-sm">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs">{initials(name(p))}</span>
              <span className="min-w-0 flex-1 truncate">
                {name(p)}
                {p.isLocal && <span className="text-white/60"> {t("you")}</span>}
                {hostIds.has(p.identity) && <span className="ml-1 text-xs text-white/60">· {t("host")}</span>}
              </span>
              {p.isMicrophoneEnabled ? <Mic className="h-4 w-4 text-white/70" /> : <MicOff className="h-4 w-4 text-white/40" />}
              {host && !p.isLocal && (
                <>
                  {p.isMicrophoneEnabled && (
                    <button type="button" title={t("mute")} aria-label={t("mute")} onClick={() => void act(() => meet.mute(code, p.identity))} className="rounded p-1 hover:bg-white/10">
                      <MicOff className="h-4 w-4" />
                    </button>
                  )}
                  {hostIds.has(p.identity) ? (
                    !isGuest(p.identity) && (
                      <button type="button" onClick={() => void act(() => meet.setHost(code, p.identity, false))} className={cn(small, "bg-white/10")}>
                        {t("remove_cohost")}
                      </button>
                    )
                  ) : (
                    <button type="button" onClick={() => void act(() => meet.setStage(code, p.identity, false))} className={cn(small, "bg-white/10")}>
                      {t("take_off_stage")}
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">{t(viewers.length === 1 ? "viewers_one" : "viewers", { count: viewers.length })}</h3>
        {host && (
          <ul className="space-y-1.5">
            {viewers.map((p) => (
              <li key={p.identity} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {name(p)}
                  {p.isLocal && <span className="text-white/60"> {t("you")}</span>}
                  {isGuest(p.identity) && <span className="ml-1 text-xs text-white/60">· {t("guest")}</span>}
                  {hands.has(p.identity) && <span className="ml-1">✋</span>}
                </span>
                {!p.isLocal && (
                  <>
                    <button type="button" onClick={() => void act(() => meet.setStage(code, p.identity, true))} className={cn(small, "bg-white/10")}>
                      {t("bring_on_stage")}
                    </button>
                    {!isGuest(p.identity) && (
                      <button type="button" onClick={() => void act(() => meet.setHost(code, p.identity, true))} className={cn(small, "bg-white/10")}>
                        {t("make_cohost")}
                      </button>
                    )}
                    <button
                      type="button"
                      title={t("remove")}
                      aria-label={t("remove")}
                      onClick={() => void act(() => meet.remove(code, p.identity), t("remove_confirm", { name: name(p) }))}
                      className="rounded p-1 hover:bg-white/10"
                    >
                      <UserX className="h-4 w-4" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}

type Panel = "people" | "chat" | "devices" | "webinar" | null;

/**
 * Where the meeting shows: its own page; part D: a small dock over the chat
 * (a call keeps running while people write) or the whole screen.
 */
export type MeetingVariant = "page" | "dock" | "full";

function Meeting({
  code,
  member,
  title,
  onEnd,
  variant = "page",
  onResize,
  kind = "meeting",
  role = "member",
  guest = null,
  companyBackground,
  recordingAtStart = false,
}: {
  code: string;
  member: boolean;
  title: string;
  onEnd: () => void;
  variant?: MeetingVariant;
  onResize?: (full: boolean) => void;
  kind?: MeetingKind;
  role?: MeetingRole;
  guest?: GuestKey | null;
  companyBackground?: MeetBackground | null;
  recordingAtStart?: boolean;
}) {
  const dock = variant === "dock";
  const webinar = kind === "webinar";
  const { t } = useMeetLang();
  const room = useRoomContext();
  // Step 117: video in the dock only while someone shows a camera or a screen.
  const videoTracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], { onlySubscribed: false });
  const state = useConnectionState();
  const { localParticipant } = useLocalParticipant();
  const people = useParticipants();
  const [panel, setPanel] = useState<Panel>(null);
  const [layout, setLayout] = useState<"grid" | "speaker">("grid");
  const [pinned, setPinned] = useState<string | null>(null);
  const [hands, setHands] = useState<Set<string>>(new Set());
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [flying, setFlying] = useState<{ id: number; emoji: string; name: string }[]>([]);
  const [copied, setCopied] = useState(false);
  const [lobby, setLobby] = useState<LobbyGuest[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const audio = useStartAudio({ room, props: {} });
  const myHand = hands.has(localParticipant.identity);
  // Step 79: the role changes when a host brings this person onto the stage or takes them off.
  const [myRole, setMyRole] = useState<MeetingRole>(role);
  const sends = !webinar || myRole === "host" || myRole === "presenter";
  const moderator = webinar ? myRole === "host" : member;
  // Step 92: the background behind one's own camera. A call from Rooms does not know the
  // company's picture yet: people of the company ask the platform for it.
  const [company, setCompany] = useState<MeetBackground | null | undefined>(member ? companyBackground : null);
  useEffect(() => {
    if (company !== undefined) return;
    let stop = false;
    meet
      .status()
      .then((s) => !stop && setCompany(s.background ?? null))
      .catch(() => !stop && setCompany(null));
    return () => {
      stop = true;
    };
  }, [company]);
  const [canBackground] = useState(backgroundsSupported);
  const background = useBackgroundChoice(company);
  const { cameraTrack, isCameraEnabled } = useLocalParticipant();
  const camera = cameraTrack?.videoTrack as LocalVideoTrack | undefined;
  // Step 117: the background chosen in the dock too — it grows to show one's camera and the tiles.
  const [backgroundOpen, setBackgroundOpen] = useState(false);
  const effect = useBackgroundEffect(canBackground && sends ? camera : undefined, background.source);
  const [, setPermissions] = useState(0);
  useEffect(() => {
    const changed = () => setPermissions((n) => n + 1);
    room.on(RoomEvent.ParticipantPermissionsChanged, changed);
    return () => {
      room.off(RoomEvent.ParticipantPermissionsChanged, changed);
    };
  }, [room]);
  // Step 79, part C: questions, polls and chat of a webinar, kept while the panel is closed.
  const live = useWebinarLive(code, guest, webinar);
  // A new role (co-host, on the stage) may see more: hidden questions, poll results, the hosts' chat.
  const reloadLive = live.reload;
  const firstRole = useRef(myRole);
  useEffect(() => {
    if (myRole !== firstRole.current) void reloadLive();
  }, [myRole, reloadLive]);
  useDataChannel(STAGE_TOPIC, (msg) => {
    const data = JSON.parse(decoder.decode(msg.payload)) as { identity?: string; role?: MeetingRole };
    if (data.identity !== localParticipant.identity || !data.role) return;
    setMyRole(data.role);
    setNotice(t(data.role === "presenter" ? "on_stage_now" : data.role === "host" ? "cohost_now" : "off_stage_now"));
  });
  // The chat listens all the time; the button counts what came while it was closed.
  const chat = useChat();
  const [readCount, setReadCount] = useState(0);
  useEffect(() => {
    if (panel === "chat") setReadCount(chat.chatMessages.length);
  }, [panel, chat.chatMessages.length]);
  const unread = panel === "chat" ? 0 : chat.chatMessages.filter((m, i) => i >= readCount && !m.from?.isLocal).length;

  // Hands: everyone tells their own; newcomers hear it again.
  const setHand = useCallback((identity: string, raised: boolean) => {
    setHands((prev) => {
      const next = new Set(prev);
      if (raised) next.add(identity);
      else next.delete(identity);
      return next;
    });
  }, []);
  const handChannel = useDataChannel(HAND_TOPIC, (msg) => {
    // Step 79: a webinar viewer's hand comes from the platform, with who raised it.
    const data = JSON.parse(decoder.decode(msg.payload)) as { raised: boolean; identity?: string; name?: string };
    const from = msg.from?.identity ?? data.identity;
    if (!from) return;
    setHand(from, data.raised);
    if (data.raised && (!webinar || moderator)) setNotice(t("hand_raised", { name: msg.from?.name || data.name || from }));
  });
  const sendHand = useCallback(
    (raised: boolean) => {
      setHand(localParticipant.identity, raised);
      if (sends) void handChannel.send(encoder.encode(JSON.stringify({ raised })), { reliable: true });
      else
        void meet.hand(code, raised, guest).catch((err: unknown) => {
          setHand(localParticipant.identity, !raised);
          setNotice(meetError(t, err instanceof XenaxioApiError ? err.code : "internal"));
        });
    },
    [handChannel, localParticipant.identity, setHand, sends, code, guest, t],
  );
  useEffect(() => {
    const again = () => {
      if (myHand && sends) void handChannel.send(encoder.encode(JSON.stringify({ raised: true })), { reliable: true });
    };
    const gone = (p: Participant) => setHand(p.identity, false);
    room.on(RoomEvent.ParticipantConnected, again);
    room.on(RoomEvent.ParticipantDisconnected, gone);
    return () => {
      room.off(RoomEvent.ParticipantConnected, again);
      room.off(RoomEvent.ParticipantDisconnected, gone);
    };
  }, [room, myHand, handChannel, setHand, sends]);

  // Reactions fly up for a few seconds.
  const fly = useCallback((emoji: string, name: string) => {
    const id = Date.now() + Math.random();
    setFlying((f) => [...f.slice(-10), { id, emoji, name }]);
    setTimeout(() => setFlying((f) => f.filter((x) => x.id !== id)), 4000);
  }, []);
  const reactionChannel = useDataChannel(REACTION_TOPIC, (msg) => {
    const data = JSON.parse(decoder.decode(msg.payload)) as { emoji: string; identity?: string; name?: string };
    if (data.identity && data.identity === localParticipant.identity) return;
    if (REACTIONS.includes(data.emoji)) fly(data.emoji, msg.from?.name || msg.from?.identity || data.name || "");
  });
  const react = (emoji: string) => {
    setReactionsOpen(false);
    fly(emoji, t("you_short"));
    if (sends) void reactionChannel.send(encoder.encode(JSON.stringify({ emoji })), { reliable: false });
    else void meet.reaction(code, emoji, guest).catch(() => undefined);
  };

  // The lobby, for people of the company: who waits now (a webinar has none).
  useEffect(() => {
    if (!member || webinar) return;
    let stop = false;
    let known = new Set<string>();
    const load = async () => {
      try {
        const guests = await meet.lobby(code);
        if (stop) return;
        const fresh = guests.filter((g) => !known.has(g.id));
        if (fresh.length > 0) setNotice(t("knocking", { name: fresh.map((g) => g.name).join(", ") }));
        known = new Set(guests.map((g) => g.id));
        setLobby(guests);
      } catch {
        // Next round.
      }
    };
    void load();
    const timer = setInterval(load, 3000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [member, webinar, code, t]);
  const decide = async (id: string, admit: boolean) => {
    setLobby((l) => l.filter((g) => g.id !== id));
    await meet.decide(code, id, admit).catch(() => undefined);
  };

  // Step 90: recording. Coming in while it runs shows the alert at once.
  const [recording, setRecording] = useState(recordingAtStart);
  const [recordingAlert, setRecordingAlert] = useState<string | null>(recordingAtStart ? t("recording_alert") : null);
  const [canRecord, setCanRecord] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  // The one who switched it has just confirmed it: no alert for them.
  const switchedByMe = useRef(false);
  useEffect(() => {
    let stop = false;
    // Guests ask the meeting's page data: recording may have started while they waited.
    if (!member) {
      meet
        .info(code)
        .then((i) => {
          if (stop || !i.recording) return;
          setRecording(true);
          setRecordingAlert((a) => a ?? t("recording_alert"));
        })
        .catch(() => undefined);
      return () => {
        stop = true;
      };
    }
    meet
      .recording(code)
      .then((s) => {
        if (stop) return;
        setCanRecord(s.canControl && s.available);
        if (s.recording) {
          setRecording(true);
          setRecordingAlert((a) => a ?? t("recording_alert"));
        }
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [member, code, t]);
  useDataChannel(RECORDING_TOPIC, (msg) => {
    const data = JSON.parse(decoder.decode(msg.payload)) as { recording?: boolean; by?: string };
    setRecording(!!data.recording);
    const mine = switchedByMe.current;
    switchedByMe.current = false;
    if (data.recording) {
      if (!mine) setRecordingAlert(data.by ? t("recording_alert_by", { name: data.by }) : t("recording_alert"));
    } else {
      setRecordingAlert(null);
      setNotice(t("recording_stopped"));
    }
  });
  const toggleRecording = async () => {
    if (!recording && !window.confirm(t("recording_confirm"))) return;
    setRecordingBusy(true);
    switchedByMe.current = true;
    try {
      const s = recording ? await meet.stopRecording(code) : await meet.startRecording(code);
      setRecording(s.recording);
    } catch (err) {
      switchedByMe.current = false;
      setNotice(meetError(t, err instanceof XenaxioApiError ? err.code : "internal"));
    } finally {
      setRecordingBusy(false);
    }
  };
  const recordButton = canRecord && (
    <RoundButton label={recording ? t("recording_stop") : t("recording_start")} onClick={() => void toggleRecording()} off={recording} disabled={recordingBusy}>
      <Record className="h-5 w-5" />
    </RoundButton>
  );

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const copy = async () => {
    await navigator.clipboard?.writeText(meetingLink(code)).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  };
  const switchCamera = async () => {
    const cam = localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
    if (!cam) return;
    const current = cam.mediaStreamTrack.getSettings().facingMode;
    await cam.restartTrack({ facingMode: current === "environment" ? "user" : "environment" }).catch(() => undefined);
  };
  const mobile = typeof navigator !== "undefined" && /Android|iPhone|iPad/i.test(navigator.userAgent);
  // The recording alert needs room: it opens the dock to its video size.
  const dockBackground = dock && backgroundOpen && canBackground && sends;
  const voiceOnly = dock && !webinar && !showsVideo(videoTracks) && !recordingAlert && !dockBackground;
  const backgroundPicker = (
    <BackgroundPicker choice={background.choice} onChoose={background.choose} company={company} own={background.own} onOwnFile={background.setOwnFile} effect={effect} />
  );
  const endForAll = async () => {
    if (!window.confirm(t("end_confirm"))) return;
    await meet.end(code).catch(() => undefined);
    onEnd();
  };

  return (
    <div
      className={cn(
        "flex flex-col bg-[#111] text-white",
        variant === "page" && "relative h-dvh",
        variant === "full" && "fixed inset-0 z-50 h-dvh",
        dock && "fixed inset-x-2 bottom-20 z-50 overflow-hidden rounded-xl border border-white/10 shadow-2xl sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[400px]",
        dock && !voiceOnly && (dockBackground ? "h-[min(560px,75dvh)]" : "h-[300px]"),
      )}
    >
      <header className={cn("flex items-center gap-3 text-sm", dock ? "px-3 py-1.5" : "px-4 py-2")}>
        <span className="min-w-0 flex-1 truncate font-medium">
          {title}
          {webinar && <span className="ml-2 rounded bg-white/15 px-1.5 py-0.5 text-xs font-normal">{t("webinar")}</span>}
        </span>
        <span className="text-white/60">
          {webinar
            ? t(people.filter((p) => !onStage(p)).length === 1 ? "viewers_one" : "viewers", { count: people.filter((p) => !onStage(p)).length })
            : t(people.length === 1 ? "people_one" : "people", { count: people.length })}
        </span>
        {!dock && (
          <button type="button" onClick={() => void copy()} className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 hover:bg-white/20">
            <Copy className="h-4 w-4" /> {copied ? t("link_copied") : t("copy_link")}
          </button>
        )}
        {onResize && (
          <button type="button" onClick={() => onResize(dock)} title={dock ? t("expand") : t("shrink")} aria-label={dock ? t("expand") : t("shrink")} className="rounded-md bg-white/10 p-1 hover:bg-white/20">
            {dock ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </button>
        )}
      </header>
      {recording && (
        <div role="status" className="flex items-center justify-center gap-2 bg-red-700 px-4 py-1 text-sm">
          <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden />
          {t("recording_on")}
        </div>
      )}
      {state === ConnectionState.Reconnecting && <div className="bg-amber-600 px-4 py-1 text-center text-sm">{t("reconnecting")}</div>}
      {!audio.canPlayAudio && (
        <button type="button" onClick={() => void room.startAudio()} className="bg-[var(--meet-accent,#2563eb)] px-4 py-2 text-sm">
          {t("start_audio")}
        </button>
      )}
      <div className="relative flex min-h-0 flex-1">
        <main className={cn("relative min-w-0 flex-1", dock ? "p-1" : "p-2")} data-lk-theme="default">
          {dockBackground ? (
            <div className="h-full space-y-2 overflow-y-auto p-1">
              <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
                {isCameraEnabled && cameraTrack ? (
                  <VideoTrack trackRef={{ participant: localParticipant, source: Track.Source.Camera, publication: cameraTrack }} className="h-full w-full object-cover [transform:scaleX(-1)]" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-white/60">{t("camera_off")}</div>
                )}
              </div>
              {backgroundPicker}
            </div>
          ) : voiceOnly ? (
            <VoiceStrip hands={hands} />
          ) : (
            <Stage layout={dock ? "speaker" : layout} hands={hands} pinned={pinned} setPinned={setPinned} compact={dock} stageOnly={webinar} />
          )}
          {people.length === 1 && !dock && !webinar && <p className="pointer-events-none absolute inset-x-0 top-6 text-center text-sm text-white/70">{t("alone")}</p>}
          <div className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-1">
            {flying.map((f) => (
              <span key={f.id} className="animate-bounce text-3xl" title={f.name}>
                {f.emoji} <span className="align-middle text-xs text-white/80">{f.name}</span>
              </span>
            ))}
          </div>
          {notice && <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-lg bg-black/80 px-3 py-2 text-sm shadow-lg">{notice}</div>}
          {recordingAlert && (
            <div role="alertdialog" aria-modal="true" aria-labelledby="recording-alert-title" className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
              <div className="max-w-sm rounded-xl bg-[#222] p-4 text-center shadow-xl">
                <p id="recording-alert-title" className="mb-1 flex items-center justify-center gap-2 font-semibold">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden />
                  {t("recording_title")}
                </p>
                <p className="mb-4 text-sm text-white/80">{recordingAlert}</p>
                <button type="button" autoFocus onClick={() => setRecordingAlert(null)} className="rounded-lg bg-[var(--meet-accent,#2563eb)] px-4 py-2 text-sm text-[var(--meet-accent-text,#fff)]">
                  {t("recording_ok")}
                </button>
              </div>
            </div>
          )}
        </main>
        {panel && !dock && (
          <aside className="flex w-full max-w-sm flex-col border-l border-white/10 bg-[#1a1a1a] p-3 max-sm:absolute max-sm:inset-0 max-sm:z-20 max-sm:max-w-none">
            <div className="mb-3 flex items-center">
              <h2 className="flex-1 font-medium">{panel === "people" ? t("people_title") : panel === "chat" ? t("chat") : panel === "webinar" ? t("live_title") : t("settings")}</h2>
              <button type="button" onClick={() => setPanel(null)} aria-label={t("close")} className="rounded p-1 hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {panel === "people" &&
                (webinar ? (
                  <WebinarPeople code={code} host={moderator} hands={hands} />
                ) : (
                  <PeoplePanel code={code} member={member} hands={hands} lobby={lobby} onDecide={(id, admit) => void decide(id, admit)} />
                ))}
              {panel === "chat" && <ChatPanel chat={chat} />}
              {panel === "webinar" && <WebinarPanel code={code} guest={guest} live={live} me={localParticipant.identity} />}
              {panel === "devices" && <DevicePanel background={canBackground && sends ? backgroundPicker : undefined} />}
            </div>
          </aside>
        )}
      </div>
      {/* Above the footer, not inside it: the footer scrolls sideways on phones and would clip it. */}
      {reactionsOpen && !dock && (
        <div className="absolute bottom-20 left-1/2 z-30 flex -translate-x-1/2 gap-1 rounded-full bg-[#222] p-1 shadow-lg">
          {REACTIONS.map((e) => (
            <button key={e} type="button" onClick={() => react(e)} className="rounded-full p-1.5 text-xl hover:bg-white/10">
              {e}
            </button>
          ))}
        </div>
      )}
      {dock ? (
        <footer className="flex items-center justify-center gap-2 px-2 py-2">
          <MediaToggle source={Track.Source.Microphone} />
          <MediaToggle source={Track.Source.Camera} />
          {canBackground && sends && (
            <RoundButton label={t("background")} onClick={() => setBackgroundOpen((o) => !o)} active={backgroundOpen || background.choice.kind !== "none"}>
              <MeetBackgroundIcon className="h-5 w-5" />
            </RoundButton>
          )}
          {!mobile && <MediaToggle source={Track.Source.ScreenShare} />}
          {recordButton}
          <RoundButton label={t("leave")} onClick={() => void room.disconnect()} danger>
            <PhoneOff className="h-5 w-5" />
          </RoundButton>
        </footer>
      ) : (
      <footer className="relative flex items-center justify-center gap-2 overflow-x-auto px-3 py-3">
        {/* Step 79: a webinar viewer sends no video or sound until a host brings them onto the stage. */}
        {sends && <MediaToggle source={Track.Source.Microphone} />}
        {sends && <MediaToggle source={Track.Source.Camera} />}
        {mobile && sends && (
          <RoundButton label={t("switch_camera")} onClick={() => void switchCamera()}>
            <SwitchCamera className="h-5 w-5" />
          </RoundButton>
        )}
        {sends && <MediaToggle source={Track.Source.ScreenShare} />}
        {recordButton}
        <RoundButton label={myHand ? t("lower_hand") : t("raise_hand")} onClick={() => sendHand(!myHand)} active={myHand}>
          <Hand className="h-5 w-5" />
        </RoundButton>
        <RoundButton label={t("reactions")} onClick={() => setReactionsOpen((o) => !o)} active={reactionsOpen}>
          <Smile className="h-5 w-5" />
        </RoundButton>
        <RoundButton
          label={t("people_title")}
          onClick={() => setPanel(panel === "people" ? null : "people")}
          active={panel === "people"}
          badge={webinar ? (moderator ? people.filter((p) => !onStage(p) && hands.has(p.identity)).length : 0) : member ? lobby.length : 0}
        >
          <Users className="h-5 w-5" />
        </RoundButton>
        {/* Step 79, part C: in a webinar one panel for everyone — questions, polls, chat. */}
        {webinar ? (
          <RoundButton label={t("live_title")} onClick={() => setPanel(panel === "webinar" ? null : "webinar")} active={panel === "webinar"} badge={panel === "webinar" ? 0 : live.unread}>
            <MessageSquare className="h-5 w-5" />
          </RoundButton>
        ) : (
          <RoundButton label={t("chat")} onClick={() => setPanel(panel === "chat" ? null : "chat")} active={panel === "chat"} badge={unread}>
            <MessageSquare className="h-5 w-5" />
          </RoundButton>
        )}
        <RoundButton label={layout === "grid" ? t("layout_speaker") : t("layout_grid")} onClick={() => setLayout(layout === "grid" ? "speaker" : "grid")}>
          <LayoutGrid className="h-5 w-5" />
        </RoundButton>
        <RoundButton label={t("settings")} onClick={() => setPanel(panel === "devices" ? null : "devices")} active={panel === "devices"}>
          <Settings className="h-5 w-5" />
        </RoundButton>
        {!mobile && (
          <RoundButton label={t("fullscreen")} onClick={fullscreen}>
            <Maximize2 className="h-5 w-5" />
          </RoundButton>
        )}
        <RoundButton label={t("leave")} onClick={() => void room.disconnect()} danger>
          <PhoneOff className="h-5 w-5" />
        </RoundButton>
        {moderator && (
          <button type="button" onClick={() => void endForAll()} className="shrink-0 rounded-full bg-red-900 px-3 py-2 text-sm hover:bg-red-800">
            {t("end_for_all")}
          </button>
        )}
      </footer>
      )}
    </div>
  );
}

/** Connects to the media server and shows the meeting; reports why it ended. */
export function MeetingRoom({
  code,
  token,
  signalPath,
  title,
  member,
  choices,
  onLeave,
  variant = "page",
  onResize,
  kind = "meeting",
  role = "member",
  guest = null,
  companyBackground,
  recording = false,
}: {
  code: string;
  token: string;
  signalPath: string;
  title: string;
  member: boolean;
  choices: Choices;
  onLeave: (reason: LeaveReason) => void;
  variant?: MeetingVariant;
  onResize?: (full: boolean) => void;
  /** Step 79: a webinar and this person's role in it. */
  kind?: MeetingKind;
  role?: MeetingRole;
  /** A guest's visit: its hand and reactions in a webinar go through the platform. */
  guest?: GuestKey | null;
  /** Step 92: the company's background picture; undefined — people of the company ask for it. */
  companyBackground?: MeetBackground | null;
  /** Step 90: recording ran when this person came in (from the page before entering). */
  recording?: boolean;
}) {
  const ended = useRef(false);
  // A webinar viewer has no right to send: camera and microphone stay off.
  const watchOnly = role === "viewer";
  const leave = useCallback(
    (reason: LeaveReason) => {
      if (ended.current) return;
      ended.current = true;
      onLeave(reason);
    },
    [onLeave],
  );
  const options = useMemo(
    () => ({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: choices.videoDeviceId ? { deviceId: choices.videoDeviceId } : undefined,
      audioCaptureDefaults: choices.audioDeviceId ? { deviceId: choices.audioDeviceId } : undefined,
    }),
    [choices.videoDeviceId, choices.audioDeviceId],
  );
  return (
    <LiveKitRoom
      serverUrl={signalUrl(signalPath)}
      token={token}
      connect
      video={choices.video && !watchOnly}
      audio={choices.audio && !watchOnly}
      options={options}
      onDisconnected={(reason) => {
        if (reason === DisconnectReason.PARTICIPANT_REMOVED) leave("removed");
        else if (reason === DisconnectReason.ROOM_DELETED) leave("ended");
        else if (reason === DisconnectReason.ROOM_CLOSED) leave("ended");
        else if (reason === DisconnectReason.CLIENT_INITIATED) leave("left");
        else if (reason === DisconnectReason.JOIN_FAILURE) leave("failed");
        else leave("lost");
      }}
      onError={(err) => {
        // "room is full" comes back as an error when connecting.
        leave(/full/i.test(err.message) ? "full" : "failed");
      }}
      // A dock or full-screen call places itself; only the page takes the height.
      style={variant === "page" ? { height: "100dvh" } : { display: "contents" }}
    >
      <Meeting code={code} member={member} title={title} onEnd={() => leave("ended")} variant={variant} {...(onResize ? { onResize } : {})} kind={kind} role={role} guest={guest} companyBackground={companyBackground} recordingAtStart={recording} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}
