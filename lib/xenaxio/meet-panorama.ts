// xenaxio step 93: a 360° panorama (equirectangular: 360° across, 180° up and
// down, twice as wide as high) behind the person. The camera shows a window of
// about 70° of it. On a phone the window follows the phone's turn (gyroscope);
// on a computer, which has none, it moves a little against the person's place
// in the picture, which gives a sense of depth.

/** How wide the window into the panorama is, in degrees. */
export const FIELD_OF_VIEW = 70;
/** How far the view turns when the person moves from the middle to the edge of the picture. */
export const HEAD_YAW = 24;
export const HEAD_PITCH = 8;
/** On a phone the view may look up or down this far. */
export const MAX_PITCH = 30;

export interface Crop {
  /** Source rectangle in the panorama. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Where it goes across the output (the height is always the whole output). */
  dx: number;
  dw: number;
}

/**
 * The parts of the panorama to draw for a turn (yaw: 0 is the middle of the
 * picture, positive to the right) and a tilt (pitch: positive up). Where the
 * window crosses the panorama's seam it comes in two parts.
 */
export function panoramaCrops(panoW: number, panoH: number, w: number, h: number, yaw: number, pitch: number, fov = FIELD_OF_VIEW): Crop[] {
  const sw = (panoW * fov) / 360;
  const sh = Math.min(panoH, sw * (h / w));
  const centreY = panoH / 2 - (pitch / 180) * panoH;
  const sy = Math.min(panoH - sh, Math.max(0, centreY - sh / 2));
  const turn = ((((yaw + 180) % 360) + 360) % 360) / 360;
  const sx = (turn * panoW - sw / 2 + panoW) % panoW;
  const first = Math.min(sw, panoW - sx);
  const crops: Crop[] = [{ sx, sy, sw: first, sh, dx: 0, dw: (first / sw) * w }];
  if (first < sw) crops.push({ sx: 0, sy, sw: sw - first, sh, dx: (first / sw) * w, dw: w - (first / sw) * w });
  return crops;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The shortest way from one angle to another, in degrees (-180..180). */
export function angleDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

/**
 * Where the view looks. A phone's turn wins once its gyroscope reports;
 * without one the person's place in the picture moves the view a little.
 * Changes are smoothed, so a jittery sensor or mask does not shake it.
 */
export class PanoramaView {
  private targetYaw = 0;
  private targetPitch = 0;
  private yaw = 0;
  private pitch = 0;
  private firstAlpha: number | null = null;
  gyroscope = false;

  /** The person's centre in the picture, -0.5..0.5 from the middle (x right, y down). */
  setHead(x: number, y: number): void {
    if (this.gyroscope) return;
    this.targetYaw = clamp(-x, -0.5, 0.5) * HEAD_YAW * 2;
    this.targetPitch = clamp(y, -0.5, 0.5) * HEAD_PITCH * 2;
  }

  /** A deviceorientation reading: alpha turns around the vertical, beta tilts (90 is upright). */
  setOrientation(alpha: number | null, beta: number | null): void {
    if (alpha === null || beta === null) return;
    this.gyroscope = true;
    this.firstAlpha ??= alpha;
    this.targetYaw = angleDelta(alpha, this.firstAlpha);
    this.targetPitch = clamp(beta - 90, -MAX_PITCH, MAX_PITCH);
  }

  /** The view now, moved part of the way towards where it should look. */
  step(seconds: number): { yaw: number; pitch: number } {
    const k = 1 - Math.exp(-seconds * (this.gyroscope ? 12 : 3));
    this.yaw += angleDelta(this.yaw, this.targetYaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;
    return { yaw: this.yaw, pitch: this.pitch };
  }
}

/** The person's centre from a segmentation mask (0 = person), -0.5..0.5; null when there is too little or too much of them. */
export function personCentre(mask: Uint8Array, width: number, height: number, step = 4): { x: number; y: number } | null {
  let count = 0;
  let sx = 0;
  let sy = 0;
  let total = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      total++;
      if (mask[y * width + x] === 0) {
        count++;
        sx += x;
        sy += y;
      }
    }
  }
  if (total === 0 || count / total < 0.02 || count / total > 0.85) return null;
  return { x: sx / count / width - 0.5, y: sy / count / height - 0.5 };
}

/**
 * Asks for the motion sensors where the browser wants a tap first (iPhone,
 * iPad). Must run inside the tap's handler; elsewhere it does nothing.
 */
export async function requestMotionPermission(): Promise<void> {
  const D = (typeof window !== "undefined" ? (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent : undefined);
  if (typeof D?.requestPermission === "function") await D.requestPermission().catch(() => undefined);
}

/** Feeds a view from the phone's gyroscope while it lasts; returns the way to stop. */
export function followOrientation(view: PanoramaView): () => void {
  if (typeof window === "undefined") return () => undefined;
  const listener = (e: DeviceOrientationEvent) => view.setOrientation(e.alpha, e.beta);
  window.addEventListener("deviceorientation", listener);
  return () => window.removeEventListener("deviceorientation", listener);
}
