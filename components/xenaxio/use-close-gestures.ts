"use client";

// Closing gestures on the phone, shared by every panel and dialog of Xenaxio
// (fix 09.11.2026: a project task could not be closed on the iPhone). The close
// button stays everywhere; the gestures only add to it.
// - useEdgeSwipeClose: a swipe to the right from the left edge closes a
//   full-screen panel, as "back" in iPhone apps (the installed app has no Back
//   button of its own). Built on the swipe of the mail list (use-swipe-actions).
// - useSheetDrag: pulling the top bar of a bottom sheet down closes it.
// - useBackSteps: Back (the Android button or gesture, the browser's Back)
//   steps out of nested panes that do not change the address (Rooms).
import { type TouchEvent, useEffect, useRef, useState } from "react";
import { useSwipeActions } from "@/hooks/use-swipe-actions";

/** How close to the left edge (px) a touch has to start to swipe a panel closed. */
export const EDGE = 32;
/** An invisible strip over the left edge of a panel whose content is an iframe. */
export const edgeStripClass = "absolute inset-y-0 left-0 z-20 w-5";
/** How far (px) the top bar of a sheet has to be pulled down to close it. */
export const SHEET_CLOSE = 80;

/**
 * Spread `handlers` on the panel and `style` moves it with the finger. Where the
 * panel's content is an iframe (an email), the touches never reach the panel:
 * spread the handlers on a strip over the left edge instead (`edgeStripClass`).
 */
export function useEdgeSwipeClose(onClose: () => void, enabled = true) {
  const swipe = useSwipeActions({ enabled, hasLeft: false, hasRight: true, onCommit: onClose });
  return {
    style: swipe.offsetX > 0 ? { transform: `translateX(${swipe.offsetX}px)` } : undefined,
    handlers: {
      ...swipe.swipeHandlers,
      onTouchStart: (e: TouchEvent) => {
        if (e.touches[0].clientX <= EDGE) swipe.swipeHandlers.onTouchStart(e);
      },
    },
  };
}

/**
 * Spread `handlers` on the sheet's top bar and `style` on the sheet. Only on
 * the phone (a sheet from the bottom); wider screens show a centred dialog and
 * ignore the drag.
 */
export function useSheetDrag(onClose: () => void) {
  const start = useRef<number | null>(null);
  const [dy, setDy] = useState(0);
  const stop = () => {
    start.current = null;
    setDy(0);
  };
  return {
    style: dy > 0 ? { transform: `translateY(${dy}px)` } : undefined,
    handlers: {
      onTouchStart: (e: TouchEvent) => {
        if (window.matchMedia("(min-width: 640px)").matches) return;
        start.current = e.touches[0].clientY;
      },
      onTouchMove: (e: TouchEvent) => {
        if (start.current !== null) setDy(Math.max(0, e.touches[0].clientY - start.current));
      },
      onTouchEnd: () => {
        const close = start.current !== null && dy >= SHEET_CLOSE;
        stop();
        if (close) onClose();
      },
      onTouchCancel: stop,
    },
  };
}

/** The field in history.state that keeps how deep the panes were. */
const DEPTH = "xenaxioDepth";
const historyDepth = (): number => {
  const d = (window.history.state as Record<string, unknown> | null)?.[DEPTH];
  return typeof d === "number" ? d : 0;
};

/**
 * Back steps for nested panes on one address: `depth` is how deep the person is
 * (0 the list, 1 a conversation, 2 its side panel). Going deeper adds a history
 * step, so Back calls `onBack(depth)` with the depth to return to instead of
 * leaving the page; going up in the page (a back button, a swipe) drops the
 * steps again, so the history does not pile up. Next.js keeps our field next
 * to its own in history.state (as the files' preview does with __filePreview).
 */
export function useBackSteps(depth: number, enabled: boolean, onBack: (depth: number) => void) {
  const current = useRef(depth);
  current.current = depth;
  const back = useRef(onBack);
  back.current = onBack;

  useEffect(() => {
    if (!enabled) return;
    const steps = historyDepth();
    if (depth > steps) window.history.pushState({ [DEPTH]: depth }, "");
    else if (depth < steps) window.history.go(depth - steps);
  }, [depth, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const onPop = () => {
      const to = historyDepth();
      if (to < current.current) back.current(to);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [enabled]);
}
