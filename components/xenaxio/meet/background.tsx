"use client";

// xenaxio step 92: the background behind one's own camera — off, blurred, or a
// picture (ours, the company's, one's own). The same choice before entering
// (preview) and in the meeting; it changes on the fly, without reconnecting.
import { type ChangeEvent, type ReactNode, useEffect, useRef, useState } from "react";
import type { LocalVideoTrack } from "livekit-client";
import type { BackgroundProcessorWrapper, SwitchBackgroundProcessorOptions } from "@livekit/track-processors";
import { Ban, Blur, Trash2, Upload } from "@/components/icons";
import { cn } from "@/lib/utils";
import { withBasePath } from "@/lib/browser-navigation";
import { translate } from "@/lib/xenaxio/i18n";
import type { MeetBackground } from "@/lib/xenaxio/meet";
import {
  BLUR_RADIUS,
  blobToDataUrl,
  type BackgroundChoice,
  COMPANY_IMAGE,
  effectiveChoice,
  imageUrl,
  MEET_PICTURES,
  OWN_IMAGE,
  ownPicture,
  sameChoice,
  saveChoice,
  saveOwnPicture,
  savedChoice,
  shrinkPicture,
  visionAssets,
} from "@/lib/xenaxio/meet-background";
import { useMeetLang } from "./lang";

const PROCESSOR_NAME = "xenaxio-background";

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

function processorOptions(choice: BackgroundChoice, url: string | null): SwitchBackgroundProcessorOptions {
  if (choice.kind === "blur") return { mode: "background-blur", blurRadius: BLUR_RADIUS[choice.strength] };
  if (choice.kind === "image" && url) return { mode: "virtual-background", imagePath: url };
  return { mode: "disabled" };
}

/**
 * The choice of this browser, with the company's default and one's own
 * picture; changing it remembers it here.
 */
export function useBackgroundChoice(company: MeetBackground | null | undefined) {
  const [saved, setSaved] = useState<BackgroundChoice | null>(() => savedChoice());
  const [own, setOwn] = useState<string | null>(() => ownPicture());
  const choice = effectiveChoice(saved, company, own);
  const choose = (next: BackgroundChoice) => {
    saveChoice(next);
    setSaved(next);
  };
  /** Stores one's own picture (or forgets it); false when the browser had no room to keep it. */
  const setOwnPicture = (dataUrl: string | null) => {
    const kept = saveOwnPicture(dataUrl);
    setOwn(dataUrl);
    if (dataUrl) choose({ kind: "image", id: OWN_IMAGE });
    else if (choice.kind === "image" && choice.id === OWN_IMAGE) choose({ kind: "none" });
    return kept;
  };
  return { choice, choose, own, setOwnPicture, url: imageUrl(choice, company, own) };
}

/**
 * Puts the chosen background on a camera track, or takes it off. One
 * processor per track, switched in place; changes run one after another, so
 * quick clicks do not race. `failed`: the browser could not do it (the camera
 * then shows the plain picture).
 */
export function useBackgroundEffect(track: LocalVideoTrack | undefined, choice: BackgroundChoice, url: string | null): { failed: boolean; busy: boolean } {
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const options = processorOptions(choice, url);
  const key = JSON.stringify(options);

  useEffect(() => {
    if (!track) return;
    const wanted = JSON.parse(key) as SwitchBackgroundProcessorOptions;
    let current = true;
    setBusy(true);
    chain.current = chain.current
      .then(async () => {
        const existing = track.getProcessor() as BackgroundProcessorWrapper | undefined;
        const ours = existing?.name === PROCESSOR_NAME ? existing : undefined;
        if (wanted.mode === "disabled") {
          // Off costs nothing: the processor goes, not just its effect.
          if (ours) await track.stopProcessor();
          return;
        }
        if (!backgroundsSupported()) throw new Error("unsupported");
        if (ours) {
          await ours.switchTo(wanted);
          return;
        }
        const { BackgroundProcessor } = await import("@livekit/track-processors");
        const processor = BackgroundProcessor({ ...wanted, assetPaths: visionAssets() }, PROCESSOR_NAME);
        await track.setProcessor(processor, true);
      })
      .then(
        () => {
          if (current) setFailed(false);
        },
        async () => {
          if (current) setFailed(wanted.mode !== "disabled");
          // Whatever half-started goes, so the plain camera keeps working.
          await track.stopProcessor().catch(() => undefined);
        },
      )
      .finally(() => {
        if (current) setBusy(false);
      });
    return () => {
      current = false;
    };
  }, [track, key]);

  return { failed, busy };
}

