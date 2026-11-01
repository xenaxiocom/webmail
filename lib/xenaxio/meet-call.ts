// xenaxio step 78, part D: calls in Rooms (like huddles in Slack). A call is a
// meeting of the room; its message in the chat carries "com.xenaxio.call" (the
// card) and a plain text with the link for other apps and push notifications.
import { create } from "zustand";

export interface CallRef {
  code: string;
  title: string;
  roomId: string;
}

export interface CallContent {
  code: string;
  link: string;
}

/** The call card of a chat message, if it is one. */
export function callOf(content: Record<string, unknown>): CallContent | null {
  const c = content["com.xenaxio.call"] as Record<string, unknown> | undefined;
  if (!c || typeof c.code !== "string" || !/^[a-z0-9]{10,32}$/.test(c.code) || typeof c.link !== "string") return null;
  return { code: c.code, link: c.link };
}

/** The message that announces a new call in the room. */
export function callMessage(code: string, link: string, text: string): Record<string, unknown> {
  return { msgtype: "m.text", body: `📞 ${text}: ${link}`, "com.xenaxio.call": { code, link } };
}

/** The one call this browser is in (a dock over the chat, or full screen). */
export const useCallStore = create<{
  active: CallRef | null;
  expanded: boolean;
  open: (call: CallRef) => void;
  close: () => void;
  setExpanded: (expanded: boolean) => void;
}>((set) => ({
  active: null,
  expanded: false,
  open: (call) => set((s) => (s.active?.code === call.code ? s : { active: call, expanded: false })),
  close: () => set({ active: null, expanded: false }),
  setExpanded: (expanded) => set({ expanded }),
}));

/**
 * Step 117: the dock of a call shows video only while someone shows a camera
 * or a screen; otherwise a strip of faces, as in a huddle or a voice channel.
 */
export function showsVideo(tracks: { publication?: { isMuted: boolean } }[]): boolean {
  return tracks.some((tr) => !!tr.publication && !tr.publication.isMuted);
}
