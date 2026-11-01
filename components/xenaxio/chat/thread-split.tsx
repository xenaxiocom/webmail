"use client";

// Step 114: the conversation and the thread side by side, with a divider in
// between (the mail's column handle). The thread's share of the room is each
// person's own per room, kept on the chat server (`ChatClient.threadWidth`);
// half and half until they drag it. Below 1024 px the thread lies over the
// conversation as before (step 104) and keeps its fixed width.
import { useRef, useState, type ReactNode } from "react";
import { ResizeHandle } from "@/components/layout/resize-handle";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { ChatClient } from "@/lib/xenaxio/chat/client";
import type { SidePanel } from "@/lib/xenaxio/chat/store";
import { clampThreadWidth, THREAD_COLUMN_MIN_PX } from "@/lib/xenaxio/chat/thread-width";
import { toast } from "@/stores/toast-store";
import { useXT } from "@/lib/xenaxio/i18n";
import { cn } from "@/lib/utils";

export function ThreadSplit({ client, panel, main, side, closeLabel, onClose }: { client: ChatClient; panel: SidePanel; main: ReactNode; side: ReactNode; closeLabel: string; onClose: () => void }) {
  const t = useXT();
  const wide = useMediaQuery("(min-width: 1024px)");
  const areaRef = useRef<HTMLDivElement>(null);
  // While dragging: the width shown before it is saved; the drag's start.
  const [live, setLive] = useState<number | null>(null);
  const liveRef = useRef<number | null>(null);
  const start = useRef<{ percent: number; area: number } | null>(null);
  const roomId = panel?.kind === "thread" ? panel.roomId : null;
  const resizable = wide && roomId !== null;
  const saved = roomId ? client.threadWidth(roomId) : 0;
  const area = () => areaRef.current?.getBoundingClientRect().width ?? 0;
  const percent = resizable ? clampThreadWidth(live ?? saved, area() || undefined) : 0;

  const save = (value: number | null) => {
    if (!roomId) return;
    client.setThreadWidth(roomId, value).catch(() => toast.error(t("chat.error")));
  };
  const show = (value: number) => {
    liveRef.current = value;
    setLive(value);
  };

  return (
    <div ref={areaRef} className="flex min-h-0 min-w-0 flex-1" data-testid="chat-conversation-area">
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">{main}</main>
      {/* Step 104: below 1024 px (iPad upright) the panel lies over the chat instead of squeezing it to nothing. */}
      {panel && <button type="button" aria-label={closeLabel} tabIndex={-1} onClick={onClose} className="absolute inset-0 z-20 bg-black/30 lg:hidden" data-testid="chat-panel-backdrop" />}
      {panel && resizable && (
        <ResizeHandle
          testId="chat-thread-resize"
          onResizeStart={() => {
            start.current = { percent, area: area() };
          }}
          onResize={(delta) => {
            // A drag measures from where it started; a key press from where it is now.
            const from = start.current ?? { percent: liveRef.current ?? percent, area: area() };
            if (!from.area) return;
            // Dragging to the right narrows the thread.
            show(clampThreadWidth(from.percent - (delta / from.area) * 100, from.area));
          }}
          onResizeEnd={() => {
            start.current = null;
            const value = liveRef.current;
            liveRef.current = null;
            setLive(null);
            if (value !== null) save(value);
          }}
          onDoubleClick={() => save(null)}
        />
      )}
      {panel && (
        <div
          className={cn("absolute inset-y-0 right-0 z-30 flex max-w-full shadow-2xl lg:static lg:z-auto lg:shadow-none", resizable && "lg:shrink-0 [&>aside]:w-full")}
          style={resizable ? { width: `${percent}%`, minWidth: THREAD_COLUMN_MIN_PX, maxWidth: `calc(100% - ${THREAD_COLUMN_MIN_PX}px)` } : undefined}
          data-thread-width={resizable ? Math.round(percent) : undefined}
        >
          {side}
        </div>
      )}
    </div>
  );
}
