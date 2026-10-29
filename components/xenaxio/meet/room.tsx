"use client";

// xenaxio step 78: inside the meeting. LiveKit's tiles and layouts
// (@livekit/components-react, Apache-2.0) with our own controls and panels:
// grid with pages or the speaker view, screen sharing, hand, reactions, the
// people (and for the company: the lobby, mute, remove), the meeting chat,
// devices, full screen. The meeting chat and hands are not stored anywhere.
import "@livekit/components-styles";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ConnectionState, DisconnectReason, type Participant, RoomEvent, Track } from "livekit-client";
import {
  Copy,
  Hand,
  LayoutGrid,
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
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
import { isGuest, type LobbyGuest, meet, meetingLink, signalUrl } from "@/lib/xenaxio/meet";
import { XenaxioApiError } from "@/lib/xenaxio/api";
import type { Choices } from "./prejoin";
import { meetError, useMeetLang } from "./lang";

export type LeaveReason = "left" | "removed" | "ended" | "lost" | "full" | "failed";

const HAND_TOPIC = "xen.hand";
const REACTION_TOPIC = "xen.reaction";
const REACTIONS = ["👍", "👏", "😂", "❤️", "🎉", "😮"];
const encoder = new TextEncoder();
const decoder = new TextDecoder();

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
function Stage({ layout, hands, pinned, setPinned }: { layout: "grid" | "speaker"; hands: Set<string>; pinned: string | null; setPinned: (id: string | null) => void }) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { updateOnlyOn: [RoomEvent.ActiveSpeakersChanged], onlySubscribed: false },
  );
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
    <GridLayout tracks={tracks} className="h-full">
      <ClickableTile hands={hands} onClick={click} />
    </GridLayout>
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

