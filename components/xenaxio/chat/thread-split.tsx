"use client";

// Step 114: the conversation and the thread side by side, with a divider in
// between (the mail's column handle). The thread's share of the room is each
// person's own per room, kept on the chat server (`ChatClient.threadWidth`);
// half and half until they drag it. Below 1024 px the thread lies over the
// conversation as before (step 104) and keeps its fixed width.
import { useRef, type ReactNode } from "react";
import { ResizeHandle } from "@/components/layout/resize-handle";
import { useSplitResize } from "@/components/xenaxio/use-split-resize";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { ChatClient } from "@/lib/xenaxio/chat/client";
import type { SidePanel } from "@/lib/xenaxio/chat/store";
import { splitStyle } from "@/lib/xenaxio/split";
import { toast } from "@/stores/toast-store";
import { useXT } from "@/lib/xenaxio/i18n";
import { cn } from "@/lib/utils";

export function ThreadSplit({ client, panel, main, side, closeLabel, onClose }: { client: ChatClient; panel: SidePanel; main: ReactNode; side: ReactNode; closeLabel: string; onClose: () => void }) {
  const t = useXT();
  const wide = useMediaQuery("(min-width: 1024px)");
  const areaRef = useRef<HTMLDivElement>(null);
  const roomId = panel?.kind === "thread" ? panel.roomId : null;
  const resizable = wide && roomId !== null;
  const { percent, handle } = useSplitResize({
    areaRef,
    saved: roomId ? client.threadWidth(roomId) : 0,
    onSave: (value) => {
      if (roomId) client.setThreadWidth(roomId, value).catch(() => toast.error(t("chat.error")));
    },
  });

  return (
    <div ref={areaRef} className="flex min-h-0 min-w-0 flex-1" data-testid="chat-conversation-area">
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">{main}</main>
      {/* Step 104: below 1024 px (iPad upright) the panel lies over the chat instead of squeezing it to nothing. */}
      {panel && <button type="button" aria-label={closeLabel} tabIndex={-1} onClick={onClose} className="absolute inset-0 z-20 bg-black/30 lg:hidden" data-testid="chat-panel-backdrop" />}
      {panel && resizable && <ResizeHandle testId="chat-thread-resize" {...handle} />}
      {panel && (
        <div
          className={cn("absolute inset-y-0 right-0 z-30 flex max-w-full shadow-2xl lg:static lg:z-auto lg:shadow-none", resizable && "lg:shrink-0 [&>aside]:w-full")}
          style={resizable ? splitStyle(percent) : undefined}
          data-thread-width={resizable ? Math.round(percent) : undefined}
        >
          {side}
        </div>
      )}
    </div>
  );
}
