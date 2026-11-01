// Step 114: how wide a thread (the replies to a message or a forum's post)
// opens next to the room — each person's own width per room, kept in their
// account data on the chat server (every device, Xenaxio and XenRooms). The
// platform writes the same type (the assistant's `set_thread_width`).
import { clampSplit, SPLIT_DEFAULT, splitOf } from "@/lib/xenaxio/split";

/** Account data: `{ rooms: { "!room": percent } }` — the thread column's share of the room. */
export const THREAD_WIDTHS_TYPE = "com.xenaxio.thread_widths";
export const THREAD_WIDTH_DEFAULT = SPLIT_DEFAULT;

/** A person's thread widths from their account data (anything else dropped). */
export function parseThreadWidths(content: Record<string, unknown> | undefined): Record<string, number> {
  const rooms: Record<string, number> = {};
  const raw = content?.rooms;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [roomId, value] of Object.entries(raw as Record<string, unknown>)) {
      const percent = splitOf(value);
      if (roomId.startsWith("!") && percent !== null) rooms[roomId] = percent;
    }
  }
  return rooms;
}

/** Within 20–80 %, and (with the area's width) leaving both columns at least 280 px. */
export const clampThreadWidth = clampSplit;
