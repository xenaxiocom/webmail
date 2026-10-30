import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Steps 92 and 93: the background behind one's own camera. LiveKit's processor
// classes are stand-ins that record what the meeting asks of them; MediaPipe is
// never loaded.
const made = vi.hoisted(() => [] as { transformer: Record<string, unknown>; name: string; switches: unknown[] }[]);
const base = vi.hoisted(() => ({ transforms: 0, uploads: [] as unknown[], destroyed: [] as unknown[] }));
vi.mock("@livekit/track-processors", () => {
  class BackgroundTransformer {
    options: Record<string, unknown>;
    gl = { setBackgroundImage: async (b: unknown) => void base.uploads.push(b) };
    constructor(options: Record<string, unknown>) {
      this.options = options;
    }
    async transform() {
      base.transforms++;
    }
    async destroy(o?: unknown) {
      base.destroyed.push(o);
    }
    async updateMask() {}
  }
  class BackgroundProcessorWrapper {
    switches: unknown[] = [];
    constructor(
      readonly transformer: Record<string, unknown>,
      readonly name: string,
    ) {
      made.push(this as never);
    }
    async switchTo(o: unknown) {
      this.switches.push(o);
    }
  }
  return { BackgroundTransformer, BackgroundProcessorWrapper };
});
const motion = vi.hoisted(() => ({ closed: 0 }));
vi.mock("@/lib/xenaxio/meet-motion", () => ({
  frameSource: async (source: { type: string }) =>
    source.type === "scene" || source.type === "panorama" || source.type === "animation"
      ? { draw: () => true, close: () => void motion.closed++, ...(source.type === "animation" ? { still: true } : {}) }
      : null,
}));

import type { LocalVideoTrack } from "livekit-client";
import { BackgroundPicker, backgroundsSupported, useBackgroundEffect } from "../meet/background";
import { MotionBackgroundTransformer, SLOW_FRAME_MS } from "../meet/motion-transformer";
import { MeetLangProvider } from "../meet/lang";
import type { BackgroundSource } from "@/lib/xenaxio/meet-background";

class FakeTrack {
  processor: { name: string } | undefined;
  setProcessor = vi.fn(async (p: { name: string }) => {
    if (this.fail) throw new Error("no webgl");
    this.processor = p;
  });
  stopProcessor = vi.fn(async () => {
    this.processor = undefined;
  });
  getProcessor = () => this.processor;
  constructor(private readonly fail = false) {}
}

