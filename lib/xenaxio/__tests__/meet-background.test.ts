import { afterEach, describe, expect, it } from "vitest";
import {
  backgroundSource,
  COMPANY_IMAGE,
  effectiveChoice,
  isMotionType,
  isPanorama,
  legacyOwnPicture,
  MEET_PICTURES,
  moves,
  NO_EFFECT,
  OWN_IMAGE,
  PANORAMAS,
  saveChoice,
  savedChoice,
  SCENES,
} from "@/lib/xenaxio/meet-background";

// Step 92: which background the camera shows — the person's own choice in this
// browser, else the company's background when the admin made it the default.
// Step 93: scenes, panoramas, and company or own files that move.
afterEach(() => localStorage.clear());

const company = { url: "/api/meet/background?v=abc", default: true };
const ownPicture = { url: "blob:own", kind: "image" as const, type: "image/jpeg" };

describe("meeting background choice", () => {
  it("starts with the company's background only when the admin made it the default", () => {
    expect(effectiveChoice(null, company, null)).toEqual({ kind: "image", id: COMPANY_IMAGE });
    expect(effectiveChoice(null, { ...company, default: false }, null)).toEqual(NO_EFFECT);
    expect(effectiveChoice(null, null, null)).toEqual(NO_EFFECT);
    // The person's own choice wins, also "none".
    expect(effectiveChoice({ kind: "none" }, company, null)).toEqual(NO_EFFECT);
    expect(effectiveChoice({ kind: "blur", strength: "strong" }, company, null)).toEqual({ kind: "blur", strength: "strong" });
    expect(effectiveChoice({ kind: "scene", id: "aurora" }, company, null)).toEqual({ kind: "scene", id: "aurora" });
  });

  it("falls back to nothing when the background is gone", () => {
    expect(effectiveChoice({ kind: "image", id: COMPANY_IMAGE }, null, null)).toEqual(NO_EFFECT);
    expect(effectiveChoice({ kind: "image", id: OWN_IMAGE }, company, null)).toEqual(NO_EFFECT);
    expect(effectiveChoice({ kind: "image", id: OWN_IMAGE }, null, ownPicture)).toEqual({ kind: "image", id: OWN_IMAGE });
    expect(effectiveChoice({ kind: "image", id: "img-gone" }, null, null)).toEqual(NO_EFFECT);
    expect(effectiveChoice({ kind: "panorama", id: "pano-gone" }, null, null)).toEqual(NO_EFFECT);
  });

  it("knows what each background is made of", () => {
    const first = MEET_PICTURES[0]!;
    expect(backgroundSource({ kind: "image", id: first.id }, null, null)).toEqual({ type: "image", url: `${location.origin}/xenaxio/backgrounds/${first.id}-light.webp` });
    expect(backgroundSource({ kind: "image", id: COMPANY_IMAGE }, company, null)).toEqual({ type: "image", url: `${location.origin}/api/meet/background?v=abc` });
    expect(backgroundSource({ kind: "image", id: COMPANY_IMAGE }, { ...company, kind: "animation", contentType: "video/mp4" }, null)).toEqual({
      type: "animation",
      url: `${location.origin}/api/meet/background?v=abc`,
      mime: "video/mp4",
    });
    expect(backgroundSource({ kind: "image", id: COMPANY_IMAGE }, { ...company, kind: "panorama", contentType: "image/jpeg" }, null)).toEqual({ type: "panorama", url: `${location.origin}/api/meet/background?v=abc` });
    expect(backgroundSource({ kind: "image", id: OWN_IMAGE }, null, { url: "blob:gif", kind: "animation", type: "image/gif" })).toEqual({ type: "animation", url: "blob:gif", mime: "image/gif" });
    // One's own file goes along as the Blob itself (CSP connect-src 'self' would block fetching a blob: URL).
    const blob = new Blob(["pano"], { type: "image/jpeg" });
    expect(backgroundSource({ kind: "image", id: OWN_IMAGE }, null, { url: "blob:pano", kind: "panorama", type: "image/jpeg", blob })).toEqual({ type: "panorama", url: "blob:pano", blob });
    expect(backgroundSource({ kind: "panorama", id: PANORAMAS[0]!.id }, null, null)).toEqual({ type: "panorama", url: `${location.origin}/xenaxio/meet/panoramas/${PANORAMAS[0]!.id}.jpg`, yaw: PANORAMAS[0]!.yaw });
    expect(backgroundSource({ kind: "scene", id: "waves" }, null, null)).toEqual({ type: "scene", id: "waves" });
    expect(backgroundSource({ kind: "blur", strength: "light" }, company, ownPicture)).toEqual({ type: "blur", radius: 6 });
    expect(moves({ type: "scene", id: "waves" })).toBe(true);
    expect(moves({ type: "image", url: "x" })).toBe(false);
    expect(moves(null)).toBe(false);
  });

  it("tells panoramas and moving files apart", () => {
    expect(isPanorama(4096, 2048)).toBe(true);
    expect(isPanorama(5760, 2880)).toBe(true);
    expect(isPanorama(1920, 1080)).toBe(false);
    expect(isPanorama(1000, 500)).toBe(false);
    for (const t of ["image/gif", "video/mp4", "video/webm"]) expect(isMotionType(t)).toBe(true);
    for (const t of ["image/png", "video/quicktime", ""]) expect(isMotionType(t)).toBe(false);
    expect(SCENES.length).toBeGreaterThanOrEqual(4);
    expect(PANORAMAS.length).toBeGreaterThanOrEqual(3);
  });

  it("remembers the choice in this browser, and ignores anything else", () => {
    expect(savedChoice()).toBeNull();
    saveChoice({ kind: "blur", strength: "light" });
    expect(savedChoice()).toEqual({ kind: "blur", strength: "light" });
    saveChoice({ kind: "scene", id: "clouds" });
    expect(savedChoice()).toEqual({ kind: "scene", id: "clouds" });
    for (const bad of ['{"kind":"blur","strength":"max"}', '{"kind":"image"}', '{"kind":"scene","id":"fire"}', "[]", "not json"]) {
      localStorage.setItem("xenaxio-meet-background", bad);
      expect(savedChoice()).toBeNull();
    }
    localStorage.setItem("xenaxio-meet-background-own", "javascript:alert(1)");
    expect(legacyOwnPicture()).toBeNull();
    localStorage.setItem("xenaxio-meet-background-own", "data:image/jpeg;base64,AAAA");
    expect(legacyOwnPicture()).toBe("data:image/jpeg;base64,AAAA");
  });
});
