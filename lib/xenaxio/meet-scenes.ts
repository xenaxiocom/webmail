// xenaxio step 93: calm moving backgrounds for meetings, drawn by code — no
// files to load and nobody else's licence. Each scene draws one frame for a
// time `t` (seconds) with a handful of canvas calls, cheap enough for 15
// frames a second next to the segmentation.
import type { SceneId } from "@/lib/xenaxio/meet-background";

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** A fixed pseudo-random sequence, so the clouds and stars stay where they were. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const CLOUDS = (() => {
  const r = seeded(7);
  return Array.from({ length: 7 }, () => ({ x: r(), y: 0.08 + r() * 0.5, size: 0.08 + r() * 0.1, speed: 0.008 + r() * 0.012, puffs: 3 + Math.floor(r() * 3) }));
})();

const STARS = (() => {
  const r = seeded(42);
  return Array.from({ length: 70 }, () => ({ x: r(), y: r() * 0.7, size: 0.5 + r() * 1.3, phase: r() * Math.PI * 2 }));
})();

function clouds(ctx: Ctx2D, w: number, h: number, t: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#5b9bd5");
  sky.addColorStop(0.7, "#b7d4ee");
  sky.addColorStop(1, "#e4eef7");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  for (const c of CLOUDS) {
    const r = c.size * w;
    const x = (((c.x + t * c.speed) % 1.3) - 0.15) * w;
    const y = c.y * h;
    for (let i = 0; i < c.puffs; i++) {
      const px = x + (i - c.puffs / 2) * r * 0.7;
      const py = y + Math.sin(i * 1.7) * r * 0.25;
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, "rgba(255,255,255,0.85)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
    }
  }
}

function waves(ctx: Ctx2D, w: number, h: number, t: number) {
  const horizon = h * 0.48;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#7fb3e0");
  sky.addColorStop(1, "#f3e3c8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);
  const sea = ctx.createLinearGradient(0, horizon, 0, h);
  sea.addColorStop(0, "#3f86b8");
  sea.addColorStop(1, "#174a73");
  ctx.fillStyle = sea;
  ctx.fillRect(0, horizon, w, h - horizon);
  // Bands of light on the water, slower and flatter towards the horizon.
  for (let i = 0; i < 9; i++) {
    const depth = i / 9;
    const y = horizon + (h - horizon) * (0.05 + depth * depth);
    const amp = 2 + depth * 10 * (h / 360);
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= w; x += w / 24) ctx.lineTo(x, y + Math.sin(x / (40 + depth * 80) + t * (0.6 + depth) + i) * amp);
    ctx.strokeStyle = `rgba(255,255,255,${0.12 + depth * 0.12})`;
    ctx.lineWidth = 1 + depth * 2;
    ctx.stroke();
  }
}

function aurora(ctx: Ctx2D, w: number, h: number, t: number) {
  const night = ctx.createLinearGradient(0, 0, 0, h);
  night.addColorStop(0, "#050a1f");
  night.addColorStop(1, "#16243f");
  ctx.fillStyle = night;
  ctx.fillRect(0, 0, w, h);
  for (const s of STARS) {
    ctx.fillStyle = `rgba(255,255,255,${0.45 + 0.4 * Math.sin(t * 1.3 + s.phase)})`;
    ctx.fillRect(s.x * w, s.y * h, s.size, s.size);
  }
  const curtains: [string, number, number][] = [
    ["46,211,162", 0.3, 0.0],
    ["120,226,255", 0.42, 1.7],
    ["170,120,255", 0.36, 3.1],
  ];
  for (const [rgb, base, phase] of curtains) {
    const g = ctx.createLinearGradient(0, h * (base - 0.2), 0, h * (base + 0.35));
    g.addColorStop(0, `rgba(${rgb},0)`);
    g.addColorStop(0.5, `rgba(${rgb},0.38)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += w / 32) ctx.lineTo(x, h * base + Math.sin(x / w * 5 + t * 0.35 + phase) * h * 0.08 + Math.sin(x / w * 11 - t * 0.2) * h * 0.03);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
}

function colours(ctx: Ctx2D, w: number, h: number, t: number) {
  ctx.fillStyle = "#eef1ff";
  ctx.fillRect(0, 0, w, h);
  const blobs: [string, number, number, number][] = [
    ["124,58,237", 0.13, 0.0, 0.7],
    ["37,99,235", 0.09, 2.1, 0.8],
    ["219,39,119", 0.11, 4.2, 0.6],
    ["21,128,61", 0.07, 1.0, 0.5],
  ];
  for (const [rgb, speed, phase, size] of blobs) {
    const x = w * (0.5 + 0.38 * Math.sin(t * speed + phase));
    const y = h * (0.5 + 0.34 * Math.cos(t * speed * 1.3 + phase));
    const r = Math.max(w, h) * size;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},0.45)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

const DRAW: Record<SceneId, (ctx: Ctx2D, w: number, h: number, t: number) => void> = { clouds, waves, aurora, colours };

/** Draws one frame of a scene. */
export function drawScene(id: SceneId, ctx: Ctx2D, w: number, h: number, t: number): void {
  DRAW[id](ctx, w, h, t);
}
