"use client";

// Step 99, part 0: on a phone there is no hover, so the toolbar of a message
// never shows. A long press opens this sheet instead, as Slack does on phones:
// quick reactions (and all emoji), then the actions of the message.
import { IconMoodPlus } from "@tabler/icons-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useXT } from "@/lib/xenaxio/i18n";
import { cn } from "@/lib/utils";
import { EmojiPicker, quickReactions } from "./emoji-picker";

export interface MessageAction {
  key: string;
  label: string;
  run: () => void;
  destructive?: boolean;
}

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 10;

/**
 * A long press with a finger (not a mouse). Android also sends `contextmenu`
 * for it, iOS does not, so both open it; the browser's own menu is held back.
 */
export function useLongPress(onLongPress: () => void, enabled = true) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const touch = useRef(false);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };
  const fire = () => {
    cancel();
    navigator.vibrate?.(10);
    onLongPress();
  };
  useEffect(() => cancel, []);
  if (!enabled) return {};
  return {
    onPointerDown: (e: ReactPointerEvent) => {
      touch.current = e.pointerType !== "mouse";
      if (!touch.current) return;
      start.current = { x: e.clientX, y: e.clientY };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(fire, LONG_PRESS_MS);
    },
    onPointerMove: (e: ReactPointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > MOVE_TOLERANCE) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      if (!touch.current) return;
      e.preventDefault();
      if (timer.current) fire();
    },
  };
}

export function MessageSheet({ onReact, actions, onClose }: { onReact: (emoji: string) => void; actions: MessageAction[]; onClose: () => void }) {
  const t = useXT();
  const [picker, setPicker] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const react = (emoji: string) => {
    onClose();
    onReact(emoji);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label={t("chat.message_actions")} className="w-full rounded-t-xl border-t border-border bg-popover pb-[max(0.5rem,env(safe-area-inset-bottom))] text-popover-foreground shadow-lg">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
        {picker ? (
          <EmojiPicker className="w-full rounded-none border-0 shadow-none" onClose={() => setPicker(false)} onPick={react} />
        ) : (
          <div className="flex items-center justify-between gap-1 px-3 py-3">
            {quickReactions().map((e) => (
              <button key={e} type="button" className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-xl" onClick={() => react(e)} aria-label={e}>
                {e}
              </button>
            ))}
            <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full bg-muted" onClick={() => setPicker(true)} aria-label={t("chat.react")}>
              <IconMoodPlus size={20} />
            </button>
          </div>
        )}
        <div className="border-t border-border py-1">
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              className={cn("block w-full px-5 py-3 text-left text-base active:bg-accent", a.destructive && "text-destructive")}
              onClick={() => {
                onClose();
                a.run();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
