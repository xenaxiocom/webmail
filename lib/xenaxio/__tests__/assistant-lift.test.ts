import { describe, expect, it } from "vitest";
import { liftAbove } from "../assistant-lift";

const box = (top: number, left: number, right: number, height = 120) => ({ top, left, right, height });

describe("liftAbove", () => {
  it("lifts the button above a composer that reaches the right corner", () => {
    // Phone 390×844: composer from x 16 to 374, top at y 650.
    expect(liftAbove([box(650, 16, 374)], 390, 844)).toBe(844 - 650 + 12);
  });

  it("ignores elements away from the right corner and hidden ones", () => {
    // Desktop: main composer ends left of an open side panel.
    expect(liftAbove([box(900, 300, 1100)], 1440, 1000)).toBe(0);
    expect(liftAbove([box(650, 16, 374, 0)], 390, 844)).toBe(0);
  });

  it("clears the highest of several composers in the corner", () => {
    expect(liftAbove([box(900, 300, 1440), box(800, 1040, 1440)], 1440, 1000)).toBe(212);
  });
});
