import { describe, expect, it } from "vitest";
import { EMPTY_LAYOUT, parseLayout, type Room, roomLevelsOf, type SidebarLayout } from "../client";
import { moveRoom, sidebarGroups } from "../view";

const room = (id: string, extra: Partial<Room> = {}): Room =>
  ({ id, name: id.slice(1), kind: "channel", membership: "join", tags: {}, lastTs: 0, archived: false, notifications: 0, highlights: 0, threadUnread: new Map(), ...extra }) as Room;
const ids = (rooms: Room[]) => rooms.map((r) => r.id);
const name = (r: Room) => r.name ?? r.id;

describe("sidebar sections (step 99, part C)", () => {
  const rooms = [room("!b"), room("!a", { lastTs: 5 }), room("!c", { lastTs: 9, notifications: 2 }), room("!fav", { tags: { "m.favourite": {} } }), room("!dm1", { kind: "dm", lastTs: 1 }), room("!dm2", { kind: "dm", lastTs: 3 })];

  it("own sections take their rooms out of channels and direct messages; favourites stay favourites", () => {
    const layout: SidebarLayout = { ...EMPTY_LAYOUT, sections: [{ id: "s1", name: "Kunden", rooms: ["!c", "!dm1", "!fav", "!gone"] }] };
    const g = sidebarGroups(rooms, name, layout);
    expect(g.custom).toEqual([{ id: "s1", name: "Kunden", rooms: [rooms[2], rooms[4]] }]);
    expect(ids(g.channels)).toEqual(["!a", "!b"]);
    expect(ids(g.direct)).toEqual(["!dm2"]);
    expect(ids(g.starred)).toEqual(["!fav"]);
  });

  it("sorts each section as chosen and shows only unread, keeping the open room", () => {
    const layout: SidebarLayout = { ...EMPTY_LAYOUT, sort: { channels: "activity" } };
    expect(ids(sidebarGroups(rooms, name, layout).channels)).toEqual(["!c", "!a", "!b"]);
    const unread = sidebarGroups(rooms, name, { ...layout, unreadOnly: true }, "!b");
    expect(ids(unread.channels)).toEqual(["!c", "!b"]);
    expect(ids(unread.direct)).toEqual([]);
  });

  it("moves a room into a section, before another, or out of all", () => {
    let layout: SidebarLayout = { ...EMPTY_LAYOUT, sections: [{ id: "s1", name: "A", rooms: ["!a", "!b"] }, { id: "s2", name: "B", rooms: [] }] };
    layout = moveRoom(layout, "!c", "s1", "!b");
    expect(layout.sections[0]?.rooms).toEqual(["!a", "!c", "!b"]);
    layout = moveRoom(layout, "!a", "s2");
    expect(layout.sections.map((s) => s.rooms)).toEqual([["!c", "!b"], ["!a"]]);
    layout = moveRoom(layout, "!a", null);
    expect(layout.sections.map((s) => s.rooms)).toEqual([["!c", "!b"], []]);
  });

  it("reads the layout from account data and drops what does not fit", () => {
    expect(
      parseLayout({
        sections: [{ id: "s1", name: " Kunden ", rooms: ["!a", 5, "nope"] }, { id: "bad id", name: "x", rooms: [] }, { id: "s2", name: "", rooms: [] }],
        collapsed: ["direct", 1],
        sort: { s1: "alpha", channels: "random" },
        unreadOnly: "yes",
      }),
    ).toEqual({ sections: [{ id: "s1", name: "Kunden", rooms: ["!a"] }], collapsed: ["direct"], sort: { s1: "alpha" }, unreadOnly: false });
    expect(parseLayout(undefined)).toEqual(EMPTY_LAYOUT);
  });

  it("knows muted and mentions-only channels from the push rules", () => {
    const levels = roomLevelsOf({ global: { override: [{ rule_id: "xenaxio-mute-!a" }, { rule_id: ".m.rule.master" }], room: [{ rule_id: "!b" }, { rule_id: "!c", enabled: false }] } });
    expect([...levels]).toEqual([["!b", "mentions"], ["!a", "none"]]);
  });
});
