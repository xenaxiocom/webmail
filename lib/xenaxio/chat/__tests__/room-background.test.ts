// Step 107: a channel's background and each person's own view of it.
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { method: string; path: string; body?: unknown }[] = [];
let fail = false;
vi.mock("../api", async (orig) => {
  const real = await orig<typeof import("../api")>();
  return {
    ...real,
    mx: vi.fn(async (method: string, path: string, body?: unknown) => {
      calls.push({ method, path, body });
      if (fail) throw new Error("offline");
      return {};
    }),
  };
});

import { ChatClient, isVisible, type RawEvent, type SyncResponse } from "../client";
import { backgroundCodeOf, backgroundImageOf, imageBackground, NO_ROOM_BACKGROUNDS, parseRoomBackgrounds, roomBackgroundStyle, shownBackground, withMyChoice } from "../room-background";
import { findBackground } from "../../backgrounds";

const ROOM = "!proj:acme.de";
const channel = (background: string | null) => ({ id: ROOM, kind: "channel", background });

describe("channel background (step 107)", () => {
  it("reads only codes; anything else is no background", () => {
    expect(backgroundCodeOf({ background: "img-sea" })).toBe("img-sea");
    expect(backgroundCodeOf({ background: null })).toBeNull();
    expect(backgroundCodeOf({ background: "url(javascript:alert(1))" })).toBeNull();
    expect(backgroundCodeOf({ background: 3 })).toBeNull();
    expect(backgroundCodeOf(undefined)).toBeNull();
  });

  it("keeps a person's choices clean", () => {
    expect(parseRoomBackgrounds(undefined)).toEqual(NO_ROOM_BACKGROUNDS);
    expect(parseRoomBackgrounds({ hideAll: "yes", rooms: { [ROOM]: "default", "!b:x": "grad-blue", bad: "img-sea", "!c:x": "Not a code", "!d:x": 5 } })).toEqual({
      hideAll: false,
      rooms: { [ROOM]: "default", "!b:x": "grad-blue" },
    });
    expect(parseRoomBackgrounds({ hideAll: true, rooms: [] })).toEqual({ hideAll: true, rooms: {} });
  });

  it("shows the person's own choice, else nothing when they hid all, else the channel's", () => {
    const sea = findBackground("img-sea");
    const blue = findBackground("grad-blue");
    expect(shownBackground(channel("img-sea"), NO_ROOM_BACKGROUNDS)).toBe(sea);
    expect(shownBackground(channel(null), NO_ROOM_BACKGROUNDS)).toBeNull();
    // A code this client does not know shows nothing.
    expect(shownBackground(channel("img-new"), NO_ROOM_BACKGROUNDS)).toBeNull();
    // Direct conversations have one too, spaces none.
    expect(shownBackground({ ...channel("img-sea"), kind: "dm" }, NO_ROOM_BACKGROUNDS)).toBe(sea);
    expect(shownBackground({ ...channel("img-sea"), kind: "space" }, NO_ROOM_BACKGROUNDS)).toBeNull();
    const mine = withMyChoice(NO_ROOM_BACKGROUNDS, ROOM, "default");
    expect(shownBackground(channel("img-sea"), mine)).toBeNull();
    expect(shownBackground(channel("img-sea"), withMyChoice(mine, ROOM, "grad-blue"))).toBe(blue);
    expect(withMyChoice(mine, ROOM, "channel")).toEqual(NO_ROOM_BACKGROUNDS);
    const hidden = { hideAll: true, rooms: {} };
    expect(shownBackground(channel("img-sea"), hidden)).toBeNull();
    // An own choice for one channel wins over hiding all.
    expect(shownBackground(channel("img-sea"), withMyChoice(hidden, ROOM, "grad-blue"))).toBe(blue);
  });

  it("an uploaded picture: only mxc addresses, shown through the chat's file address, encoded", () => {
    expect(backgroundImageOf({ image: "mxc://acme.de/AbC123" })).toBe("mxc://acme.de/AbC123");
    expect(backgroundImageOf({ image: "https://evil.test/x.jpg" })).toBeNull();
    expect(backgroundImageOf({ image: 'mxc://acme.de/a")' })).toBeNull();
    expect(backgroundImageOf({ image: 'mxc://ev"il)/AbC' })).toBe('mxc://ev"il)/AbC');
    const bg = imageBackground('mxc://ev"il)/AbC')!;
    // The server part is encoded: no quote can close the CSS string.
    expect(bg.css.light).toMatch(/^url\("[^"]*"\) center \/ cover no-repeat$/);
    expect(bg.css.light).toContain("/_matrix/client/v1/media/download/ev%22il)/AbC");
    expect(bg.preview.light).toContain("/thumbnail/");
    const room = { ...channel("img-sea"), backgroundImage: "mxc://acme.de/AbC123" };
    expect(shownBackground(room, NO_ROOM_BACKGROUNDS)?.id).toBe("image");
    // The person's own choice still wins.
    expect(shownBackground(room, withMyChoice(NO_ROOM_BACKGROUNDS, ROOM, "default"))).toBeNull();
  });

  it("styles both colour modes from the client's own list", () => {
    const style = roomBackgroundStyle(findBackground("img-sea")!);
    expect(style["--xenaxio-room-bg-light"]).toContain("/xenaxio/backgrounds/img-sea-light.webp");
    expect(style["--xenaxio-room-bg-dark"]).toContain("/xenaxio/backgrounds/img-sea-dark.webp");
  });

  describe("in the chat client", () => {
    let c: ChatClient;
    let n = 0;
    const ev = (partial: Partial<RawEvent> & { type: string }): RawEvent => ({ event_id: `$e${++n}`, sender: "@anna:acme.de", origin_server_ts: 1000 + n, content: {}, ...partial });
    const sync = (events: RawEvent[], accountData: RawEvent[] = []): SyncResponse =>
      ({ next_batch: `s${n}`, rooms: { join: { [ROOM]: { timeline: { events, prev_batch: "p0" } } } }, account_data: { events: accountData } }) as SyncResponse;

    beforeEach(() => {
      calls.length = 0;
      fail = false;
      c = new ChatClient();
      c.userId = "@max:acme.de";
    });

    it("reads the channel's background and the person's choices from the sync; the change shows in the timeline", () => {
      c.processSync(
        sync(
          [ev({ type: "m.room.create", state_key: "", content: { creator: "@anna:acme.de" } }), ev({ type: "com.xenaxio.background", state_key: "", content: { background: "img-dunes" } })],
          [{ type: "com.xenaxio.room_backgrounds", sender: "", content: { hideAll: true, rooms: { [ROOM]: "grad-green" } } } as RawEvent],
        ),
        true,
      );
      const room = c.rooms.get(ROOM)!;
      expect(room.background).toBe("img-dunes");
      expect(c.roomBackgrounds).toEqual({ hideAll: true, rooms: { [ROOM]: "grad-green" } });
      expect(room.timeline.some((m) => m.type === "com.xenaxio.background")).toBe(true);
      expect(isVisible({ type: "com.xenaxio.background", content: {} })).toBe(true);
      c.processSync(sync([ev({ type: "com.xenaxio.background", state_key: "", content: {} })]), false);
      expect(room.background).toBeNull();
      c.processSync(sync([ev({ type: "com.xenaxio.background", state_key: "", content: { image: "mxc://acme.de/AbC123" } })]), false);
      expect([room.background, room.backgroundImage]).toEqual([null, "mxc://acme.de/AbC123"]);
    });

    it("writes the channel's state and the person's account data; a failed save goes back", async () => {
      await c.setChannelBackground(ROOM, { background: "img-sea" });
      expect(calls.at(-1)).toMatchObject({ method: "PUT", body: { background: "img-sea" } });
      expect(calls.at(-1)?.path).toContain("/state/com.xenaxio.background");
      const next = withMyChoice(NO_ROOM_BACKGROUNDS, ROOM, "default");
      await c.setRoomBackgrounds(next);
      expect(calls.at(-1)).toMatchObject({ method: "PUT", body: next });
      expect(calls.at(-1)?.path).toContain("/account_data/com.xenaxio.room_backgrounds");
      expect(c.roomBackgrounds).toEqual(next);
      fail = true;
      await expect(c.setRoomBackgrounds({ hideAll: true, rooms: {} })).rejects.toThrow();
      expect(c.roomBackgrounds).toEqual(next);
    });
  });
});
