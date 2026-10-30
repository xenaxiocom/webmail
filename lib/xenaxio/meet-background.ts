// xenaxio step 89: the background behind one's own camera in a video meeting,
// as in Google Meet and Zoom — blurred, or replaced by a picture. It happens
// in the browser (MediaPipe's selfie segmentation through LiveKit's track
// processors, both Apache-2.0); the media server only ever gets the finished
// picture. The model and MediaPipe's code come from this origin, never from a
// CDN. The choice and one's own picture stay in this browser; the company's
// picture (and whether employees start with it) comes from the platform.
import { withBasePath } from "@/lib/browser-navigation";
import { BACKGROUNDS } from "@/lib/xenaxio/backgrounds";
import type { MeetBackground } from "@/lib/xenaxio/meet";

/** Off, blurred a little or a lot, or a picture: one of ours, the company's, or one's own. */
export type BackgroundChoice =
  | { kind: "none" }
  | { kind: "blur"; strength: "light" | "strong" }
  | { kind: "image"; id: string };

export const COMPANY_IMAGE = "company";
export const OWN_IMAGE = "own";
export const NO_EFFECT: BackgroundChoice = { kind: "none" };

const CHOICE_KEY = "xenaxio-meet-background";
const OWN_KEY = "xenaxio-meet-background-own";

/** Blur radius per strength, in pixels of the processed picture. */
export const BLUR_RADIUS = { light: 6, strong: 14 } as const;

/** Our own pictures (step 42), light variants: 2560 × 1440, made without anyone else's licence. */
export const MEET_PICTURES = BACKGROUNDS.filter((b) => b.kind === "image").map((b) => ({
  id: b.id,
  name: b.name,
  url: `/xenaxio/backgrounds/${b.id}-light.webp`,
  thumb: `/xenaxio/backgrounds/${b.id}-light-thumb.webp`,
}));

/** Where MediaPipe's code (copied from node_modules at build time) and the model are served. */
export const VISION_ASSETS = {
  tasksVisionFileSet: "/xenaxio/meet/vision",
  modelAssetPath: "/xenaxio/meet/selfie_segmenter.tflite",
};

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
  return c.kind === "image" && typeof c.id === "string" && c.id.length > 0 && c.id.length <= 40;
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

/** One's own picture, kept in this browser only (a JPEG data URL, at most 1280 px wide). */
export function ownPicture(): string | null {
  try {
    const value = localStorage.getItem(OWN_KEY);
    return value?.startsWith("data:image/") ? value : null;
  } catch {
    return null;
  }
}

/** False when the browser has no room for it (the picture then works until the page closes). */
export function saveOwnPicture(dataUrl: string | null): boolean {
  try {
    if (dataUrl) localStorage.setItem(OWN_KEY, dataUrl);
    else localStorage.removeItem(OWN_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * What the camera shows: the person's own choice; without one the company's
 * picture when the admin made it the default; else nothing. A choice whose
 * picture is gone (the company removed it, the browser forgot one's own)
 * falls back to nothing.
 */
export function effectiveChoice(saved: BackgroundChoice | null, company: MeetBackground | null | undefined, own: string | null): BackgroundChoice {
  const choice = saved ?? (company?.default ? { kind: "image" as const, id: COMPANY_IMAGE } : NO_EFFECT);
  return imageUrl(choice, company, own) === null && choice.kind === "image" ? NO_EFFECT : choice;
}

/** The picture behind the person for a choice; null for none or blur, or when it is gone. */
export function imageUrl(choice: BackgroundChoice, company: MeetBackground | null | undefined, own: string | null): string | null {
  if (choice.kind !== "image") return null;
  if (choice.id === COMPANY_IMAGE) return company ? absolute(company.url) : null;
  if (choice.id === OWN_IMAGE) return own;
  const picture = MEET_PICTURES.find((p) => p.id === choice.id);
  return picture ? absolute(picture.url) : null;
}

export function sameChoice(a: BackgroundChoice, b: BackgroundChoice): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}
