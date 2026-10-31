// Step 104: where a picture is cut for the circle or the 3:1 strip, and which files move.
import { describe, expect, it } from "vitest";
import { focusCrop, isAnimated, objectPosition } from "../media";

describe("profile pictures and banners (step 104)", () => {
  it("cuts the requested shape where the person placed it", () => {
    // A landscape photo in a circle: the full height, moved along the width.
    expect(focusCrop(4000, 3000, 1)).toEqual({ x: 500, y: 0, w: 3000, h: 3000 });
    expect(focusCrop(4000, 3000, 1, { x: 0, y: 50 })).toEqual({ x: 0, y: 0, w: 3000, h: 3000 });
    expect(focusCrop(4000, 3000, 1, { x: 100, y: 50 })).toEqual({ x: 1000, y: 0, w: 3000, h: 3000 });
    // A banner 3:1 from a 4:3 photo: the full width, moved up and down.
    expect(focusCrop(1200, 900, 3, { x: 50, y: 20 })).toEqual({ x: 0, y: 100, w: 1200, h: 400 });
    // Out-of-range focus stays inside the picture.
    expect(focusCrop(1200, 900, 3, { x: 50, y: 150 })).toEqual({ x: 0, y: 500, w: 1200, h: 400 });
    expect(objectPosition({ focusX: 20, focusY: 80 })).toBe("20% 80%");
    expect(objectPosition(null)).toBe("50% 50%");
  });

  it("knows GIFs and animated WebP by their bytes", async () => {
    const gif = new Blob([new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 10, 0, 10, 0])]);
    const webp = (flags: number) => {
      const b = new Uint8Array(30);
      b.set([...new TextEncoder().encode("RIFF")], 0);
      b.set([...new TextEncoder().encode("WEBPVP8X")], 8);
      b[20] = flags;
      return new Blob([b]);
    };
    expect(await isAnimated(gif)).toBe(true);
    expect(await isAnimated(webp(0x02))).toBe(true);
    expect(await isAnimated(webp(0x10))).toBe(false);
    expect(await isAnimated(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])]))).toBe(false);
  });
});