function DevicePanel() {
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

type Panel = "people" | "chat" | "devices" | null;

function Meeting({ code, member, title, onEnd }: { code: string; member: boolean; title: string; onEnd: () => void }) {
  const { t } = useMeetLang();
  const room = useRoomContext();
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
    const from = msg.from?.identity;
    if (!from) return;
    const { raised } = JSON.parse(decoder.decode(msg.payload)) as { raised: boolean };
    setHand(from, raised);
    if (raised) setNotice(t("hand_raised", { name: msg.from?.name || from }));
  });
  const sendHand = useCallback(
    (raised: boolean) => {
      setHand(localParticipant.identity, raised);
      void handChannel.send(encoder.encode(JSON.stringify({ raised })), { reliable: true });
    },
    [handChannel, localParticipant.identity, setHand],
  );
  useEffect(() => {
    const again = () => {
      if (myHand) void handChannel.send(encoder.encode(JSON.stringify({ raised: true })), { reliable: true });
    };
    const gone = (p: Participant) => setHand(p.identity, false);
    room.on(RoomEvent.ParticipantConnected, again);
    room.on(RoomEvent.ParticipantDisconnected, gone);
    return () => {
      room.off(RoomEvent.ParticipantConnected, again);
      room.off(RoomEvent.ParticipantDisconnected, gone);
    };
  }, [room, myHand, handChannel, setHand]);

  // Reactions fly up for a few seconds.
  const fly = useCallback((emoji: string, name: string) => {
    const id = Date.now() + Math.random();
    setFlying((f) => [...f.slice(-10), { id, emoji, name }]);
    setTimeout(() => setFlying((f) => f.filter((x) => x.id !== id)), 4000);
  }, []);
  const reactionChannel = useDataChannel(REACTION_TOPIC, (msg) => {
    const { emoji } = JSON.parse(decoder.decode(msg.payload)) as { emoji: string };
    if (REACTIONS.includes(emoji)) fly(emoji, msg.from?.name || msg.from?.identity || "");
  });
  const react = (emoji: string) => {
    setReactionsOpen(false);
    fly(emoji, t("you_short"));
    void reactionChannel.send(encoder.encode(JSON.stringify({ emoji })), { reliable: false });
  };

  // The lobby, for people of the company: who waits now.
  useEffect(() => {
    if (!member) return;
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
  }, [member, code, t]);
  const decide = async (id: string, admit: boolean) => {
    setLobby((l) => l.filter((g) => g.id !== id));
    await meet.decide(code, id, admit).catch(() => undefined);
  };

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
  const endForAll = async () => {
    if (!window.confirm(t("end_confirm"))) return;
    await meet.end(code).catch(() => undefined);
    onEnd();
  };

  return (
    <div className="flex h-dvh flex-col bg-[#111] text-white">
      <header className="flex items-center gap-3 px-4 py-2 text-sm">
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        <span className="text-white/60">{t(people.length === 1 ? "people_one" : "people", { count: people.length })}</span>
        <button type="button" onClick={() => void copy()} className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 hover:bg-white/20">
          <Copy className="h-4 w-4" /> {copied ? t("link_copied") : t("copy_link")}
        </button>
      </header>
      {state === ConnectionState.Reconnecting && <div className="bg-amber-600 px-4 py-1 text-center text-sm">{t("reconnecting")}</div>}
      {!audio.canPlayAudio && (
        <button type="button" onClick={() => void room.startAudio()} className="bg-[var(--meet-accent,#2563eb)] px-4 py-2 text-sm">
          {t("start_audio")}
        </button>
      )}
      <div className="relative flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1 p-2" data-lk-theme="default">
          <Stage layout={layout} hands={hands} pinned={pinned} setPinned={setPinned} />
          {people.length === 1 && <p className="pointer-events-none absolute inset-x-0 top-6 text-center text-sm text-white/70">{t("alone")}</p>}
          <div className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-1">
            {flying.map((f) => (
              <span key={f.id} className="animate-bounce text-3xl" title={f.name}>
                {f.emoji} <span className="align-middle text-xs text-white/80">{f.name}</span>
              </span>
            ))}
          </div>
          {notice && <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-lg bg-black/80 px-3 py-2 text-sm shadow-lg">{notice}</div>}
        </main>
        {panel && (
          <aside className="flex w-full max-w-sm flex-col border-l border-white/10 bg-[#1a1a1a] p-3 max-sm:absolute max-sm:inset-0 max-sm:z-20 max-sm:max-w-none">
            <div className="mb-3 flex items-center">
              <h2 className="flex-1 font-medium">{panel === "people" ? t("people_title") : panel === "chat" ? t("chat") : t("settings")}</h2>
              <button type="button" onClick={() => setPanel(null)} aria-label={t("close")} className="rounded p-1 hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {panel === "people" && <PeoplePanel code={code} member={member} hands={hands} lobby={lobby} onDecide={(id, admit) => void decide(id, admit)} />}
              {panel === "chat" && <ChatPanel chat={chat} />}
              {panel === "devices" && <DevicePanel />}
            </div>
          </aside>
        )}
      </div>
      <footer className="relative flex items-center justify-center gap-2 overflow-x-auto px-3 py-3">
        <MediaToggle source={Track.Source.Microphone} />
        <MediaToggle source={Track.Source.Camera} />
        {mobile && (
          <RoundButton label={t("switch_camera")} onClick={() => void switchCamera()}>
            <SwitchCamera className="h-5 w-5" />
          </RoundButton>
        )}
        <MediaToggle source={Track.Source.ScreenShare} />
        <RoundButton label={myHand ? t("lower_hand") : t("raise_hand")} onClick={() => sendHand(!myHand)} active={myHand}>
          <Hand className="h-5 w-5" />
        </RoundButton>
        <div className="relative">
          <RoundButton label={t("reactions")} onClick={() => setReactionsOpen((o) => !o)} active={reactionsOpen}>
            <Smile className="h-5 w-5" />
          </RoundButton>
          {reactionsOpen && (
            <div className="absolute bottom-14 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-[#222] p-1 shadow-lg">
              {REACTIONS.map((e) => (
                <button key={e} type="button" onClick={() => react(e)} className="rounded-full p-1.5 text-xl hover:bg-white/10">
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
        <RoundButton label={t("people_title")} onClick={() => setPanel(panel === "people" ? null : "people")} active={panel === "people"} badge={member ? lobby.length : 0}>
          <Users className="h-5 w-5" />
        </RoundButton>
        <RoundButton label={t("chat")} onClick={() => setPanel(panel === "chat" ? null : "chat")} active={panel === "chat"} badge={unread}>
          <MessageSquare className="h-5 w-5" />
        </RoundButton>
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
        {member && (
          <button type="button" onClick={() => void endForAll()} className="shrink-0 rounded-full bg-red-900 px-3 py-2 text-sm hover:bg-red-800">
            {t("end_for_all")}
          </button>
        )}
      </footer>
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
}: {
  code: string;
  token: string;
  signalPath: string;
  title: string;
  member: boolean;
  choices: Choices;
  onLeave: (reason: LeaveReason) => void;
}) {
  const ended = useRef(false);
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
      video={choices.video}
      audio={choices.audio}
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
      style={{ height: "100dvh" }}
    >
      <Meeting code={code} member={member} title={title} onEnd={() => leave("ended")} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}
