// Step 114: how wide a thread (the replies to a message or a forum's post)
// opens next to the room — each person's own width per room, kept in their
// account data on the chat server (every device, Xenaxio and XenRooms). The
// platform writes the same type (the assistant's `set_thread_width`).

/** Account data: `{ rooms: { "!room": percent } }` — the thread column's share of the room. */
export const THREAD_WIDTHS_TYPE = "com.xenaxio.thread_widths";
export const THREAD_WIDTH_DEFAULT = 50;
export const THREAD_WIDTH_MIN = 20;
export const THREAD_WIDTH_MAX = 80;
/** Neither the room nor the thread gets narrower than this. */
export const THREAD_COLUMN_MIN_PX = 280;

/** A person's thread widths from their account data (anything else dropped). */
export function parseThreadWidths(content: Record<string, unknown> | undefined): Record<string, number> {
  const rooms: Record<string, number> = {};
  const raw = content?.rooms;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [roomId, value] of Object.entries(raw as Record<string, unknown>)) {
      if (roomId.startsWith("!") && typeof value === "number" && Number.isFinite(value)) rooms[roomId] = clampThreadWidth(value);
    }
  }
  return rooms;
}

/** Within 20–80 %, and (with the area's width) leaving both columns at least 280 px. */
export function clampThreadWidth(percent: number, areaPx?: number): number {
  let low: number = THREAD_WIDTH_MIN;
  let high: number = THREAD_WIDTH_MAX;
  if (areaPx && areaPx > 2 * THREAD_COLUMN_MIN_PX) {
    const min = (THREAD_COLUMN_MIN_PX / areaPx) * 100;
    low = Math.max(low, min);
    high = Math.min(high, 100 - min);
  }
  return Math.round(Math.min(high, Math.max(low, percent)) * 10) / 10;
}
