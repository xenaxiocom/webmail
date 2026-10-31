// Step 109: a room's background — the set of step 42 (lib/xenaxio/backgrounds.ts)
// inside one channel or direct conversation, or a picture uploaded for it. The
// room keeps it in its state (a channel's managers and the company's admin set
// it, anyone in a direct conversation; everyone in the room sees it); each
// person keeps their own view in their account data on the chat server (every
// device): per room the room's own, the default look without it, or one of
// their own; and every background switched off. The platform writes the same types.
import { type Background, findBackground } from "@/lib/xenaxio/backgrounds";
import { mediaUrl, parseMxc } from "./api";

/** Room state: `{ background: <code> }` or `{ image: "mxc://…" }` (an uploaded picture); neither — no background. */
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

/** The uploaded picture in a room's background state ("mxc://…"), or null. */
export function backgroundImageOf(content: Record<string, unknown> | undefined): string | null {
  const image = content?.image;
  return typeof image === "string" && image.length <= 300 && parseMxc(image) ? image : null;
}

/**
 * An uploaded picture as a background: one picture for both colour modes (the
 * veil over it follows the theme). Its address is built by `mediaUrl` from the
 * parts of the mxc address, each encoded, so nothing from the server reaches
 * the CSS as it is.
 */
export function imageBackground(mxc: string): Background | null {
  const full = mediaUrl(mxc);
  const thumb = mediaUrl(mxc, { thumbnail: { width: 320, height: 180 } });
  if (!full || !thumb) return null;
  const css = `url("${full}") center / cover no-repeat`;
  const preview = `url("${thumb}") center / cover no-repeat`;
  return { id: "image", kind: "image", name: "own", accent: { light: "#000000", dark: "#ffffff" }, css: { light: css, dark: css }, soft: { light: css, dark: css }, preview: { light: preview, dark: preview } };
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
 * What this person sees in a channel or direct conversation: their own choice
 * for it; else nothing when they hid every background; else the room's — a
 * code of the list or an uploaded picture. A code this client does not know is
 * no background.
 */
export function shownBackground(room: { id: string; kind: string; background: string | null; backgroundImage?: string | null }, mine: RoomBackgrounds): Background | null {
  if (room.kind !== "channel" && room.kind !== "dm") return null;
  const own = mine.rooms[room.id];
  if (own === DEFAULT_LOOK) return null;
  if (own) return findBackground(own);
  if (mine.hideAll) return null;
  return room.backgroundImage ? imageBackground(room.backgroundImage) : findBackground(room.background);
}

/** The room's own background (for everyone in it), whatever the person chose. */
export function roomBackground(room: { background: string | null; backgroundImage?: string | null }): Background | null {
  return room.backgroundImage ? imageBackground(room.backgroundImage) : findBackground(room.background);
}

/**
 * CSS variables of the background for both colour modes (room-background.css
 * picks one). Only values of the client's own list, or a picture address made
 * by `imageBackground`, reach it — never text from the chat server as it is.
 */
export function roomBackgroundStyle(bg: Background): Record<string, string> {
  return { "--xenaxio-room-bg-light": bg.css.light, "--xenaxio-room-bg-dark": bg.css.dark };
}
