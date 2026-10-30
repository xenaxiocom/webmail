"use client";

// xenaxio step 92: the background behind one's own camera — off, blurred, or a
// picture (ours, the company's, one's own). The same choice before entering
// (preview) and in the meeting; it changes on the fly, without reconnecting.
//
// Step 93: backgrounds that move (scenes drawn by code, a GIF or video) and
// 360° panoramas; they pause by themselves when the computer cannot keep up.
import { type ChangeEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { LocalVideoTrack } from "livekit-client";
import type { BackgroundProcessorWrapper, SwitchBackgroundProcessorOptions } from "@livekit/track-processors";
import { Ban, Blur, Trash2, Upload } from "@/components/icons";
import { cn } from "@/lib/utils";
import { withBasePath } from "@/lib/browser-navigation";
import { translate } from "@/lib/xenaxio/i18n";
import type { MeetBackground } from "@/lib/xenaxio/meet";
import {
  type BackgroundChoice,
  type BackgroundSource,
  backgroundSource,
  COMPANY_IMAGE,
  effectiveChoice,
  legacyOwnPicture,
  MEET_PICTURES,
  moves,
  OWN_IMAGE,
  type OwnBackground,
  PANORAMAS,
  prepareOwnFile,
  sameChoice,
  saveChoice,
  savedChoice,
  SCENES,
  type SceneId,
  visionAssets,
} from "@/lib/xenaxio/meet-background";
import { loadOwnBackground, saveOwnBackground } from "@/lib/xenaxio/meet-background-store";
import { drawScene } from "@/lib/xenaxio/meet-scenes";
import { followOrientation, PanoramaView, requestMotionPermission } from "@/lib/xenaxio/meet-panorama";
import { useMeetLang } from "./lang";

const PROCESSOR_NAME = "xenaxio-background";
/** Panoramas shown before "show all" (the chosen one always shows). */
const PANORAMAS_SHOWN = 8;

/**
 * Whether this browser can do it (WebGL 2, video frames, and either
 * insertable streams or a canvas stream) — the same test as LiveKit's
 * supportsBackgroundProcessors, without loading the package.
 */
export function backgroundsSupported(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  try {
    const w = window as unknown as Record<string, unknown>;
    const transformer =
      typeof OffscreenCanvas !== "undefined" && typeof VideoFrame !== "undefined" && typeof createImageBitmap !== "undefined" && !!document.createElement("canvas").getContext("webgl2");
    const processor =
      (typeof w.MediaStreamTrackGenerator !== "undefined" && typeof w.MediaStreamTrackProcessor !== "undefined") ||
      (typeof HTMLCanvasElement !== "undefined" && "captureStream" in HTMLCanvasElement.prototype);
    return transformer && processor;
  } catch {
    return false;
  }
}

/**
 * The choice of this browser, with the company's default and one's own
 * background; changing it remembers it here. One's own file comes from
 * IndexedDB a moment after the page opens (step 92's picture straight away).
 */
export function useBackgroundChoice(company: MeetBackground | null | undefined) {
  const [saved, setSaved] = useState<BackgroundChoice | null>(() => savedChoice());
  const [own, setOwn] = useState<OwnBackground | null>(() => {
    const legacy = legacyOwnPicture();
    return legacy ? { url: legacy, kind: "image", type: "image/jpeg" } : null;
  });
  const ownUrl = useRef<string | null>(null);
  const setOwnBlob = useCallback((blob: Blob | null, kind: OwnBackground["kind"]) => {
    if (ownUrl.current) URL.revokeObjectURL(ownUrl.current);
    ownUrl.current = blob ? URL.createObjectURL(blob) : null;
    setOwn(blob && ownUrl.current ? { url: ownUrl.current, kind, type: blob.type || "image/jpeg", blob } : null);
  }, []);
  useEffect(() => {
    let stop = false;
    void loadOwnBackground().then((stored) => {
      if (!stop && stored) setOwnBlob(stored.blob, stored.kind);
    });
    return () => {
      stop = true;
      if (ownUrl.current) URL.revokeObjectURL(ownUrl.current);
    };
  }, [setOwnBlob]);

  const choice = effectiveChoice(saved, company, own);
  const choose = (next: BackgroundChoice) => {
    saveChoice(next);
    setSaved(next);
  };
  /** Keeps one's own file (or forgets it); false when the browser had no room to keep it. */
  const setOwnFile = async (file: { blob: Blob; kind: OwnBackground["kind"] } | null): Promise<boolean> => {
    const kept = await saveOwnBackground(file);
    setOwnBlob(file?.blob ?? null, file?.kind ?? "image");
    if (file) choose({ kind: "image", id: OWN_IMAGE });
    else if (choice.kind === "image" && choice.id === OWN_IMAGE) choose({ kind: "none" });
    return kept;
  };
  return { choice, choose, own, setOwnFile, source: backgroundSource(choice, company, own) };
}

function switchOptions(source: BackgroundSource, placeholder: string): SwitchBackgroundProcessorOptions {
  if (source.type === "blur") return { mode: "background-blur", blurRadius: source.radius };
  if (source.type === "image") return { mode: "virtual-background", imagePath: source.url };
  if (moves(source)) return { mode: "virtual-background", imagePath: placeholder };
  return { mode: "disabled" };
}

type MotionTransformer = import("./motion-transformer").MotionBackgroundTransformer;

export interface BackgroundEffect {
  /** The browser could not do it: the camera shows the plain picture. */
  failed: boolean;
  busy: boolean;
  /** The motion stopped to spare the computer. */
  paused: boolean;
  /** A GIF this browser cannot play frame by frame: its first frame stands. */
  still: boolean;
  playAnyway: () => void;
}

/**
 * Puts the chosen background on a camera track, or takes it off. One
 * processor per track, switched in place; changes run one after another, so
 * quick clicks do not race.
 */
export function useBackgroundEffect(track: LocalVideoTrack | undefined, source: BackgroundSource | null): BackgroundEffect {
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [still, setStill] = useState(false);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const transformer = useRef<MotionTransformer | null>(null);
  // The source itself (one's own file is a Blob, which JSON leaves out); the key says when it changed.
  const latest = useRef<BackgroundSource>(source ?? { type: "none" });
  latest.current = source ?? { type: "none" };
  const key = JSON.stringify(latest.current);

  useEffect(() => {
    if (!track) return;
    const wanted = latest.current;
    let current = true;
    let stopOrientation = () => undefined as void;
    setBusy(true);
    chain.current = chain.current
      .then(async () => {
        const existing = track.getProcessor() as BackgroundProcessorWrapper | undefined;
        const ours = existing?.name === PROCESSOR_NAME ? existing : undefined;
        if (wanted.type === "none") {
          // Off costs nothing: the processor goes, not just its effect.
          if (ours) await track.stopProcessor();
          return;
        }
        if (!backgroundsSupported()) throw new Error("unsupported");
        const [{ BackgroundProcessorWrapper: Wrapper }, { MotionBackgroundTransformer, PLACEHOLDER }, { frameSource }] = await Promise.all([
          import("@livekit/track-processors"),
          import("./motion-transformer"),
          import("@/lib/xenaxio/meet-motion"),
        ]);
        const view = wanted.type === "panorama" ? new PanoramaView(wanted.yaw ?? 0, wanted.sway ?? false) : null;
        const motion = moves(wanted) ? await frameSource(wanted, view ?? new PanoramaView()) : null;
        if (!current) {
          motion?.close();
          return;
        }
        if (view) stopOrientation = followOrientation(view);
        setStill(!!(motion as { still?: boolean } | null)?.still);
        const options = switchOptions(wanted, PLACEHOLDER);
        if (ours && transformer.current) {
          // The motion first: switching resets the background, the motion paints over it.
          transformer.current.setMotion(motion, view);
          await ours.switchTo(options);
          return;
        }
        const t = new MotionBackgroundTransformer({
          ...(options.mode === "background-blur" ? { blurRadius: options.blurRadius } : {}),
          ...(options.mode === "virtual-background" ? { imagePath: options.imagePath } : {}),
          assetPaths: visionAssets(),
        });
        t.onPausedChange = (p) => setPaused(p);
        t.setMotion(motion, view);
        transformer.current = t;
        await track.setProcessor(new Wrapper(t, PROCESSOR_NAME), true);
      })
      .then(
        () => {
          if (current) setFailed(false);
        },
        async () => {
          if (current) setFailed(wanted.type !== "none");
          transformer.current = null;
          // Whatever half-started goes, so the plain camera keeps working.
          await track.stopProcessor().catch(() => undefined);
        },
      )
      .finally(() => {
        if (current) setBusy(false);
      });
    return () => {
      current = false;
      stopOrientation();
    };
  }, [track, key]);

  // A new track has no processor yet: the next one is made fresh.
  useEffect(() => {
    transformer.current = null;
    setPaused(false);
  }, [track]);

  const playAnyway = useCallback(() => {
    transformer.current?.playAnyway();
    setPaused(false);
  }, []);
  return { failed, busy, paused, still, playAnyway };
}

function Tile({ selected, onClick, label, disabled, children, badge }: { selected: boolean; onClick: () => void; label: string; disabled?: boolean; children: ReactNode; badge?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      className={cn(
        "relative flex aspect-video items-center justify-center overflow-hidden rounded-md bg-white/10 text-white/80 ring-offset-2 ring-offset-[#111] transition hover:bg-white/20 disabled:opacity-50",
        selected && "ring-2 ring-[var(--meet-accent,#2563eb)]",
      )}
    >
      {children}
      {badge && <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 text-[10px] leading-4 text-white">{badge}</span>}
    </button>
  );
}

function Caption({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <span className="flex flex-col items-center gap-1">
      {icon}
      <span className="text-[11px] leading-none">{text}</span>
    </span>
  );
}

/** A still frame of a scene for its tile (the tile itself does not move). */
function ScenePreview({ id }: { id: SceneId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) drawScene(id, ctx, 160, 90, 12);
  }, [id]);
  return <canvas ref={ref} width={160} height={90} className="h-full w-full" aria-hidden />;
}

