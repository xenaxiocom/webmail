// Step 114: each person's own thread width per room, kept on the chat server.
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

import { ChatClient, type RawEvent, type SyncResponse } from "../client";
import { clampThreadWidth, parseThreadWidths } from "../thread-width";

const ROOM = "!forum:acme.de";

describe("thread width (step 114)", () => {
  it("keeps only rooms with a number, within 20–80 %", () => {
    expect(parseThreadWidths(undefined)).toEqual({});
    expect(parseThreadWidths({ rooms: { [ROOM]: 35, "!b:x": 95, "!c:x": 2, bad: 50, "!d:x": "wide" } })).toEqual({ [ROOM]: 35, "!b:x": 80, "!c:x": 20 });
    expect(parseThreadWidths({ rooms: [1, 2] })).toEqual({});
  });

  it("leaves both columns at least 280 px", () => {
    expect(clampThreadWidth(50, 1000)).toBe(50);
    expect(clampThreadWidth(20, 1000)).toBe(28);
    expect(clampThreadWidth(80, 1000)).toBe(72);
    expect(clampThreadWidth(90)).toBe(80);
  });

  describe("in the chat client", () => {
    let c: ChatClient;
    beforeEach(() => {
      calls.length = 0;
      fail = false;
      c = new ChatClient();
      c.userId = "@max:acme.de";
    });

    it("is half and half until the person sets one; the sync brings it from other devices", () => {
      expect(c.threadWidth(ROOM)).toBe(50);
      c.processSync({ next_batch: "s1", account_data: { events: [{ type: "com.xenaxio.thread_widths", sender: "", content: { rooms: { [ROOM]: 64 } } } as RawEvent] } } as SyncResponse, true);
      expect(c.threadWidth(ROOM)).toBe(64);
      expect(c.threadWidth("!other:acme.de")).toBe(50);
    });

    it("saves in the person's account data, back to half and half without the room; a failed save goes back", async () => {
      await c.setThreadWidth(ROOM, 33.4);
      expect(calls.at(-1)).toMatchObject({ method: "PUT", body: { rooms: { [ROOM]: 33 } } });
      expect(calls.at(-1)?.path).toContain("/account_data/com.xenaxio.thread_widths");
      await c.setThreadWidth("!b:acme.de", 70);
      expect(calls.at(-1)?.body).toEqual({ rooms: { [ROOM]: 33, "!b:acme.de": 70 } });
      await c.setThreadWidth(ROOM, null);
      expect(calls.at(-1)?.body).toEqual({ rooms: { "!b:acme.de": 70 } });
      expect(c.threadWidth(ROOM)).toBe(50);
      // Nothing changed: nothing is sent.
      const sent = calls.length;
      await c.setThreadWidth(ROOM, null);
      expect(calls.length).toBe(sent);
      fail = true;
      await expect(c.setThreadWidth(ROOM, 40)).rejects.toThrow();
      expect(c.threadWidth(ROOM)).toBe(50);
    });
  });
});
