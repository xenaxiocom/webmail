// xenaxio step 92: the background behind one's own camera in a video meeting,
// as in Google Meet and Zoom — blurred, or replaced by a picture. It happens
// in the browser (MediaPipe's selfie segmentation through LiveKit's track
// processors, both Apache-2.0); the media server only ever gets the finished
// picture. The model and MediaPipe's code come from this origin, never from a
// CDN. The choice and one's own file stay in this browser; the company's
// background (and whether employees start with it) comes from the platform.
//
// Step 93: backgrounds that move — scenes drawn by code, a GIF or video, and
// 360° panoramas whose view follows the phone's turn or the person's place in
// the picture.
import { withBasePath } from "@/lib/browser-navigation";
import { BACKGROUNDS } from "@/lib/xenaxio/backgrounds";
import type { MeetBackground } from "@/lib/xenaxio/meet";

/**
 * Off, blurred a little or a lot, a picture (ours, the company's, one's own),
 * a scene drawn by code, or one of our panoramas. "company" and "own" stand
 * for whatever that background is: a picture, an animation or a panorama.
 */
export type BackgroundChoice =
  | { kind: "none" }
  | { kind: "blur"; strength: "light" | "strong" }
  | { kind: "image"; id: string }
  | { kind: "scene"; id: SceneId }
  | { kind: "panorama"; id: string };

/** What a background file is: a still picture, something that moves, or a 360° panorama. */
export type BackgroundKind = "image" | "animation" | "panorama";

/** One's own background, kept in this browser (IndexedDB); `url` is an object URL of it. */
export interface OwnBackground {
  url: string;
  kind: BackgroundKind;
  type: string;
  /** The file itself: read directly (CSP connect-src 'self' does not allow fetching a blob: URL). */
  blob?: Blob;
}

/** What the camera's background is made of, resolved from a choice. */
export type BackgroundSource =
  | { type: "none" }
  | { type: "blur"; radius: number }
  | { type: "image"; url: string }
  | { type: "scene"; id: SceneId }
  | { type: "panorama"; url: string; blob?: Blob; yaw?: number; sway?: boolean }
  | { type: "animation"; url: string; mime: string; blob?: Blob };

export const COMPANY_IMAGE = "company";
export const OWN_IMAGE = "own";
export const NO_EFFECT: BackgroundChoice = { kind: "none" };

const CHOICE_KEY = "xenaxio-meet-background";
/** Step 92 kept one's own picture here; step 93 moves it to IndexedDB. */
export const LEGACY_OWN_KEY = "xenaxio-meet-background-own";

/** Blur radius per strength, in pixels of the processed picture. */
export const BLUR_RADIUS = { light: 6, strong: 14 } as const;

/** Our own pictures (step 42), light variants: 2560 × 1440, made without anyone else's licence. */
export const MEET_PICTURES = BACKGROUNDS.filter((b) => b.kind === "image").map((b) => ({
  id: b.id,
  name: b.name,
  url: `/xenaxio/backgrounds/${b.id}-light.webp`,
  thumb: `/xenaxio/backgrounds/${b.id}-light-thumb.webp`,
}));

/** Scenes drawn by code (lib/xenaxio/meet-scenes.ts): no files, no licences. */
export const SCENES = ["clouds", "waves", "aurora", "colours"] as const;
export type SceneId = (typeof SCENES)[number];

/**
 * Our panoramas: Poly Haven, CC0 (public/xenaxio/meet/panoramas/README.md),
 * 3072 × 1536. `yaw`: where the view starts (degrees from the middle of the
 * picture), towards its best side; the thumbnail shows that view. `sway`:
 * the view rocks gently, as on board a ship.
 */
