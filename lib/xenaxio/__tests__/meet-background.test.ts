import { afterEach, describe, expect, it } from "vitest";
import {
  COMPANY_IMAGE,
  effectiveChoice,
  imageUrl,
  MEET_PICTURES,
  NO_EFFECT,
  OWN_IMAGE,
  ownPicture,
  saveChoice,
  saveOwnPicture,
  savedChoice,
} from "@/lib/xenaxio/meet-background";

// Step 92: which background the camera shows — the person's own choice in this
// browser, else the company's picture when the admin made it the default.
afterEach(() => localStorage.clear());

const company = { url: "/api/meet/background?v=abc", default: true };
const OWN = "data:image/jpeg;base64,AAAA";

describe("meeting background choice", () => {
  it("starts with the company's picture only when the admin made it the default", () => {
    expect(effectiveChoice(null, company, null)).toEqual({ kind: "image", id: COMPANY_IMAGE });
    expect(effectiveChoice(null, { ...company, default: false }, null)).toEqual(NO_EFFECT);
    expect(effectiveChoice(null, null, null)).toEqual(NO_EFFECT);
    // The person's own choice wins, also "none".
    expect(effectiveChoice({ kind: "none" }, company, null)).toEqual(NO_EFFECT);
    expect(effectiveChoice({ kind: "blur", strength: "strong" }, company, null)).toEqual({ kind: "blur", strength: "strong" });
  });

  it("falls back to nothing when the picture is gone", () => {
    expect(effectiveChoice({ kind: "image", id: COMPANY_IMAGE }, null, null)).toEqual(NO_EFFECT);
    expect(effectiveChoice({ kind: "image", id: OWN_IMAGE }, company, null)).toEqual(NO_EFFECT);
    expect(effectiveChoice({ kind: "image", id: OWN_IMAGE }, null, OWN)).toEqual({ kind: "image", id: OWN_IMAGE });
    expect(effectiveChoice({ kind: "image", id: "img-gone" }, null, null)).toEqual(NO_EFFECT);
  });

  it("knows where each picture is", () => {
    const first = MEET_PICTURES[0]!;
    expect(MEET_PICTURES.length).toBeGreaterThanOrEqual(6);
    expect(imageUrl({ kind: "image", id: first.id }, null, null)).toBe(`${location.origin}/xenaxio/backgrounds/${first.id}-light.webp`);
    expect(imageUrl({ kind: "image", id: COMPANY_IMAGE }, company, null)).toBe(`${location.origin}/api/meet/background?v=abc`);
    expect(imageUrl({ kind: "image", id: OWN_IMAGE }, null, OWN)).toBe(OWN);
    expect(imageUrl({ kind: "blur", strength: "light" }, company, OWN)).toBeNull();
  });

  it("remembers the choice and one's own picture in this browser, and ignores anything else", () => {
    expect(savedChoice()).toBeNull();
    saveChoice({ kind: "blur", strength: "light" });
    expect(savedChoice()).toEqual({ kind: "blur", strength: "light" });
    for (const bad of ['{"kind":"blur","strength":"max"}', '{"kind":"image"}', "[]", "not json"]) {
      localStorage.setItem("xenaxio-meet-background", bad);
      expect(savedChoice()).toBeNull();
    }
    expect(saveOwnPicture(OWN)).toBe(true);
    expect(ownPicture()).toBe(OWN);
    localStorage.setItem("xenaxio-meet-background-own", "javascript:alert(1)");
    expect(ownPicture()).toBeNull();
    saveOwnPicture(null);
    expect(ownPicture()).toBeNull();
  });
});
