"use client";

// A picture from the chat over the whole window. Opening the file in a new tab
// left the installed app (standalone window) without a way back, so it stays in
// the app: the cross, Escape or a click beside the picture closes it. Zoom with
// the wheel (or a trackpad pinch), two fingers, a double click, the buttons or
// + / - / 0; a zoomed picture is moved by dragging.
import { IconDownload, IconMinus, IconPlus, IconX } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useXT } from "@/lib/xenaxio/i18n";
import { cn } from "@/lib/utils";

const MIN = 1;
const MAX = 8;
const STEP = 1.5;
const DOUBLE = 2.5;

interface View {
  scale: number;
  x: number;
  y: number;
}
const FIT: View = { scale: 1, x: 0, y: 0 };

interface Point {
  x: number;
  y: number;
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function ImageViewer({ src, name, download, onClose }: { src: string; name: string; download: string | null; onClose: () => void }) {
  const t = useXT();
  const areaRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [view, setView] = useState<View>(FIT);
  const [gesture, setGesture] = useState(false);
  // Pointers on the picture area, and the pinch distance of the last move.
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef(0);
  // A drag ends in a click; that click must not close the viewer.
  const moved = useRef(false);

  /** Keeps a zoomed picture from leaving the window; at 100% it is centred. */
  const clamp = useCallback((v: View): View => {
    if (v.scale <= MIN) return FIT;
    const area = areaRef.current;
    const img = imgRef.current;
    if (!area || !img) return v;
    const maxX = Math.max(0, (img.offsetWidth * v.scale - area.clientWidth) / 2);
    const maxY = Math.max(0, (img.offsetHeight * v.scale - area.clientHeight) / 2);
    return { scale: v.scale, x: Math.min(maxX, Math.max(-maxX, v.x)), y: Math.min(maxY, Math.max(-maxY, v.y)) };
  }, []);

  /** Zooms keeping the point under `at` (window coordinates) in place; without it, the middle. */
  const zoom = useCallback(
    (next: (scale: number) => number, at?: Point) => {
      setView((v) => {
        const scale = Math.min(MAX, Math.max(MIN, next(v.scale)));
        const r = areaRef.current?.getBoundingClientRect();
        const cx = at && r ? at.x - (r.left + r.width / 2) : 0;
        const cy = at && r ? at.y - (r.top + r.height / 2) : 0;
        const k = scale / v.scale;
        return clamp({ scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k });
      });
    },
    [clamp],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") zoom((s) => s * STEP);
      else if (e.key === "-") zoom((s) => s / STEP);
      else if (e.key === "0") setView(FIT);
      else return;
      // Before the chat's own keys (Escape marks as read; they skip open dialogs).
      e.stopPropagation();
      e.preventDefault();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose, zoom]);

  // The wheel needs a listener that may cancel scrolling (React's is passive).
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY * (e.deltaMode === 1 ? 33 : 1);
      zoom((s) => s * Math.exp(-delta * 0.002), { x: e.clientX, y: e.clientY });
    };
    area.addEventListener("wheel", onWheel, { passive: false });
    return () => area.removeEventListener("wheel", onWheel);
  }, [zoom]);

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) moved.current = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = distance(a, b);
    }
    setGesture(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const last = pointers.current.get(e.pointerId);
    if (!last) return;
    const now = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, now);
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = distance(a, b);
      // The factor is taken now: the state update runs after `pinch` moves on.
      const factor = pinch.current > 0 ? d / pinch.current : 1;
      zoom((s) => s * factor, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      pinch.current = d;
      moved.current = true;
      return;
    }
    const dx = now.x - last.x;
    const dy = now.y - last.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved.current = true;
    setView((v) => (v.scale > MIN ? clamp({ ...v, x: v.x + dx, y: v.y + dy }) : v));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    pinch.current = 0;
    if (!pointers.current.size) setGesture(false);
  };

  const zoomed = view.scale > MIN;
  const button = "rounded-full p-2 hover:bg-white/15 disabled:opacity-40 disabled:hover:bg-transparent";
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name}
      className="fixed inset-0 z-[100] flex flex-col bg-black/90"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex items-center gap-1 px-4 py-3 text-white" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <span className="mr-2 min-w-0 flex-1 truncate text-sm">{name}</span>
        <button type="button" onClick={() => zoom((s) => s / STEP)} disabled={!zoomed} aria-label={t("chat.zoom_out")} title={t("chat.zoom_out")} className={button}>
          <IconMinus size={20} />
        </button>
        <button
          type="button"
          onClick={() => setView(FIT)}
          aria-label={t("chat.zoom_fit")}
          title={t("chat.zoom_fit")}
          className="min-w-14 rounded-full px-2 py-1.5 text-sm tabular-nums hover:bg-white/15"
        >
          {Math.round(view.scale * 100)}%
        </button>
        <button type="button" onClick={() => zoom((s) => s * STEP)} disabled={view.scale >= MAX} aria-label={t("chat.zoom_in")} title={t("chat.zoom_in")} className={button}>
          <IconPlus size={20} />
        </button>
        {download && (
          <a href={download} download={name} aria-label={t("chat.download")} title={t("chat.download")} className={cn(button, "ml-2")}>
            <IconDownload size={22} />
          </a>
        )}
        <button type="button" onClick={onClose} aria-label={t("chat.close")} title={t("chat.close")} className={button}>
          <IconX size={22} />
        </button>
      </div>
      <div
        ref={areaRef}
        className="flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden p-4"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerUp}
        onClick={(e) => {
          if (moved.current) moved.current = false;
          else if (e.target === e.currentTarget) onClose();
        }}
      >
        <img
          ref={imgRef}
          src={src}
          alt={name}
          draggable={false}
          onDoubleClick={(e) => (zoomed ? setView(FIT) : zoom(() => DOUBLE, { x: e.clientX, y: e.clientY }))}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          className={cn(
            "max-h-full max-w-full select-none object-contain",
            !gesture && "transition-transform duration-150",
            zoomed ? (gesture ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in",
          )}
        />
      </div>
    </div>,
    document.body,
  );
}
