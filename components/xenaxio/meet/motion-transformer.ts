// xenaxio step 93: LiveKit's background transformer (@livekit/track-processors,
// Apache-2.0) with a background that moves. A loop of its own draws the next
// background frame 15 times a second onto a canvas of the camera's size; each
// camera frame first puts the newest one in place, then is processed as usual
// (step 93, part 0, docs/decisions.md). The package is pinned (0.8.2): this
// uses its exported classes and the transformer's WebGL helper, and the tests
// notice when an update changes them.
//
// Step 94: a steadier edge around the person — the model's confidence,
// smoothed over frames (lib/xenaxio/meet-mask.ts), instead of its yes/no mask.
import { BackgroundTransformer, type TrackTransformerDestroyOptions } from "@livekit/track-processors";
import { MaskSmoother, REFINED_BIAS } from "@/lib/xenaxio/meet-mask";
import { brightness, GUIDE_MAX_MS, GUIDE_WIDTH, GuidedFilter, shrink } from "@/lib/xenaxio/meet-guided";
import type { FrameSource } from "@/lib/xenaxio/meet-motion";
import { type PanoramaView, personCentre } from "@/lib/xenaxio/meet-panorama";

/** Frames of the background per second. */
export const MOTION_FPS = 15;
/** A camera frame taking longer than this on average (30 frames) pauses the motion. */
export const SLOW_FRAME_MS = 55;
const SLOW_WINDOW = 30;
/** How often the person's place is read from the mask (a read from the GPU costs a little). */
const HEAD_EVERY_MS = 200;

/** Shown for the moment between choosing a moving background and its first frame. */
export const PLACEHOLDER = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNQUFAAAADEAGEplfmwAAAAAElFTkSuQmCC";

interface MaskLike {
  width: number;
  height: number;
  getAsUint8Array(): Uint8Array;
}

/** What the segmenter hands over each frame (MediaPipe's ImageSegmenterResult, the parts used here). */
interface SegmentResult {
  confidenceMasks?: { width: number; height: number; getAsFloat32Array(): Float32Array }[];
}
interface Segmenter {
  setOptions(o: { outputConfidenceMasks: boolean }): Promise<void>;
  segmentForVideo(frame: unknown, timestamp: number, callback: (result: SegmentResult) => void): void;
}

type BackgroundOptions = ConstructorParameters<typeof BackgroundTransformer>[0];

export class MotionBackgroundTransformer extends BackgroundTransformer {
  private motion: FrameSource | null = null;
  private view: PanoramaView | null = null;
  private canvas2d: OffscreenCanvas | null = null;
  private size: [number, number] = [0, 0];
  private ready: ImageBitmap | null = null;
  private shown: ImageBitmap | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private costs: number[] = [];
  private lastHead = 0;
  private autoPause = true;
  paused = false;
  /** Tells the picker when the motion stops to spare the computer, or goes on again. */
  onPausedChange: ((paused: boolean) => void) | null = null;
  /** Step 94: the smoothed mask of this frame is in place, so the yes/no one is not used. */
  private smoothedThisFrame = false;
  private smoother = new MaskSmoother();
  private maskTexture: WebGLTexture | null = null;
  /** Step 94: off when this browser cannot give the model's confidence (the yes/no mask then serves). */
  softMask = true;
  /** Step 95: the mask's edge follows the picture; off by itself on a device where it costs too much. */
  refineEdge = true;
  private guideCanvas: OffscreenCanvas | null = null;
  private guide: Float32Array | null = null;
  private guideFactor = 1;
  private filter: GuidedFilter | null = null;
  private small: Float32Array | null = null;
  private refined: Float32Array | null = null;
  private refineCosts: number[] = [];
  private guideMs = 0;

