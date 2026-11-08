import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Step 142: one shared EventSource per tab; events to every listener; "reset" after a gap.
import { liveOpen, resetLiveForTests, sendTyping, subscribeLive, type LiveEvent } from "../live";

class FakeSource {
  static CLOSED = 2;
  static all: FakeSource[] = [];
  readyState = 1;
  closed = false;
  onerror: (() => void) | null = null;
  private handlers = new Map<string, ((e: MessageEvent) => void)[]>();
  constructor(public url: string) {
    FakeSource.all.push(this);
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
  }
  fire(type: string, data: unknown = {}) {
    for (const fn of this.handlers.get(type) ?? []) fn({ data: JSON.stringify(data) } as MessageEvent);
  }
  close() {
    this.closed = true;
  }
}

describe("live channel (step 142)", () => {
  beforeEach(() => {
    FakeSource.all = [];
    vi.stubGlobal("EventSource", FakeSource);
  });
  afterEach(() => {
    resetLiveForTests();
    vi.unstubAllGlobals();
  });

  it("opens one stream for all listeners and closes it with the last one", () => {
    const a: LiveEvent[] = [];
    const b: LiveEvent[] = [];
    const stopA = subscribeLive((e) => a.push(e));
    const stopB = subscribeLive((e) => b.push(e));
    expect(FakeSource.all).toHaveLength(1);
    expect(FakeSource.all[0]!.url).toBe("/api/live");
    const es = FakeSource.all[0]!;
    es.fire("hello");
    expect(liveOpen()).toBe(true);
    es.fire("live", { k: "task", o: "p1", task: "k1", a: "moved" });
    expect(a).toEqual([{ k: "task", o: "p1", task: "k1", a: "moved" }]);
    expect(b).toEqual(a);
    // A second hello is a reconnect after a gap: everyone reads again.
    es.fire("hello");
    es.fire("reset");
    expect(a.slice(1)).toEqual([{ k: "reset" }, { k: "reset" }]);
    stopA();
    expect(es.closed).toBe(false);
    stopB();
    expect(es.closed).toBe(true);
    expect(liveOpen()).toBe(false);
  });

  it("tells the others about typing at most every 3 seconds per chat", () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    sendTyping("p1", "k1");
    sendTyping("p1", "k1");
    sendTyping("p1", "k2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/live/typing");
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toEqual({ objectId: "p1", taskId: "k1" });
  });
});
