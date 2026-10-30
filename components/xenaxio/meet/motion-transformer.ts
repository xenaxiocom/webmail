// xenaxio step 93: LiveKit's background transformer (@livekit/track-processors,
// Apache-2.0) with a background that moves. A loop of its own draws the next
// background frame 15 times a second onto a canvas of the camera's size; each
// camera frame first puts the newest one in place, then is processed as usual
// (step 93, part 0, docs/decisions.md). The package is pinned (0.8.2): this
// uses its exported classes and the transformer's WebGL helper, and the tests
// notice when an update changes them.
import { BackgroundTransformer, type TrackTransformerDestroyOptions } from "@livekit/track-processors";
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
      return original(mask);
    };
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

  async transform(frame: VideoFrame, controller: TransformStreamDefaultController<VideoFrame>) {
    this.size = [frame.displayWidth, frame.displayHeight];
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
