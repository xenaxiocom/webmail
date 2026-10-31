// Step 107: a channel's background — the set of step 42 (lib/xenaxio/backgrounds.ts)
// inside one channel. The channel keeps a code in its room state (its managers
// and the company's admin set it, everyone in it sees it); each person keeps
// their own view in their account data on the chat server (every device): per
// channel the channel's own, the default look without it, or one of their own;
// and every channel's background switched off. The platform writes the same types.
import { type Background, findBackground } from "@/lib/xenaxio/backgrounds";

/** Room state: `{ background: <code> }`; no code — no background. */
export const BACKGROUND_TYPE = "com.xenaxio.background";
/** Account data: the person's own view of channel backgrounds. */
export const ROOM_BACKGROUNDS_TYPE = "com.xenaxio.room_backgrounds";

/** In the person's choices: no background in this channel (the default look). */
export const DEFAULT_LOOK = "default";
/** A person's choice for one channel: follow the channel, the default look, or a code. */
export const FOLLOW_CHANNEL = "channel";

export interface RoomBackgrounds {
  hideAll: boolean;
  /** Room id → "default" or a background code. */
  rooms: Record<string, string>;
}

export const NO_ROOM_BACKGROUNDS: RoomBackgrounds = { hideAll: false, rooms: {} };

const CODE = /^[a-z0-9-]{1,40}$/;

/** The code in a channel's background state, or null (anything else is no background). */
export function backgroundCodeOf(content: Record<string, unknown> | undefined): string | null {
  const code = content?.background;
  return typeof code === "string" && CODE.test(code) ? code : null;
}

/** The person's choices from account data; anything odd is dropped (another client may have written it). */
export function parseRoomBackgrounds(content: Record<string, unknown> | undefined): RoomBackgrounds {
  const rooms: Record<string, string> = {};
  const raw = content?.rooms;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [roomId, value] of Object.entries(raw as Record<string, unknown>)) {
      if (roomId.startsWith("!") && typeof value === "string" && (value === DEFAULT_LOOK || CODE.test(value))) rooms[roomId] = value;
    }
  }
  return { hideAll: content?.hideAll === true, rooms };
}

/** The person's choice for a channel: "channel", "default" or a code. */
export function myChoiceFor(mine: RoomBackgrounds, roomId: string): string {
  return mine.rooms[roomId] ?? FOLLOW_CHANNEL;
}

/** The person's choices with a new one for a channel. */
export function withMyChoice(mine: RoomBackgrounds, roomId: string, choice: string): RoomBackgrounds {
  const rooms = { ...mine.rooms };
  if (choice === FOLLOW_CHANNEL) delete rooms[roomId];
  else rooms[roomId] = choice;
  return { ...mine, rooms };
}

/**
 * What this person sees in a room: their own choice for it; else nothing when
 * they hid every channel's background; else the channel's. Only channels have
 * one; a code this client does not know is no background.
 */
export function shownBackground(room: { id: string; kind: string; background: string | null }, mine: RoomBackgrounds): Background | null {
  if (room.kind !== "channel") return null;
  const own = mine.rooms[room.id];
  if (own === DEFAULT_LOOK) return null;
  if (own) return findBackground(own);
  if (mine.hideAll) return null;
  return findBackground(room.background);
}

/**
 * CSS variables of the background for both colour modes (room-background.css
 * picks one). Only values of the client's own list reach it, never text from
 * the chat server.
 */
export function roomBackgroundStyle(bg: Background): Record<string, string> {
  return { "--xenaxio-room-bg-light": bg.css.light, "--xenaxio-room-bg-dark": bg.css.dark };
}
