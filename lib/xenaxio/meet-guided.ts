// xenaxio step 95: the mask's edge follows the edges in the camera picture.
// The model works on a 144 × 256 picture, so its edge is coarse and misses the
// real outline of hair and shoulders. A guided filter (He, Sun, Tang, 2010)
// lets the mask take the shape of the edges in the frame itself: where the
// picture has an edge, the mask may change; where the picture is flat, the
// mask stays flat. It works on a small copy (half the camera's size), in a
// few box blurs, each a running sum: a few milliseconds a frame.

/** Box radius in points of the small copy, and how much flat areas resist edges in the mask. */
export const GUIDE_RADIUS = 3;
export const GUIDE_EPS = 0.002;
/** The small copy is about this wide (half of a 640 × 360 camera). */
export const GUIDE_WIDTH = 320;
/** Refining dearer than this on average (30 frames) stops by itself: the step 94 mask serves. */
export const GUIDE_MAX_MS = 16;

/** Mean of each point's (2r+1)² neighbourhood, cut at the borders; two passes of running sums. */
function boxMean(src: Float32Array, w: number, h: number, r: number, tmp: Float32Array, out: Float32Array): void {
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = 0; x <= Math.min(r, w - 1); x++) sum += src[row + x]!;
    for (let x = 0; x < w; x++) {
      const lo = x - r;
      const hi = x + r;
      tmp[row + x] = sum / (Math.min(hi, w - 1) - Math.max(lo, 0) + 1);
      if (hi + 1 < w) sum += src[row + hi + 1]!;
      if (lo >= 0) sum -= src[row + lo]!;
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = 0; y <= Math.min(r, h - 1); y++) sum += tmp[y * w + x]!;
    for (let y = 0; y < h; y++) {
      const lo = y - r;
      const hi = y + r;
      out[y * w + x] = sum / (Math.min(hi, h - 1) - Math.max(lo, 0) + 1);
      if (hi + 1 < h) sum += tmp[(hi + 1) * w + x]!;
      if (lo >= 0) sum -= tmp[lo * w + x]!;
    }
  }
}

/** A guided filter for one size of picture; its buffers are kept between frames. */
export class GuidedFilter {
  private readonly n: number;
  private readonly b: Float32Array[];

  constructor(
    readonly width: number,
    readonly height: number,
    private readonly radius = GUIDE_RADIUS,
    private readonly eps = GUIDE_EPS,
  ) {
    this.n = width * height;
    this.b = Array.from({ length: 8 }, () => new Float32Array(this.n));
  }

  /**
   * `guide`: the picture's brightness, 0..1; `mask`: what to refine, 0..1.
   * Writes the refined mask (clipped to 0..1) into `out`.
   */
  apply(guide: Float32Array, mask: Float32Array, out: Float32Array): void {
    const { width: w, height: h, radius: r, eps, n } = this;
    const [tmp, meanI, meanP, prod, corrI, corrIp, a, bb] = this.b as [Float32Array, Float32Array, Float32Array, Float32Array, Float32Array, Float32Array, Float32Array, Float32Array];
    boxMean(guide, w, h, r, tmp, meanI);
    boxMean(mask, w, h, r, tmp, meanP);
    for (let i = 0; i < n; i++) prod[i] = guide[i]! * guide[i]!;
    boxMean(prod, w, h, r, tmp, corrI);
    for (let i = 0; i < n; i++) prod[i] = guide[i]! * mask[i]!;
    boxMean(prod, w, h, r, tmp, corrIp);
    for (let i = 0; i < n; i++) {
      const mI = meanI[i]!;
      const ai = (corrIp[i]! - mI * meanP[i]!) / (corrI[i]! - mI * mI + eps);
      a[i] = ai;
      bb[i] = meanP[i]! - ai * mI;
    }
    // a and b averaged in place of the products (their buffers are free now).
    boxMean(a, w, h, r, tmp, corrI);
    boxMean(bb, w, h, r, tmp, corrIp);
    for (let i = 0; i < n; i++) {
      const q = corrI[i]! * guide[i]! + corrIp[i]!;
      out[i] = q < 0 ? 0 : q > 1 ? 1 : q;
    }
  }
}

/** A picture's brightness (0..1) from RGBA bytes. */
export function brightness(rgba: Uint8ClampedArray, out: Float32Array): void {
  for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = (0.299 * rgba[j]! + 0.587 * rgba[j + 1]! + 0.114 * rgba[j + 2]!) / 255;
}

/** A mask made `factor` times smaller (the mean of each factor × factor block). */
export function shrink(src: Float32Array, w: number, h: number, factor: number, out: Float32Array): void {
  const ow = Math.floor(w / factor);
  const oh = Math.floor(h / factor);
  const k = 1 / (factor * factor);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      let s = 0;
      for (let dy = 0; dy < factor; dy++) {
        const row = (y * factor + dy) * w + x * factor;
        for (let dx = 0; dx < factor; dx++) s += src[row + dx]!;
      }
      out[y * ow + x] = s * k;
    }
  }
}
