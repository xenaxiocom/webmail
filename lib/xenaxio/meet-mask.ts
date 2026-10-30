// xenaxio step 94: a steadier edge around the person. MediaPipe's selfie model
// says, for every point of the frame, how sure it is that it is the person
// (0..1). LiveKit's processor uses only the yes/no mask of it, decided anew
// every frame, so the edge (hair, shoulders, fingers) flickers and shows holes.
// Here the confidence is smoothed over frames (a big jump follows quickly, so a
// moving person does not trail) and leans towards the person: a point counts
// as background only when the model is fairly sure.
//
// Measured on a video of a person with a busy background (step 94, part 0,
// docs/decisions.md in es-ua/xenaxio): flicker of the edge down by a third.

/** How much of the new frame goes into the mask (the rest is the previous mask). */
export const MASK_SMOOTHING = 0.5;
/** A jump bigger than MASK_JUMP (someone moved) is followed almost at once. */
export const MASK_FAST = 0.85;
export const MASK_JUMP = 0.6;
/** Background only above this much certainty: the person's edge wins over holes. */
export const PERSON_BIAS = 0.15;

/**
 * Turns the model's person-confidence of each frame into the processor's mask
 * (one byte per point, 255 = background, 0 = person, as MediaPipe's own).
 */
export class MaskSmoother {
  private background: Float32Array | null = null;
  private out: Uint8Array | null = null;

  /** `confidence`: how sure the model is that each point is the person, 0..1. */
  next(confidence: Float32Array): Uint8Array {
    const n = confidence.length;
    if (!this.background || this.background.length !== n) {
      this.background = Float32Array.from(confidence, (c) => 1 - c);
      this.out = new Uint8Array(n);
    }
    const bg = this.background;
    const out = this.out!;
    const scale = 255 / (1 - PERSON_BIAS);
    for (let i = 0; i < n; i++) {
      const now = 1 - confidence[i]!;
      const was = bg[i]!;
      const smoothed = was + (now - was) * (Math.abs(now - was) > MASK_JUMP ? MASK_FAST : MASK_SMOOTHING);
      bg[i] = smoothed;
      const v = (smoothed - PERSON_BIAS) * scale;
      out[i] = v <= 0 ? 0 : v >= 255 ? 255 : v;
    }
    return out;
  }

  reset(): void {
    this.background = null;
    this.out = null;
  }
}
