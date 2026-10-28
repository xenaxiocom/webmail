"use client";

// xenaxio, step 61: the round button that opens the assistant. It can be
// dragged anywhere; the place is kept by the platform per kind of screen.
// Until it is moved it sits in the bottom-right corner and steps up above the
// chat composer (assistant-lift.ts).
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { Sparkles } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  type AssistantDevice,
  type AssistantPositions,
  type AssistantSpot,
  BUTTON_HALF,
  cleanPositions,
  deviceFor,
  isDrag,
  readCachedPositions,
  spotAt,
  spotStyle,
  writeCachedPositions,
} from "@/lib/xenaxio/assistant-position";
import { useXenaxioMe, useXenaxioMeStore } from "@/lib/xenaxio/me-store";
import { toast } from "@/stores/toast-store";
import { useXT } from "@/lib/xenaxio/i18n";

/** The kind of screen right now, following window size changes. */
export function useAssistantDevice(): AssistantDevice {
  const [device, setDevice] = useState<AssistantDevice>(() => (typeof window === "undefined" ? "desktop" : deviceFor(window.innerWidth)));
  useEffect(() => {
    const update = () => setDevice(deviceFor(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return device;
}

/** The person's places for the button: the platform's once loaded, this device's copy before. */
export function useAssistantPositions(): AssistantPositions {
  const me = useXenaxioMe();
  const [cached] = useState(readCachedPositions);
  const positions = me ? cleanPositions(me.assistantPosition) : cached;
  useEffect(() => {
    if (me) writeCachedPositions(cleanPositions(me.assistantPosition));
  }, [me]);
  return positions;
}

interface Drag {
  pointerId: number;
  startX: number;
  startY: number;
  /** Pointer position relative to the button's centre, so it does not jump under the finger. */
  offsetX: number;
  offsetY: number;
  moved: boolean;
}

export function AssistantButton({ label, unread, onOpen }: { label: string; unread: boolean; onOpen: () => void }) {
  const t = useXT();
  const device = useAssistantDevice();
  const positions = useAssistantPositions();
  const save = useXenaxioMeStore((s) => s.setAssistantPosition);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const [live, setLive] = useState<AssistantSpot | null>(null);
  const spot = live ?? positions[device] ?? null;

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    // A touch drag may end without a click; never let it swallow the next tap.
    suppressClick.current = false;
    const box = e.currentTarget.getBoundingClientRect();
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - (box.left + BUTTON_HALF),
      offsetY: e.clientY - (box.top + BUTTON_HALF),
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.moved && !isDrag(e.clientX - d.startX, e.clientY - d.startY)) return;
    d.moved = true;
    setLive(spotAt(e.clientX - d.offsetX, e.clientY - d.offsetY, window.innerWidth, window.innerHeight));
  };

  const finish = (e: PointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    // A drag is not a click: keep the panel closed.
    suppressClick.current = true;
    if (cancelled) {
      setLive(null);
      return;
    }
    const next = spotAt(e.clientX - d.offsetX, e.clientY - d.offsetY, window.innerWidth, window.innerHeight);
    setLive(next);
    void save(device, next)
      .catch(() => toast.error(t("assistant.position_error")))
      .finally(() => setLive(null));
  };

  return (
    <button
      type="button"
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        onOpen();
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, false)}
      onPointerCancel={(e) => finish(e, true)}
      style={spot ? spotStyle(spot, device) : undefined}
      className={cn(
        "fixed z-40 flex h-12 w-12 touch-none select-none items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90",
        !spot && "bottom-[max(6rem,var(--xenaxio-assistant-lift,0px))] right-4 md:bottom-[max(1.5rem,var(--xenaxio-assistant-lift,0px))] md:right-6",
        live && "cursor-grabbing shadow-xl",
      )}
      aria-label={label}
      title={`${label} · ${t("assistant.drag_hint")}`}
      data-xenaxio-assistant-button=""
    >
      <Sparkles className="pointer-events-none h-5 w-5" />
      {unread && <span className="pointer-events-none absolute right-0.5 top-0.5 h-3 w-3 rounded-full border-2 border-background bg-red-500" aria-hidden="true" />}
    </button>
  );
}