/** What a browser that can do it has (jsdom has none of it). */
function canDoIt() {
  vi.stubGlobal("OffscreenCanvas", class {});
  vi.stubGlobal("VideoFrame", class {});
  vi.stubGlobal("createImageBitmap", async () => ({ close: () => undefined }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(((kind: string) => (kind === "webgl2" ? {} : null)) as never);
  Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", { value: () => ({}), configurable: true });
}

beforeEach(() => {
  made.length = 0;
  base.transforms = 0;
  base.uploads.length = 0;
  motion.closed = 0;
  localStorage.setItem("locale-storage", JSON.stringify({ state: { locale: "de" } }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (HTMLCanvasElement.prototype as { captureStream?: unknown }).captureStream;
  localStorage.clear();
});

describe("step 92: background effect on the camera", () => {
  it("is offered only where the browser can do it", () => {
    expect(backgroundsSupported()).toBe(false);
    canDoIt();
    expect(backgroundsSupported()).toBe(true);
  });

  it("puts one processor on the track, switches it in place, and takes it off for none", async () => {
    canDoIt();
    const track = new FakeTrack();
    const { result, rerender } = renderHook(({ source }: { source: BackgroundSource }) => useBackgroundEffect(track as unknown as LocalVideoTrack, source), {
      initialProps: { source: { type: "none" } as BackgroundSource },
    });
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(track.setProcessor).not.toHaveBeenCalled();

    rerender({ source: { type: "blur", radius: 14 } });
    await waitFor(() => expect(track.setProcessor).toHaveBeenCalledTimes(1));
    expect(made[0]!.name).toBe("xenaxio-background");
    expect(made[0]!.transformer.options).toMatchObject({
      blurRadius: 14,
      assetPaths: { tasksVisionFileSet: `${location.origin}/xenaxio/meet/vision`, modelAssetPath: `${location.origin}/xenaxio/meet/selfie_segmenter.tflite` },
    });

    rerender({ source: { type: "image", url: "https://x/sea.webp" } });
    await waitFor(() => expect(made[0]!.switches).toEqual([{ mode: "virtual-background", imagePath: "https://x/sea.webp" }]));
    expect(track.setProcessor).toHaveBeenCalledTimes(1);

    rerender({ source: { type: "none" } });
    await waitFor(() => expect(track.stopProcessor).toHaveBeenCalledTimes(1));
    expect(result.current.failed).toBe(false);
  });

  it("says so when the browser cannot, and leaves the plain camera", async () => {
    canDoIt();
    const track = new FakeTrack(true);
    const { result } = renderHook(() => useBackgroundEffect(track as unknown as LocalVideoTrack, { type: "blur", radius: 6 }));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(track.stopProcessor).toHaveBeenCalled();
  });
});

describe("step 93: backgrounds that move", () => {
  it("gives a moving background to the transformer, and a GIF the browser cannot play says so", async () => {
    canDoIt();
    const track = new FakeTrack();
    const { result, rerender } = renderHook(({ source }: { source: BackgroundSource }) => useBackgroundEffect(track as unknown as LocalVideoTrack, source), {
      initialProps: { source: { type: "scene", id: "clouds" } as BackgroundSource },
    });
    await waitFor(() => expect(track.setProcessor).toHaveBeenCalledTimes(1));
    expect(made[0]!.transformer.options).toMatchObject({ imagePath: expect.stringMatching(/^data:image\/png;base64,/) });
    rerender({ source: { type: "animation", url: "blob:gif", mime: "image/gif" } });
    await waitFor(() => expect(result.current.still).toBe(true));
    // The scene's frames end when the animation takes over; the processor stays.
    expect(motion.closed).toBe(1);
    expect(track.setProcessor).toHaveBeenCalledTimes(1);
    rerender({ source: { type: "blur", radius: 6 } });
    await waitFor(() => expect(motion.closed).toBe(2));
    expect(made[0]!.switches.at(-1)).toEqual({ mode: "background-blur", blurRadius: 6 });
  });

  it("puts the newest background frame in place before each camera frame, and pauses when the computer is slow", async () => {
    vi.useFakeTimers();
    canDoIt();
    vi.stubGlobal("OffscreenCanvas", class {
      constructor(
        readonly width: number,
        readonly height: number,
      ) {}
      getContext() {
        return {};
      }
    });
    let bitmaps = 0;
    vi.stubGlobal("createImageBitmap", async () => ({ id: ++bitmaps, close: () => undefined }));
    const t = new MotionBackgroundTransformer({ imagePath: "data:x" } as never);
    const paused: boolean[] = [];
    t.onPausedChange = (p) => paused.push(p);
    const draw = vi.fn(() => true);
    t.setMotion({ draw, close: () => undefined });
    const frame = { displayWidth: 640, displayHeight: 360 } as VideoFrame;
    await t.transform(frame, {} as never);
    await vi.advanceTimersByTimeAsync(70);
    expect(draw).toHaveBeenCalled();
    await t.transform(frame, {} as never);
    expect(base.uploads).toHaveLength(1);
    expect(base.transforms).toBe(2);

    // Slow frames: after 30 of them the motion stops; "play anyway" starts it again for good.
    const now = vi.spyOn(performance, "now");
    let clock = 1000;
    now.mockImplementation(() => (clock += SLOW_FRAME_MS + 5));
    for (let i = 0; i < 31; i++) await t.transform(frame, {} as never);
    expect(paused).toEqual([true]);
    expect(t.paused).toBe(true);
    t.playAnyway();
    for (let i = 0; i < 31; i++) await t.transform(frame, {} as never);
    expect(paused).toEqual([true, false]);
    now.mockRestore();
    await t.destroy();
    expect(t.paused).toBe(false);
  });

  it("reads the person's place from the mask for a panorama, at most five times a second", async () => {
    const { PanoramaView } = await import("@/lib/xenaxio/meet-panorama");
    const t = new MotionBackgroundTransformer({ imagePath: "data:x" } as never);
    const view = new PanoramaView();
    const setHead = vi.spyOn(view, "setHead");
    t.setMotion({ draw: () => true, close: () => undefined }, view);
    const data = new Uint8Array(64 * 64).fill(1);
    for (let y = 10; y < 64; y++) for (let x = 40; x < 60; x++) data[y * 64 + x] = 0;
    const mask = { width: 64, height: 64, getAsUint8Array: vi.fn(() => data) };
    const update = (t as unknown as { updateMask(m: unknown): Promise<void> }).updateMask;
    await update(mask);
    await update(mask);
    expect(mask.getAsUint8Array).toHaveBeenCalledTimes(1);
    expect(setHead.mock.calls[0]![0]).toBeGreaterThan(0.1);
  });
});

describe("step 92 and 93: choosing the background", () => {
  const effect = { failed: false, busy: false, paused: false, still: false, playAnyway: () => undefined };
  const props = { onOwnFile: async () => true, own: null };

  it("offers effects, pictures, moving scenes and panoramas; the company's only when there is one", () => {
    const onChoose = vi.fn();
    const { rerender } = render(
      <MeetLangProvider>
        <BackgroundPicker choice={{ kind: "none" }} onChoose={onChoose} company={null} {...props} effect={effect} />
      </MeetLangProvider>,
    );
    expect(screen.getByRole("button", { name: "Kein Effekt" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Hintergrund der Firma" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stark weichzeichnen" }));
    expect(onChoose).toHaveBeenLastCalledWith({ kind: "blur", strength: "strong" });
    fireEvent.click(screen.getByRole("button", { name: "Meer" }));
    expect(onChoose).toHaveBeenLastCalledWith({ kind: "image", id: "img-sea" });
    fireEvent.click(screen.getByRole("button", { name: "Nordlicht" }));
    expect(onChoose).toHaveBeenLastCalledWith({ kind: "scene", id: "aurora" });
    fireEvent.click(screen.getByRole("button", { name: "Alpen" }));
    expect(onChoose).toHaveBeenLastCalledWith({ kind: "panorama", id: "pano-alps" });
    // Eight panoramas at first; the rest behind "show all".
    expect(screen.queryByRole("button", { name: "Loft" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Alle 25 anzeigen" }));
    fireEvent.click(screen.getByRole("button", { name: "Loft" }));
    expect(onChoose).toHaveBeenLastCalledWith({ kind: "panorama", id: "pano-loft" });
    expect(screen.getByRole("button", { name: "An Bord eines Schiffs" })).toBeInTheDocument();
    expect(screen.getByText("Panoramen 360°")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eigenes Bild, GIF, Video oder Panorama hochladen" })).toBeInTheDocument();

    rerender(
      <MeetLangProvider>
        <BackgroundPicker
          choice={{ kind: "image", id: "company" }}
          onChoose={onChoose}
          company={{ url: "/api/meet/background?v=1", default: true, kind: "animation", contentType: "video/mp4" }}
          {...props}
          own={{ url: "blob:own", kind: "panorama", type: "image/jpeg" }}
          effect={effect}
        />
      </MeetLangProvider>,
    );
    const companyTile = screen.getByRole("button", { name: "Hintergrund der Firma" });
    expect(companyTile).toHaveAttribute("aria-pressed", "true");
    expect(companyTile.querySelector("video")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Eigener Hintergrund" })).toHaveTextContent("360°");
    expect(screen.getByRole("button", { name: "Eigenen Hintergrund entfernen" })).toBeInTheDocument();
  });

  it("shows when it could not, when a GIF stands still, and lets a paused animation play anyway", () => {
    const playAnyway = vi.fn();
    render(
      <MeetLangProvider>
        <BackgroundPicker choice={{ kind: "scene", id: "waves" }} onChoose={() => undefined} company={null} {...props} effect={{ ...effect, failed: true, still: true, paused: true, playAnyway }} />
      </MeetLangProvider>,
    );
    expect(screen.getByText(/kann den Hintergrund gerade nicht ändern/)).toBeInTheDocument();
    expect(screen.getByText(/das erste Bild bleibt stehen/)).toBeInTheDocument();
    expect(screen.getByText(/Animation pausiert/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Trotzdem abspielen" }));
    expect(playAnyway).toHaveBeenCalled();
  });
});
