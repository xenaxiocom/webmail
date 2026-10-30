import { describe, expect, it } from "vitest";
import { brightness, GuidedFilter, shrink } from "@/lib/xenaxio/meet-guided";

// Step 95: the mask's edge follows the edges in the camera picture.
describe("guided filter", () => {
  const W = 40;
  const H = 20;
  /** A picture dark on the left, bright from x = 20 on (the real outline). */
  const guide = new Float32Array(W * H).map((_, i) => (i % W >= 20 ? 0.9 : 0.1));
  /** The model's coarse mask: a soft ramp from x = 14 to x = 26 (1 = background). */
  const coarse = new Float32Array(W * H).map((_, i) => Math.min(1, Math.max(0, ((i % W) - 14) / 12)));

  it("pulls a coarse edge onto the edge of the picture", () => {
    const out = new Float32Array(W * H);
    new GuidedFilter(W, H, 4, 0.004).apply(guide, coarse, out);
    const at = (x: number, y = 10) => out[y * W + x]!;
    // Left of the real outline the mask is more "person", right of it more "background" than the ramp was.
    expect(at(17)).toBeLessThan(coarse[10 * W + 17]!);
    expect(at(22)).toBeGreaterThan(coarse[10 * W + 22]!);
    // The step is sharper: one point either side of the outline differs a lot.
    expect(at(20) - at(19)).toBeGreaterThan(0.3);
    expect(out.every((v) => v >= 0 && v <= 1)).toBe(true);
  });

  it("leaves a mask alone where the picture is flat, apart from a gentle blur", () => {
    const flat = new Float32Array(W * H).fill(0.5);
    const ramp = new Float32Array(W * H).map((_, i) => (i % W) / (W - 1));
    const out = new Float32Array(W * H);
    new GuidedFilter(W, H, 4, 0.004).apply(flat, ramp, out);
    // Away from the borders, a straight ramp stays the same ramp (a blur does not bend a line).
    for (const x of [12, 20, 28]) expect(out[10 * W + x]!).toBeCloseTo(ramp[10 * W + x]!, 3);
  });

  it("makes brightness from RGBA and a smaller copy of a mask", () => {
    const b = new Float32Array(2);
    brightness(Uint8ClampedArray.from([255, 255, 255, 255, 0, 0, 0, 255]), b);
    expect(b[0]).toBeCloseTo(1);
    expect(b[1]).toBe(0);
    const small = new Float32Array(2);
    shrink(Float32Array.from([0, 1, 1, 1, 0, 1, 1, 1]), 4, 2, 2, small);
    expect(Array.from(small)).toEqual([0.5, 1]);
  });
});