  constructor(options: BackgroundOptions) {
    super(options);
    // The person's place for a panorama's view, read from the mask before the
    // package closes it. updateMask is private in the package's types only.
    const self = this as unknown as { updateMask(mask?: MaskLike): Promise<void> };
    const original = self.updateMask.bind(this);
    self.updateMask = async (mask?: MaskLike) => {
      if (mask && this.view && !this.view.gyroscope && performance.now() - this.lastHead >= HEAD_EVERY_MS) {
        this.lastHead = performance.now();
        try {
          const centre = personCentre(mask.getAsUint8Array(), mask.width, mask.height);
          if (centre) this.view.setHead(centre.x, centre.y);
        } catch {
          // No reading this time.
        }
      }
      if (this.smoothedThisFrame) return;
      return original(mask);
    };
  }

  /** Step 94: the model also gives its confidence, and each result goes through the smoother first. */
  async init(options: Parameters<BackgroundTransformer["init"]>[0]) {
    await super.init(options);
    this.maskTexture = null;
    this.smoother.reset();
    const segmenter = this.imageSegmenter as unknown as Segmenter | undefined;
    if (!segmenter || !this.softMask) return;
    try {
      await segmenter.setOptions({ outputConfidenceMasks: true });
    } catch {
      this.softMask = false;
      return;
    }
    const segment = segmenter.segmentForVideo.bind(segmenter);
    segmenter.segmentForVideo = (frame, timestamp, callback) =>
      segment(frame, timestamp, (result) => {
        this.smoothedThisFrame = this.showSmoothedMask(result);
        try {
          callback(result);
        } finally {
          this.smoothedThisFrame = false;
        }
      });
  }

  /**
   * The mask's bytes: smoothed over frames (step 94) and, with a guide of this
   * frame, its edge following the picture on the small copy (step 95).
   */
  private maskBytes(confidence: { width: number; height: number; getAsFloat32Array(): Float32Array }): { mask: Uint8Array; width: number; height: number } {
    const full = confidence.getAsFloat32Array();
    const f = this.guideFactor;
    const w = Math.floor(confidence.width / f);
    const h = Math.floor(confidence.height / f);
    const guide = this.guide;
    if (!this.refineEdge || !guide || !this.filter || guide.length !== w * h || this.filter.width !== w) {
      return { mask: this.smoother.next(full), width: confidence.width, height: confidence.height };
    }
    const started = performance.now();
    shrink(full, confidence.width, confidence.height, f, this.small!);
    this.filter.apply(guide, this.smoother.smooth(this.small!), this.refined!);
    const mask = this.smoother.toBytes(this.refined!, REFINED_BIAS);
    // Too dear on this device (with taking the guide): the step 94 mask from now on.
    this.refineCosts.push(performance.now() - started + this.guideMs);
    if (this.refineCosts.length > 30) this.refineCosts.shift();
    if (this.refineCosts.length === 30 && this.refineCosts.reduce((a, b) => a + b, 0) / 30 > GUIDE_MAX_MS) {
      this.refineEdge = false;
      this.smoother.reset();
    }
    return { mask, width: w, height: h };
  }

