// xenaxio step 93: where the frames of a moving background come from. Each
// source draws its current frame onto a canvas of the camera's size (step 93,
// part 0: going through a canvas of that size keeps the upload to WebGL under
// a millisecond; a GIF frame straight from the decoder took 75 ms).
import type { BackgroundSource, SceneId } from "@/lib/xenaxio/meet-background";
import { type Ctx2D, drawScene } from "@/lib/xenaxio/meet-scenes";
import { type PanoramaView, panoramaCrops, SWAY_ZOOM } from "@/lib/xenaxio/meet-panorama";

export interface FrameSource {
  /** Draws the frame for `now` (ms, performance.now()); false when there is nothing to draw yet. */
  draw(ctx: Ctx2D, w: number, h: number, now: number): Promise<boolean> | boolean;
  close(): void;
}

/** Draws a picture so it covers the whole canvas, cut at the sides or top and bottom. */
function cover(ctx: Ctx2D, image: CanvasImageSource, iw: number, ih: number, w: number, h: number): void {
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, w, h);
}

function sceneSource(id: SceneId): FrameSource {
  const start = typeof performance === "undefined" ? 0 : performance.now();
  return {
    draw: (ctx, w, h, now) => {
      drawScene(id, ctx, w, h, (now - start) / 1000);
      return true;
    },
    close: () => undefined,
  };
}

/** The file: one's own is at hand; the company's or ours comes from this origin. */
async function load(url: string, blob?: Blob): Promise<Blob> {
  if (blob) return blob;
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`background ${res.status}`);
  return res.blob();
}

async function panoramaSource(url: string, view: PanoramaView, blob?: Blob): Promise<FrameSource> {
  const pano = await createImageBitmap(await load(url, blob));
  let last = performance.now();
  return {
    draw: (ctx, w, h, now) => {
      const { yaw, pitch } = view.step((now - last) / 1000);
      last = now;
      const roll = view.roll();
      if (roll) {
        // On board: the horizon tilts; the picture is a little larger so no corner shows.
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate((roll * Math.PI) / 180);
        ctx.scale(SWAY_ZOOM, SWAY_ZOOM);
        ctx.translate(-w / 2, -h / 2);
      }
      for (const c of panoramaCrops(pano.width, pano.height, w, h, yaw, pitch)) ctx.drawImage(pano, c.sx, c.sy, c.sw, c.sh, c.dx, 0, c.dw, h);
      if (roll) ctx.restore();
      return true;
    },
    close: () => pano.close(),
  };
}

interface Decoder {
  tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
  completed: Promise<void>;
  decode(o: { frameIndex: number }): Promise<{ image: VideoFrame }>;
  close(): void;
}
type DecoderCtor = new (init: { data: ReadableStream<Uint8Array> | BufferSource; type: string }) => Decoder;

/** Whether this browser can read a GIF frame by frame (Chromium; Firefox 133+; Safari: not confirmed). */
export function gifFramesSupported(): boolean {
  return typeof (globalThis as { ImageDecoder?: unknown }).ImageDecoder !== "undefined";
}

/**
 * A GIF: frame by frame, each shown as long as the GIF says. Without
 * ImageDecoder the first frame stands still (`still` tells the picker).
 */
async function gifSource(url: string, file?: Blob): Promise<FrameSource & { still: boolean }> {
  const blob = await load(url, file);
  const D = (globalThis as { ImageDecoder?: DecoderCtor }).ImageDecoder;
  if (!D) {
    const still = await createImageBitmap(blob);
    return { still: true, draw: (ctx, w, h) => (cover(ctx, still, still.width, still.height, w, h), true), close: () => still.close() };
  }
  const decoder = new D({ data: await blob.arrayBuffer(), type: "image/gif" });
  await decoder.tracks.ready;
  await decoder.completed;
  const count = Math.max(1, decoder.tracks.selectedTrack?.frameCount ?? 1);
  let index = 0;
  let shownAt = 0;
  let frame: VideoFrame | null = null;
  let busy = false;
  return {
    still: false,
    draw: async (ctx, w, h, now) => {
      const wait = (frame?.duration ?? 100_000) / 1000;
      if (!busy && (!frame || now - shownAt >= Math.max(20, wait))) {
        busy = true;
        try {
          const { image } = await decoder.decode({ frameIndex: index });
          frame?.close();
          frame = image;
          shownAt = now;
          index = (index + 1) % count;
        } finally {
          busy = false;
        }
      }
      if (!frame) return false;
      cover(ctx, frame, frame.displayWidth, frame.displayHeight, w, h);
      return true;
    },
    close: () => {
      frame?.close();
      decoder.close();
    },
  };
}

/** A video, muted and looping. Loaded whole first (the platform answers without ranges; Safari wants them for a streamed video). */
async function videoSource(url: string, file?: Blob): Promise<FrameSource> {
  const objectUrl = URL.createObjectURL(await load(url, file));
  const video = document.createElement("video");
  Object.assign(video, { muted: true, loop: true, playsInline: true, src: objectUrl });
  video.setAttribute("playsinline", "");
  await video.play();
  return {
    draw: (ctx, w, h) => {
      if (video.readyState < 2 || !video.videoWidth) return false;
      cover(ctx, video, video.videoWidth, video.videoHeight, w, h);
      return true;
    },
    close: () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
    },
  };
}

/** The frames of a moving background; null for one that stands still (blur, a picture, none). */
export async function frameSource(source: BackgroundSource, view: PanoramaView): Promise<(FrameSource & { still?: boolean }) | null> {
  switch (source.type) {
    case "scene":
      return sceneSource(source.id);
    case "panorama":
      return panoramaSource(source.url, view, source.blob);
    case "animation":
      return source.mime === "image/gif" ? gifSource(source.url, source.blob) : videoSource(source.url, source.blob);
    default:
      return null;
  }
}