export const PANORAMAS = ([
  // Nature.
  { id: "pano-meadow", name: "meadow", yaw: 0 },
  { id: "pano-alps", name: "alps", yaw: 90 },
  { id: "pano-lake", name: "lake", yaw: 60 },
  { id: "pano-beach", name: "beach", yaw: 120 },
  { id: "pano-autumn", name: "autumn", yaw: 90 },
  { id: "pano-snow", name: "snow", yaw: 30 },
  { id: "pano-garden", name: "garden", yaw: 30 },
  // By the sea and on board.
  { id: "pano-ship", name: "ship", yaw: 30, sway: true },
  { id: "pano-cabin", name: "cabin", yaw: -90, sway: true },
  { id: "pano-marina", name: "marina", yaw: 30 },
  { id: "pano-harbour-sunset", name: "harbour_sunset", yaw: -90 },
  { id: "pano-terrace", name: "terrace", yaw: 0 },
  { id: "pano-sunset", name: "sunset", yaw: 36 },
  // Cities.
  { id: "pano-city", name: "city", yaw: 160 },
  { id: "pano-harbour", name: "harbour", yaw: -150 },
  { id: "pano-berlin", name: "berlin", yaw: -30 },
  { id: "pano-dresden", name: "dresden", yaw: 30 },
  { id: "pano-shanghai", name: "shanghai", yaw: 30 },
  { id: "pano-market", name: "market", yaw: 30 },
  // Rooms.
  { id: "pano-loft", name: "loft", yaw: 43 },
  { id: "pano-living", name: "living", yaw: 0 },
  { id: "pano-lounge", name: "lounge", yaw: -30 },
  { id: "pano-fireplace", name: "fireplace", yaw: 110 },
  { id: "pano-hotel", name: "hotel", yaw: 0 },
  { id: "pano-veranda", name: "veranda", yaw: 0 },
] as { id: string; name: string; yaw: number; sway?: boolean }[]).map((p) => ({ ...p, url: `/xenaxio/meet/panoramas/${p.id}.jpg`, thumb: `/xenaxio/meet/panoramas/${p.id}-thumb.jpg` }));

/** Where MediaPipe's code (copied from node_modules at build time) and the model are served. */
export const VISION_ASSETS = {
  tasksVisionFileSet: "/xenaxio/meet/vision",
  modelAssetPath: "/xenaxio/meet/selfie_segmenter.tflite",
};

/** One's own file: at most 20 MB and, for a video, 30 seconds (it loops). */
export const OWN_MAX_BYTES = 20 * 1024 * 1024;
export const OWN_MAX_SECONDS = 30;
/** The company's animation or panorama (the platform's limit; a still picture: 2 MB). */
export const COMPANY_MOTION_MAX_BYTES = 10 * 1024 * 1024;

function absolute(path: string): string {
  const url = withBasePath(path);
  return typeof location === "undefined" ? url : new URL(url, location.origin).href;
}

export function visionAssets(): { tasksVisionFileSet: string; modelAssetPath: string } {
  return { tasksVisionFileSet: absolute(VISION_ASSETS.tasksVisionFileSet), modelAssetPath: absolute(VISION_ASSETS.modelAssetPath) };
}

function isChoice(value: unknown): value is BackgroundChoice {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  if (c.kind === "none") return true;
  if (c.kind === "blur") return c.strength === "light" || c.strength === "strong";
  if (c.kind === "scene") return (SCENES as readonly unknown[]).includes(c.id);
  return (c.kind === "image" || c.kind === "panorama") && typeof c.id === "string" && c.id.length > 0 && c.id.length <= 40;
}

