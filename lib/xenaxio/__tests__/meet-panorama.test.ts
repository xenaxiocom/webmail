import { describe, expect, it } from "vitest";
import { angleDelta, FIELD_OF_VIEW, HEAD_YAW, PanoramaView, panoramaCrops, personCentre } from "@/lib/xenaxio/meet-panorama";

// Step 93: a window of about 70° into a 360° panorama, moved by the phone's
// turn or, on a computer, by the person's place in the picture.
describe("panorama view", () => {
  it("cuts a window around the turn, in two parts across the seam", () => {
    const [c] = panoramaCrops(3600, 1800, 640, 360, 0, 0);
    expect(c).toMatchObject({ sx: 1450, sw: 700, dx: 0, dw: 640 });
    expect(c!.sh).toBeCloseTo(393.75);
    expect(c!.sy).toBeCloseTo(900 - 393.75 / 2);
    const seam = panoramaCrops(3600, 1800, 640, 360, 180, 0);
    expect(seam).toHaveLength(2);
    expect(seam[0]).toMatchObject({ sx: 3250, sw: 350, dx: 0, dw: 320 });
    expect(seam[1]).toMatchObject({ sx: 0, sw: 350, dx: 320, dw: 320 });
    // Looking up moves the window up, never past the top.
    expect(panoramaCrops(3600, 1800, 640, 360, 0, 30)[0]!.sy).toBeLessThan(c!.sy);
    expect(panoramaCrops(3600, 1800, 640, 360, 0, 90)[0]!.sy).toBe(0);
    expect(FIELD_OF_VIEW).toBe(70);
  });

  it("takes the shortest way round", () => {
    expect(angleDelta(170, -170)).toBe(20);
    expect(angleDelta(-170, 170)).toBe(-20);
    expect(angleDelta(10, 30)).toBe(20);
  });

  it("follows the person's place on a computer, and the phone's turn once a gyroscope reports", () => {
    const view = new PanoramaView();
    view.setHead(0.5, 0);
    let now = { yaw: 0, pitch: 0 };
    for (let i = 0; i < 100; i++) now = view.step(0.1);
    expect(now.yaw).toBeCloseTo(-HEAD_YAW);
    view.setOrientation(100, 90);
    view.setOrientation(130, 100);
    for (let i = 0; i < 100; i++) now = view.step(0.1);
    expect(now.yaw).toBeCloseTo(-30);
    expect(now.pitch).toBeCloseTo(10);
    // The gyroscope wins: the head no longer moves it.
    view.setHead(-0.5, 0);
    for (let i = 0; i < 20; i++) now = view.step(0.1);
    expect(now.yaw).toBeCloseTo(-30);
  });

  it("finds the person's centre in the mask (0 = person)", () => {
    const w = 64;
    const h = 64;
    const mask = new Uint8Array(w * h).fill(1);
    for (let y = 16; y < 64; y++) for (let x = 40; x < 56; x++) mask[y * w + x] = 0;
    const c = personCentre(mask, w, h)!;
    expect(c.x).toBeGreaterThan(0.15);
    expect(c.y).toBeGreaterThan(0.05);
    expect(personCentre(new Uint8Array(w * h).fill(1), w, h)).toBeNull();
    expect(personCentre(new Uint8Array(w * h).fill(0), w, h)).toBeNull();
  });
});
