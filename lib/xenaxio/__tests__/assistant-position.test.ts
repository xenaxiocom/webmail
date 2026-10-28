import { describe, expect, it } from "vitest";
import { cleanPositions, deviceFor, isDrag, spotAt, spotStyle } from "../assistant-position";

describe("assistant button position", () => {
  it("tells phones, tablets and desktops apart by window width", () => {
    expect(deviceFor(390)).toBe("phone");
    expect(deviceFor(767)).toBe("phone");
    expect(deviceFor(768)).toBe("tablet");
    expect(deviceFor(1279)).toBe("tablet");
    expect(deviceFor(1280)).toBe("desktop");
  });

  it("keeps the place as shares of the window, within 0…1", () => {
    expect(spotAt(195, 422, 390, 844)).toEqual({ x: 0.5, y: 0.5 });
    expect(spotAt(-40, 900, 390, 844)).toEqual({ x: 0, y: 1 });
    expect(spotAt(100, 100, 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("only a real move is a drag", () => {
    expect(isDrag(3, 4)).toBe(false);
    expect(isDrag(4, 4)).toBe(true);
  });

  it("keeps the button inside the window and above the phone navigation", () => {
    const phone = spotStyle({ x: 0.9, y: 0.95 }, "phone");
    expect(phone.left).toContain("calc(90% - 24px)");
    expect(phone.top).toContain("6rem");
    expect(spotStyle({ x: 0.9, y: 0.95 }, "desktop").top).not.toContain("6rem");
  });

  it("drops anything that is not a place", () => {
    expect(cleanPositions({ phone: { x: 0.2, y: 0.3 }, tablet: { x: 2, y: 0 }, tv: { x: 0, y: 0 }, desktop: "x" })).toEqual({ phone: { x: 0.2, y: 0.3 } });
    expect(cleanPositions(null)).toEqual({});
  });
});