/** The person's own choice in this browser; null when they never chose (then the company's default applies). */
export function savedChoice(): BackgroundChoice | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CHOICE_KEY) ?? "null");
    return isChoice(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveChoice(choice: BackgroundChoice): void {
  try {
    localStorage.setItem(CHOICE_KEY, JSON.stringify(choice));
  } catch {
    // No storage: chosen again next time.
  }
}

/** Step 92's own picture (a JPEG data URL), still read until it moved to IndexedDB. */
export function legacyOwnPicture(): string | null {
  try {
    const value = localStorage.getItem(LEGACY_OWN_KEY);
    return value?.startsWith("data:image/") ? value : null;
  } catch {
    return null;
  }
}

/** A company background as the platform describes it; before step 93 every one was a still picture. */
function companyKind(company: MeetBackground): BackgroundKind {
  return company.kind ?? "image";
}

/**
 * What the camera shows: the person's own choice; without one the company's
 * background when the admin made it the default; else nothing. A choice whose
 * background is gone (the company removed it, the browser forgot one's own)
 * falls back to nothing.
 */
export function effectiveChoice(saved: BackgroundChoice | null, company: MeetBackground | null | undefined, own: OwnBackground | null): BackgroundChoice {
  const choice = saved ?? (company?.default ? { kind: "image" as const, id: COMPANY_IMAGE } : NO_EFFECT);
  return backgroundSource(choice, company, own) ? choice : NO_EFFECT;
}

/** What a choice is made of; null when its background is gone. */
export function backgroundSource(choice: BackgroundChoice, company: MeetBackground | null | undefined, own: OwnBackground | null): BackgroundSource | null {
  switch (choice.kind) {
    case "none":
      return { type: "none" };
    case "blur":
      return { type: "blur", radius: BLUR_RADIUS[choice.strength] };
    case "scene":
      return (SCENES as readonly string[]).includes(choice.id) ? { type: "scene", id: choice.id } : null;
    case "panorama": {
      const p = PANORAMAS.find((x) => x.id === choice.id);
      return p ? { type: "panorama", url: absolute(p.url), yaw: p.yaw, ...(p.sway ? { sway: true } : {}) } : null;
    }
    case "image": {
      if (choice.id === COMPANY_IMAGE) return company ? fileSource(absolute(company.url), companyKind(company), company.contentType ?? "image/jpeg") : null;
      if (choice.id === OWN_IMAGE) return own ? fileSource(own.url, own.kind, own.type, own.blob) : null;
      const picture = MEET_PICTURES.find((p) => p.id === choice.id);
      return picture ? { type: "image", url: absolute(picture.url) } : null;
    }
  }
}

function fileSource(url: string, kind: BackgroundKind, mime: string, blob?: Blob): BackgroundSource {
  if (kind === "animation") return { type: "animation", url, mime, ...(blob ? { blob } : {}) };
  if (kind === "panorama") return { type: "panorama", url, ...(blob ? { blob } : {}) };
  return { type: "image", url };
}

/** Whether a source moves (a scene, a panorama or an animation): then it can be paused. */
export function moves(source: BackgroundSource | null): boolean {
  return source?.type === "scene" || source?.type === "panorama" || source?.type === "animation";
}

export function sameChoice(a: BackgroundChoice, b: BackgroundChoice): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * A 360° panorama is a picture twice as wide as high (equirectangular), the
 * format of 360° cameras and Photo Sphere — and big enough to look around in.
 */
export function isPanorama(width: number, height: number): boolean {
  return width >= 2000 && Math.abs(width / height - 2) <= 0.05;
}

/** GIF, MP4 or WebM: a background that moves. */
export function isMotionType(type: string): boolean {
  return type === "image/gif" || type === "video/mp4" || type === "video/webm";
}

/**
 * A picture the person picked, made smaller in the browser: at most `maxSide`
 * pixels on its long side, as a JPEG. Phone photos (5–10 MB) become a few
 * hundred kilobytes; EXIF (place, camera) is gone with it.
 */
export async function shrinkPicture(file: Blob, maxSide: number, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no picture"))), "image/jpeg", quality));
  } finally {
    bitmap.close();
  }
}

/** Width and height of a picture file; null when the browser cannot open it. */
export async function pictureSize(file: Blob): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/** A video's length in seconds; null when the browser cannot read it. */
export function videoSeconds(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

/**
 * What one's own file becomes: a GIF or video moves (at most 20 MB and 30
 * seconds); a picture twice as wide as high is a panorama (at most 4096 px,
 * JPEG); any other picture a still one (at most 1280 px, JPEG).
 */
export async function prepareOwnFile(file: File): Promise<{ blob: Blob; kind: BackgroundKind } | { error: "too_large" | "too_long" | "unreadable" }> {
  if (isMotionType(file.type)) {
    if (file.size > OWN_MAX_BYTES) return { error: "too_large" };
    if (file.type.startsWith("video/")) {
      const seconds = await videoSeconds(file);
      if (seconds === null) return { error: "unreadable" };
      if (seconds > OWN_MAX_SECONDS + 0.5) return { error: "too_long" };
    }
    return { blob: file, kind: "animation" };
  }
  const size = await pictureSize(file);
  if (!size) return { error: "unreadable" };
  if (isPanorama(size.width, size.height)) return { blob: await shrinkPicture(file, 4096, 0.85), kind: "panorama" };
  return { blob: await shrinkPicture(file, 1280, 0.8), kind: "image" };
}
