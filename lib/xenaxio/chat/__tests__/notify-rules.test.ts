import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { method: string; path: string; body?: unknown }[] = [];
vi.mock("../api", async (orig) => {
  const real = await orig<typeof import("../api")>();
  return {
    ...real,
    mx: vi.fn(async (method: string, path: string, body?: unknown) => {
      calls.push({ method, path: decodeURIComponent(path), body });
      return {};
    }),
  };
});

import { ChatClient, defaultLevelOf, ignoredRoomMentionsOf, roomLevelsOf } from "../client";

const R = "!v:acme.de";
const rules = (global: Record<string, unknown>) => ({ global });

describe("chat notifications in push rules (step 99, part D)", () => {
  let c: ChatClient;
  beforeEach(() => {
    calls.length = 0;
    c = new ChatClient();
    c.userId = "@max:acme.de";
  });

  it("reads the default, each channel's own level and ignored @channel", () => {
    expect(defaultLevelOf(rules({ override: [{ rule_id: ".m.rule.master", enabled: false }], underride: [{ rule_id: ".m.rule.message", enabled: true }] }))).toBe("all");
    expect(defaultLevelOf(rules({ underride: [{ rule_id: ".m.rule.message", enabled: false }] }))).toBe("mentions");
    expect(defaultLevelOf(rules({ override: [{ rule_id: ".m.rule.master", enabled: true }] }))).toBe("none");
    const levels = roomLevelsOf(rules({ room: [{ rule_id: "!a", actions: ["notify"] }, { rule_id: "!b", actions: [] }], override: [{ rule_id: "xenaxio-mute-!c" }] }));
    expect([...levels]).toEqual([["!a", "all"], ["!b", "mentions"], ["!c", "none"]]);
    expect([...ignoredRoomMentionsOf(rules({ override: [{ rule_id: `xenaxio-noroom-${R}` }, { rule_id: "xenaxio-noroom-!x", enabled: false }] }))]).toEqual([R]);
  });

  it("the default is two server rules; a channel at the default has no rule of its own", async () => {
    await c.setDefaultLevel("mentions");
    expect(calls.map((x) => [x.method, x.path, x.body])).toEqual([
      ["PUT", "/_matrix/client/v3/pushrules/global/override/.m.rule.master/enabled", { enabled: false }],
      ["PUT", "/_matrix/client/v3/pushrules/global/underride/.m.rule.message/enabled", { enabled: false }],
    ]);
    calls.length = 0;
    // "All" under a lower default is a rule of the channel.
    await c.setNotifications(R, "all");
    expect(calls.filter((x) => x.method === "PUT")).toEqual([{ method: "PUT", path: `/_matrix/client/v3/pushrules/global/room/${R}`, body: { actions: ["notify", { set_tweak: "sound", value: "default" }] } }]);
    expect(c.levelOf(R)).toBe("all");
    calls.length = 0;
    // Back to the default: the channel's rules go.
    await c.setNotifications(R, "mentions");
    expect(calls.filter((x) => x.method === "PUT")).toEqual([]);
    expect(calls.filter((x) => x.method === "DELETE")).toHaveLength(2);
    expect(c.roomLevels.has(R)).toBe(false);
    expect(c.levelOf(R)).toBe("mentions");
  });

  it("ignoring @channel in a channel is an override rule on the mention", async () => {
    await c.setIgnoreRoomMentions(R, true);
    expect(calls[0]).toEqual({
      method: "PUT",
      path: `/_matrix/client/v3/pushrules/global/override/xenaxio-noroom-${R}`,
      body: { actions: [], conditions: [{ kind: "event_match", key: "room_id", pattern: R }, { kind: "event_property_is", key: "content.m\\.mentions.room", value: true }] },
    });
    expect(c.ignoredRoomMentions.has(R)).toBe(true);
    await c.setIgnoreRoomMentions(R, false);
    expect(calls[1]?.method).toBe("DELETE");
    expect(c.ignoredRoomMentions.has(R)).toBe(false);
  });

  it("the sync brings the rules", () => {
    c.processSync({ next_batch: "s1", account_data: { events: [{ type: "m.push_rules", sender: "", content: rules({ underride: [{ rule_id: ".m.rule.message", enabled: false }], override: [{ rule_id: `xenaxio-noroom-${R}` }] }) }] } } as never, true);
    expect(c.defaultLevel).toBe("mentions");
    expect(c.ignoredRoomMentions.has(R)).toBe(true);
  });
});
