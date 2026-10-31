// Step 104: profile pictures and banners, still or moving. The person moves
// the picture inside a circle (picture) or a 3:1 strip (banner); `Focus` is
// where it sits (0–100 from the left and top, as CSS object-position). A still
// picture is cut here; a moving one (GIF, animated WebP) goes up as it is, with
// its first frame cut here as the still picture lists and mail show.

export interface Focus {
  x: number;
  y: number;
}

export const CENTER: Focus = { x: 50, y: 50 };

/** Where to cut a w×h image to get `aspect` (width / height), placed by `focus`. */
export function focusCrop(width: number, height: number, aspect: number, focus: Focus = CENTER): { x: number; y: number; w: number; h: number } {
  let w = width;
  let h = Math.round(width / aspect);
  if (h > height) {
    h = height;
    w = Math.round(height * aspect);
  }
  const x = Math.round(((width - w) * clamp(focus.x)) / 100);
  const y = Math.round(((height - h) * clamp(focus.y)) / 100);
  return { x, y, w, h };
}

function clamp(v: number): number {
  return Math.min(100, Math.max(0, Number.isFinite(v) ? v : 50));
}

/** CSS object-position for a focus. */
export function objectPosition(focus: { focusX?: number; focusY?: number } | Focus | null | undefined): string {
  if (!focus) return "50% 50%";
  const x = "x" in focus ? focus.x : (focus.focusX ?? 50);
  const y = "y" in focus ? focus.y : (focus.focusY ?? 50);
  return `${clamp(x)}% ${clamp(y)}%`;
}

/**
 * A moving picture, read from its first bytes: a GIF, or a WebP whose extended
 * header has the animation flag (the platform checks the same way).
 */
export async function isAnimated(file: Blob): Promise<boolean> {
  const b = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const text = (from: number, n: number) => String.fromCharCode(...b.slice(from, from + n));
  if (text(0, 6) === "GIF87a" || text(0, 6) === "GIF89a") return true;
  return b.length >= 21 && text(0, 4) === "RIFF" && text(8, 4) === "WEBP" && text(12, 4) === "VP8X" && ((b[20] ?? 0) & 0x02) !== 0;
}

/**
 * Cuts a picture (its first frame, for a moving one) to `outW`×`outH` at
 * `focus`: WebP where the browser can write it, PNG otherwise (Safari). When
 * the result is larger than `maxBytes` (a PNG photo), it is made smaller.
 */
export async function cutPicture(file: Blob, outW: number, outH: number, focus: Focus = CENTER, maxBytes = Infinity): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const { x, y, w, h } = focusCrop(bitmap.width, bitmap.height, outW / outH, focus);
    // Never larger than the picture itself.
    let scale = Math.min(1, w / outW);
    for (let i = 0; ; i++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(outW * scale));
      canvas.height = Math.max(1, Math.round(outH * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, x, y, w, h, 0, 0, canvas.width, canvas.height);
      const blob = await encode(canvas);
      if (blob.size <= maxBytes || i >= 6) return blob;
      scale *= 0.75;
    }
  } finally {
    bitmap.close();
  }
}

async function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  if (webp && (webp.type === "image/webp" || webp.type === "image/png")) return webp;
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!png) throw new Error("no image");
  return png;
}