function Tile({ selected, onClick, label, disabled, children }: { selected: boolean; onClick: () => void; label: string; disabled?: boolean; children: ReactNode }) {
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

/** The tiles to choose from; one's own picture is made smaller in the browser and stays here. */
export function BackgroundPicker({
  choice,
  onChoose,
  company,
  own,
  onOwnPicture,
  failed,
  busy,
}: {
  choice: BackgroundChoice;
  onChoose: (c: BackgroundChoice) => void;
  company: MeetBackground | null | undefined;
  own: string | null;
  onOwnPicture: (dataUrl: string | null) => boolean;
  failed: boolean;
  busy: boolean;
}) {
  const { t, lang } = useMeetLang();
  const file = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const is = (c: BackgroundChoice) => sameChoice(c, choice);

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    setProblem(null);
    try {
      const dataUrl = await blobToDataUrl(await shrinkPicture(picked, 1280, 0.8));
      if (!onOwnPicture(dataUrl)) setProblem(t("background_not_kept"));
    } catch {
      setProblem(t("background_bad_picture"));
    }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-2">
        <Tile selected={is({ kind: "none" })} onClick={() => onChoose({ kind: "none" })} label={t("background_none")}>
          <Caption icon={<Ban className="h-5 w-5" />} text={t("background_none_short")} />
        </Tile>
        <Tile selected={is({ kind: "blur", strength: "light" })} onClick={() => onChoose({ kind: "blur", strength: "light" })} label={t("background_blur_light")}>
          <Caption icon={<Blur className="h-5 w-5 opacity-70" />} text={t("background_blur_light_short")} />
        </Tile>
        <Tile selected={is({ kind: "blur", strength: "strong" })} onClick={() => onChoose({ kind: "blur", strength: "strong" })} label={t("background_blur_strong")}>
          <Caption icon={<Blur className="h-5 w-5" />} text={t("background_blur_strong_short")} />
        </Tile>
        {company && (
          <Tile selected={is({ kind: "image", id: COMPANY_IMAGE })} onClick={() => onChoose({ kind: "image", id: COMPANY_IMAGE })} label={t("background_company")}>
            <img src={withBasePath(company.url)} alt="" className="h-full w-full object-cover" />
          </Tile>
        )}
        {MEET_PICTURES.map((p) => (
          <Tile key={p.id} selected={is({ kind: "image", id: p.id })} onClick={() => onChoose({ kind: "image", id: p.id })} label={translate(lang, `background.names.${p.name}`)}>
            <img src={withBasePath(p.thumb)} alt="" className="h-full w-full object-cover" />
          </Tile>
        ))}
        {own && (
          <div className="relative">
            <Tile selected={is({ kind: "image", id: OWN_IMAGE })} onClick={() => onChoose({ kind: "image", id: OWN_IMAGE })} label={t("background_own")}>
              <img src={own} alt="" className="h-full w-full object-cover" />
            </Tile>
            <button
              type="button"
              onClick={() => onOwnPicture(null)}
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
      </div>
      <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e)} />
      {busy && choice.kind !== "none" && <p className="text-xs text-white/60">{t("background_loading")}</p>}
      {failed && <p className="text-xs text-amber-300">{t("background_failed")}</p>}
      {problem && <p className="text-xs text-amber-300">{problem}</p>}
      <p className="text-xs text-white/50">{t("background_private")}</p>
    </div>
  );
}
