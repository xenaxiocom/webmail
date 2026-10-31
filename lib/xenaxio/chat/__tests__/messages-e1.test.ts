import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { method: string; path: string; body?: unknown }[] = [];
let answer: (method: string, path: string) => unknown = () => ({});
vi.mock("../api", async (orig) => {
  const real = await orig<typeof import("../api")>();
  return {
    ...real,
    mx: vi.fn(async (method: string, path: string, body?: unknown) => {
      calls.push({ method, path: decodeURIComponent(path), body });
      return answer(method, decodeURIComponent(path));
    }),
  };
});

import { ChatClient, parseDrafts, type RawEvent } from "../client";
import { firstLink, forwardContent, forwardedOf, forwardParts } from "../format";

const ROOM = "!v:acme.de";
const msg = (id: string, ts: number): RawEvent => ({ event_id: id, type: "m.room.message", sender: "@anna:acme.de", origin_server_ts: ts, content: { msgtype: "m.text", body: id } });

describe("Rooms messages, step 99 part E", () => {
  let c: ChatClient;
  beforeEach(() => {
    calls.length = 0;
    answer = () => ({});
    c = new ChatClient();
    c.userId = "@max:acme.de";
    c.processSync({ next_batch: "s1", rooms: { join: { [ROOM]: { timeline: { events: [msg("$1", 1), msg("$2", 2), msg("$3", 3)], prev_batch: "p" } } } } } as never, true);
  });

  it("the first outside link of a message, not in code and not the chat's own", () => {
    expect(firstLink("siehe `https://code.de/x` und https://acme.de/a.", null)).toBe("https://acme.de/a");
    expect(firstLink("```\nhttps://code.de\n```\nhttp://plain.de", null)).toBeNull();
    expect(firstLink("https://app.xenaxio.com/de/chat/?room=x https://news.de/1", "https://app.xenaxio.com")).toBe("https://news.de/1");
  });

  it("marks a channel unread from a message; the open view keeps it, leaving reads it", async () => {
    await c.markUnread(ROOM, "$2");
    const room = c.rooms.get(ROOM)!;
    expect(room.markedUnread).toEqual({ readUpTo: "$1" });
    expect(c.isUnread(room)).toBe(true);
    expect(calls.at(-1)).toEqual({ method: "PUT", path: `/_matrix/client/v3/user/@max:acme.de/rooms/${ROOM}/account_data/m.marked_unread`, body: { unread: true, "com.xenaxio.read_up_to": "$1" } });
    calls.length = 0;
    await c.markRead(ROOM);
    expect(calls).toEqual([]);
    room.keepUnread = false;
    await c.markRead(ROOM);
    expect(room.markedUnread).toBeNull();
    expect(calls.some((x) => x.path.endsWith("/account_data/m.marked_unread") && (x.body as { unread: boolean }).unread === false)).toBe(true);
    // Without a message: the last one.
    await c.markUnread(ROOM);
    expect(room.markedUnread).toEqual({ readUpTo: "$2" });
    // Another device marked it: the sync says so.
    c.processSync({ next_batch: "s2", rooms: { join: { [ROOM]: { account_data: { events: [{ type: "m.marked_unread", sender: "", content: { unread: false } }] } } } } } as never, false);
    expect(room.markedUnread).toBeNull();
  });

  it("drafts are kept on the server a moment after typing", async () => {
    vi.useFakeTimers();
    c.setDraft(`${ROOM}|`, "Hallo");
    c.setDraft(`${ROOM}|$1`, "im Thread");
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(900);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "PUT", path: "/_matrix/client/v3/user/@max:acme.de/account_data/com.xenaxio.drafts" });
    expect(Object.keys((calls[0]!.body as { items: object }).items)).toEqual([`${ROOM}|`, `${ROOM}|$1`]);
    c.setDraft(`${ROOM}|`, "");
    await vi.advanceTimersByTimeAsync(900);
    expect(Object.keys(c.drafts)).toEqual([`${ROOM}|$1`]);
    vi.useRealTimers();
    expect(parseDrafts({ items: { [`${ROOM}|`]: { text: "x", ts: 1 }, bad: { text: "y" }, [`${ROOM}|$2`]: { text: "  " } } })).toEqual({ [`${ROOM}|`]: { text: "x", ts: 1 } });
  });

  it("the versions of an edited message, only the author's edits", async () => {
    answer = (_m, path) =>
      path.includes("/event/")
        ? { event_id: "$1", type: "m.room.message", sender: "@anna:acme.de", origin_server_ts: 1, content: { body: "Erst" } }
        : {
            chunk: [
              { type: "m.room.message", sender: "@anna:acme.de", origin_server_ts: 3, content: { "m.new_content": { body: "Drittens" } } },
              { type: "m.room.message", sender: "@eve:acme.de", origin_server_ts: 4, content: { "m.new_content": { body: "Fremd" } } },
              { type: "m.room.message", sender: "@anna:acme.de", origin_server_ts: 2, content: { "m.new_content": { body: "Zweitens" } } },
            ],
          };
    expect(await c.editHistory(ROOM, "$1")).toEqual([
      { ts: 1, body: "Erst" },
      { ts: 2, body: "Zweitens" },
      { ts: 3, body: "Drittens" },
    ]);
  });

  it("forwards text as a quote with where it came from; a file goes along itself", () => {
    const source = { roomId: ROOM, eventId: "$1", sender: "@anna:acme.de", senderName: "Anna", roomName: "vertrieb", ts: 5, link: "https://acme.de/de/chat/?room=x" };
    const text = forwardContent({ msgtype: "m.text", body: "Zeile 1\nZeile 2" }, source, " Schau mal ", "Weitergeleitet");
    expect(text.body).toBe("Schau mal\n\nWeitergeleitet: Anna (#vertrieb)\n> Zeile 1\n> Zeile 2");
    expect(forwardedOf(text)).toEqual(source);
    expect(forwardParts(text)).toEqual({ note: "Schau mal", text: "Zeile 1\nZeile 2" });
    const file = forwardContent({ msgtype: "m.image", body: "a.png", url: "mxc://acme.de/1", "m.relates_to": { rel_type: "m.thread" } }, source, "", "Weitergeleitet");
    expect(file).toMatchObject({ msgtype: "m.image", url: "mxc://acme.de/1", "com.xenaxio.forward": source });
    expect(file).not.toHaveProperty("m.relates_to");
    expect(forwardedOf({ "com.xenaxio.forward": { eventId: "$1", roomId: ROOM, link: "javascript:x", senderName: "<b>" } })).toMatchObject({ link: "", senderName: "<b>" });
  });
});