/** A company or own background on its tile: a picture, or a muted looping video. */
function FilePreview({ url, kind, type }: { url: string; kind: OwnBackground["kind"]; type: string }) {
  if (kind === "animation" && type.startsWith("video/")) return <video src={url} muted loop autoPlay playsInline className="h-full w-full object-cover" aria-hidden />;
  return <img src={url} alt="" className="h-full w-full object-cover" />;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-[11px] uppercase tracking-wide text-white/50">{title}</h4>
      <div className="grid grid-cols-4 gap-2">{children}</div>
    </div>
  );
}

/** The tiles to choose from; one's own file is checked and made smaller in the browser and stays here. */
export function BackgroundPicker({
  choice,
  onChoose,
  company,
  own,
  onOwnFile,
  effect,
}: {
  choice: BackgroundChoice;
  onChoose: (c: BackgroundChoice) => void;
  company: MeetBackground | null | undefined;
  own: OwnBackground | null;
  onOwnFile: (file: { blob: Blob; kind: OwnBackground["kind"] } | null) => Promise<boolean>;
  effect: Pick<BackgroundEffect, "failed" | "busy" | "paused" | "still" | "playAnyway">;
}) {
  const { t, lang } = useMeetLang();
  const file = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [allPanoramas, setAllPanoramas] = useState(false);
  const is = (c: BackgroundChoice) => sameChoice(c, choice);
  const badge = (kind: OwnBackground["kind"] | undefined) => (kind === "animation" ? "▶" : kind === "panorama" ? "360°" : undefined);
  // A panorama follows the phone's turn: iPhones ask for the motion sensors on a tap.
  const pick = (c: BackgroundChoice, panorama = false) => {
    if (panorama) void requestMotionPermission();
    onChoose(c);
  };

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    setProblem(null);
    try {
      const prepared = await prepareOwnFile(picked);
      if ("error" in prepared) return setProblem(t(`background_own_${prepared.error}`));
      if (prepared.kind === "panorama") void requestMotionPermission();
      if (!(await onOwnFile(prepared))) setProblem(t("background_not_kept"));
    } catch {
      setProblem(t("background_bad_picture"));
    }
  };

  const companyKind = company?.kind ?? "image";
  return (
    <div className="space-y-3">
      <Group title={t("background_group_effects")}>
        <Tile selected={is({ kind: "none" })} onClick={() => onChoose({ kind: "none" })} label={t("background_none")}>
          <Caption icon={<Ban className="h-5 w-5" />} text={t("background_none_short")} />
        </Tile>
        <Tile selected={is({ kind: "blur", strength: "light" })} onClick={() => onChoose({ kind: "blur", strength: "light" })} label={t("background_blur_light")}>
          <Caption icon={<Blur className="h-5 w-5 opacity-70" />} text={t("background_blur_light_short")} />
        </Tile>
        <Tile selected={is({ kind: "blur", strength: "strong" })} onClick={() => onChoose({ kind: "blur", strength: "strong" })} label={t("background_blur_strong")}>
          <Caption icon={<Blur className="h-5 w-5" />} text={t("background_blur_strong_short")} />
        </Tile>
      </Group>
      <Group title={t("background_group_pictures")}>
        {company && (
          <Tile selected={is({ kind: "image", id: COMPANY_IMAGE })} onClick={() => pick({ kind: "image", id: COMPANY_IMAGE }, companyKind === "panorama")} label={t("background_company")} badge={badge(companyKind)}>
            <FilePreview url={withBasePath(company.url)} kind={companyKind} type={company.contentType ?? "image/jpeg"} />
          </Tile>
        )}
        {MEET_PICTURES.map((p) => (
          <Tile key={p.id} selected={is({ kind: "image", id: p.id })} onClick={() => onChoose({ kind: "image", id: p.id })} label={translate(lang, `background.names.${p.name}`)}>
            <img src={withBasePath(p.thumb)} alt="" className="h-full w-full object-cover" />
          </Tile>
        ))}
        {own && (
          <div className="relative">
            <Tile selected={is({ kind: "image", id: OWN_IMAGE })} onClick={() => pick({ kind: "image", id: OWN_IMAGE }, own.kind === "panorama")} label={t("background_own")} badge={badge(own.kind)}>
              <FilePreview url={own.url} kind={own.kind} type={own.type} />
            </Tile>
            <button
              type="button"
              onClick={() => void onOwnFile(null)}
              aria-label={t("background_own_remove")}
              title={t("background_own_remove")}
              className="absolute right-0.5 top-0.5 rounded bg-black/70 p-0.5 text-white hover:bg-black"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <Tile selected={false} onClick={() => file.current?.click()} label={own ? t("background_own_replace") : t("background_own_upload")}>
          <Caption icon={<Upload className="h-5 w-5" />} text={t("background_own_short")} />
        </Tile>
      </Group>
      <Group title={t("background_group_moving")}>
        {SCENES.map((id) => (
          <Tile key={id} selected={is({ kind: "scene", id })} onClick={() => onChoose({ kind: "scene", id })} label={t(`background_scenes.${id}`)} badge="▶">
            <ScenePreview id={id} />
          </Tile>
        ))}
      </Group>
      <Group title={t("background_group_panoramas")}>
        {(allPanoramas ? PANORAMAS : PANORAMAS.filter((p, i) => i < PANORAMAS_SHOWN || is({ kind: "panorama", id: p.id }))).map((p) => (
          <Tile key={p.id} selected={is({ kind: "panorama", id: p.id })} onClick={() => pick({ kind: "panorama", id: p.id }, true)} label={t(`background_panoramas.${p.name}`)} badge="360°">
            <img src={withBasePath(p.thumb)} alt="" className="h-full w-full object-cover" loading="lazy" />
          </Tile>
        ))}
      </Group>
      {PANORAMAS.length > PANORAMAS_SHOWN && (
        <button type="button" onClick={() => setAllPanoramas((a) => !a)} className="text-xs text-white/70 underline hover:text-white">
          {allPanoramas ? t("background_less") : t("background_more", { count: PANORAMAS.length })}
        </button>
      )}
      <input ref={file} type="file" accept="image/*,video/mp4,video/webm" className="hidden" onChange={(e) => void upload(e)} />
      {effect.busy && choice.kind !== "none" && <p className="text-xs text-white/60">{t("background_loading")}</p>}
      {effect.failed && <p className="text-xs text-amber-300">{t("background_failed")}</p>}
      {effect.still && <p className="text-xs text-amber-300">{t("background_gif_still")}</p>}
      {effect.paused && (
        <p className="text-xs text-amber-300">
          {t("background_paused")}{" "}
          <button type="button" onClick={effect.playAnyway} className="underline hover:text-amber-200">
            {t("background_play_anyway")}
          </button>
        </p>
      )}
      {problem && <p className="text-xs text-amber-300">{problem}</p>}
      <p className="text-xs text-white/50">{t("background_private")}</p>
    </div>
  );
}
