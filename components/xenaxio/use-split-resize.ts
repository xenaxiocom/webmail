"use client";

// Step 114: the divider's behaviour for two columns (see lib/xenaxio/split.ts):
// a drag measures from where it started, an arrow key from where it is now;
// the width shows live and is saved once, when the divider is let go; a double
// click goes back to the default.
import { useRef, useState, type RefObject } from "react";
import { clampSplit } from "@/lib/xenaxio/split";

export function useSplitResize({ areaRef, saved, onSave }: { areaRef: RefObject<HTMLElement | null>; saved: number; onSave: (percent: number | null) => void }) {
  const [live, setLive] = useState<number | null>(null);
  const liveRef = useRef<number | null>(null);
  const start = useRef<{ percent: number; area: number } | null>(null);
  const area = () => areaRef.current?.getBoundingClientRect().width ?? 0;
  const percent = clampSplit(live ?? saved, area() || undefined);
  const show = (value: number) => {
    liveRef.current = value;
    setLive(value);
  };
  return {
    percent,
    handle: {
      onResizeStart: () => {
        start.current = { percent, area: area() };
      },
      onResize: (delta: number) => {
        const from = start.current ?? { percent: liveRef.current ?? percent, area: area() };
        if (!from.area) return;
        // Moving the divider to the right narrows the right column.
        show(clampSplit(from.percent - (delta / from.area) * 100, from.area));
      },
      onResizeEnd: () => {
        start.current = null;
        const value = liveRef.current;
        liveRef.current = null;
        setLive(null);
        if (value !== null) onSave(value);
      },
      onDoubleClick: () => onSave(null),
    },
  };
}
