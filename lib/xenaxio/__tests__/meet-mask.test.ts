import { describe, expect, it } from "vitest";
import { MASK_FAST, MASK_SMOOTHING, MaskSmoother, PERSON_BIAS } from "@/lib/xenaxio/meet-mask";

// Step 94: a steadier edge — smoothed over frames, leaning towards the person.
describe("mask smoother", () => {
  it("gives the processor's mask: 255 background, 0 person, leaning towards the person", () => {
    const m = new MaskSmoother();
    const out = m.next(Float32Array.from([0, 1, 0.5, 1 - PERSON_BIAS]));
    expect(out[0]).toBe(255);
    expect(out[1]).toBe(0);
    // Unsure points lean towards the person: below the middle (128) of the processor.
    expect(out[2]!).toBeLessThan(128);
    expect(out[3]).toBe(0);
  });

  it("calms a point that flickers, but follows a real move at once", () => {
    const m = new MaskSmoother();
    m.next(Float32Array.from([1, 1]));
    // One frame says "background" a little (0.4 sure of the person): the point stays mostly the person.
    const flicker = m.next(Float32Array.from([0.4, 1]));
    expect(flicker[0]!).toBeLessThan(128);
    // Someone moved away: the point is background almost at once.
    const moved = m.next(Float32Array.from([0, 1]));
    expect(moved[0]!).toBeGreaterThan(200);
    expect(MASK_FAST).toBeGreaterThan(MASK_SMOOTHING);
  });

  it("starts again when the size changes", () => {
    const m = new MaskSmoother();
    m.next(new Float32Array(4).fill(1));
    expect(m.next(new Float32Array(9).fill(0))).toHaveLength(9);
    expect(m.next(new Float32Array(9).fill(0))[0]).toBe(255);
  });
});