  /** Puts the smoothed mask where the package's own would go; false when it cannot (the yes/no mask then serves). */
  private showSmoothedMask(result: SegmentResult): boolean {
    const confidence = result.confidenceMasks?.[0];
    const canvas = this.canvas;
    if (!this.softMask || !confidence || !canvas || !this.gl) return false;
    try {
      const { mask, width, height } = this.maskBytes(confidence);
      const gl = canvas.getContext("webgl2") as WebGL2RenderingContext | null;
      if (!gl) return false;
      // The context is shared with MediaPipe and the package: what is changed here is put back.
      const bound = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
      const alignment = gl.getParameter(gl.UNPACK_ALIGNMENT) as number;
      const flip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL) as boolean;
      if (!this.maskTexture) {
        this.maskTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      } else {
        gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
      }
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, mask);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, alignment);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flip);
      gl.bindTexture(gl.TEXTURE_2D, bound);
      if (!this.maskTexture) return false;
      this.gl.updateMask(this.maskTexture);
      return true;
    } catch {
      // Once is enough: from now on the yes/no mask.
      this.softMask = false;
      return false;
    }
  }

  /** The moving background (null: none); the view of a panorama goes with it. */
  setMotion(motion: FrameSource | null, view: PanoramaView | null = null): void {
    this.stopLoop();
    this.motion?.close();
    this.motion = motion;
    this.view = view;
    this.ready?.close();
    this.ready = null;
    this.costs = [];
    this.setPaused(false);
  }

  /** "Play anyway": the person wants the motion even if the computer is slow. */
  playAnyway(): void {
    this.autoPause = false;
    this.costs = [];
    this.setPaused(false);
  }

  private setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) this.stopLoop();
    this.onPausedChange?.(paused);
  }

  private stopLoop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private startLoop(): void {
    if (this.timer || !this.motion || this.paused) return;
    const tick = async () => {
      const started = performance.now();
      const motion = this.motion;
      const [w, h] = this.size;
      if (motion && w > 0 && h > 0) {
        if (!this.canvas2d || this.canvas2d.width !== w || this.canvas2d.height !== h) this.canvas2d = new OffscreenCanvas(w, h);
        const ctx = this.canvas2d.getContext("2d");
        try {
          if (ctx && (await motion.draw(ctx, w, h, started)) && motion === this.motion) {
            const bitmap = await createImageBitmap(this.canvas2d);
            this.ready?.close();
            this.ready = bitmap;
          }
        } catch {
          // This frame is skipped; the next one tries again.
        }
      }
      if (this.timer === null || motion !== this.motion || this.paused) return;
      this.timer = setTimeout(() => void tick(), Math.max(0, 1000 / MOTION_FPS - (performance.now() - started)));
    };
    this.timer = setTimeout(() => void tick(), 0);
  }

  /** Step 95: the frame's brightness on a small copy, the guide for the mask's edge (the segmenter sees the same frame next). */
  private takeGuide(frame: VideoFrame): void {
    if (!this.softMask || !this.refineEdge) return;
    try {
      const factor = Math.max(1, Math.round(frame.displayWidth / GUIDE_WIDTH));
      const w = Math.floor(frame.displayWidth / factor);
      const h = Math.floor(frame.displayHeight / factor);
      if (!this.guideCanvas || this.guideCanvas.width !== w || this.guideCanvas.height !== h) {
        this.guideCanvas = new OffscreenCanvas(w, h);
        this.guide = new Float32Array(w * h);
        this.small = new Float32Array(w * h);
        this.refined = new Float32Array(w * h);
        this.filter = new GuidedFilter(w, h);
      }
      this.guideFactor = factor;
      const ctx = this.guideCanvas.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | null;
      if (!ctx) throw new Error("no canvas");
      ctx.drawImage(frame, 0, 0, w, h);
      brightness(ctx.getImageData(0, 0, w, h).data, this.guide!);
    } catch {
      this.refineEdge = false;
    }
  }

  async transform(frame: VideoFrame, controller: TransformStreamDefaultController<VideoFrame>) {
    this.size = [frame.displayWidth, frame.displayHeight];
    const guideStarted = performance.now();
    this.takeGuide(frame);
    this.guideMs = performance.now() - guideStarted;
    if (this.motion && !this.paused) this.startLoop();
    const next = this.ready;
    if (next && this.gl) {
      this.ready = null;
      // Waited for: setBackgroundImage puts a blank in place first.
      await this.gl.setBackgroundImage(next);
      // The package keeps the picture shown (it crops it again when the size changes).
      this.shown?.close();
      this.shown = next;
    }
    const started = performance.now();
    await super.transform(frame, controller);
    if (this.motion && this.autoPause && !this.paused) {
      this.costs.push(performance.now() - started);
      if (this.costs.length > SLOW_WINDOW) this.costs.shift();
      if (this.costs.length === SLOW_WINDOW && this.costs.reduce((a, b) => a + b, 0) / SLOW_WINDOW > SLOW_FRAME_MS) this.setPaused(true);
    }
  }

  async destroy(options?: TrackTransformerDestroyOptions) {
    this.stopLoop();
    await super.destroy(options);
    // A restart (another camera) keeps the motion; the end of the track does not.
    if (!options?.willProcessorRestart) {
      this.motion?.close();
      this.motion = null;
      this.ready?.close();
      this.ready = null;
      this.shown?.close();
      this.shown = null;
    }
  }
}
