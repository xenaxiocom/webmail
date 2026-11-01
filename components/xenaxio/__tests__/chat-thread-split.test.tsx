// Step 114: the divider between a room and its thread; the width is the person's own per room.
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThreadSplit } from "@/components/xenaxio/chat/thread-split";
import type { ChatClient } from "@/lib/xenaxio/chat/client";

let wide = true;
const ROOM = "!forum:acme.de";

function fakeClient(widths: Record<string, number> = {}) {
  return {
    threadWidth: (roomId: string) => widths[roomId] ?? 50,
    setThreadWidth: vi.fn(async () => undefined),
  } as unknown as ChatClient & { setThreadWidth: ReturnType<typeof vi.fn> };
}

const show = (client: ChatClient, panel: Parameters<typeof ThreadSplit>[0]["panel"]) =>
  render(<ThreadSplit client={client} panel={panel} main={<p>posts</p>} side={panel && <aside className="md:w-[380px]">replies</aside>} closeLabel="Close" onClose={() => undefined} />);

describe("thread split (step 114)", () => {
  beforeEach(() => {
    wide = true;
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({ matches: query.includes("1024") ? wide : false, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false }) as MediaQueryList);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 1000, height: 800, x: 0, y: 0, top: 0, left: 0, right: 1000, bottom: 800, toJSON: () => ({}) } as DOMRect);
  });
  afterEach(() => vi.restoreAllMocks());

  it("a thread opens half and half, or at the person's own width for this room", () => {
    const { container, unmount } = show(fakeClient(), { kind: "thread", roomId: ROOM, rootId: "$p1" });
    expect(container.querySelector("[data-thread-width]")?.getAttribute("data-thread-width")).toBe("50");
    expect((container.querySelector("[data-thread-width]") as HTMLElement).style.width).toBe("50%");
    unmount();
    const own = show(fakeClient({ [ROOM]: 65 }), { kind: "thread", roomId: ROOM, rootId: "$p1" });
    expect(own.container.querySelector("[data-thread-width]")?.getAttribute("data-thread-width")).toBe("65");
  });

  it("the divider changes the width and saves it for the room; a double click goes back to half and half", () => {
    const client = fakeClient();
    const { container } = show(client, { kind: "thread", roomId: ROOM, rootId: "$p1" });
    const divider = screen.getByTestId("chat-thread-resize");
    // Arrow left: the divider moves left, the thread gets wider (10 px of 1000).
    fireEvent.keyDown(divider, { key: "ArrowLeft" });
    expect(client.setThreadWidth).toHaveBeenLastCalledWith(ROOM, 51);
    // A drag 200 px to the right: the thread narrows by 20 %.
    fireEvent.pointerDown(divider, { button: 0, pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 700, buttons: 1 });
    expect(container.querySelector("[data-thread-width]")?.getAttribute("data-thread-width")).toBe("30");
    fireEvent.pointerUp(document, { pointerId: 1, clientX: 700 });
    expect(client.setThreadWidth).toHaveBeenLastCalledWith(ROOM, 30);
    fireEvent.doubleClick(divider);
    expect(client.setThreadWidth).toHaveBeenLastCalledWith(ROOM, null);
  });

  it("no divider for members or a profile, nor below 1024 px, where the thread lies over the room", () => {
    const client = fakeClient();
    const members = show(client, { kind: "members", roomId: ROOM });
    expect(screen.queryByTestId("chat-thread-resize")).toBeNull();
    expect(members.container.querySelector("[data-thread-width]")).toBeNull();
    members.unmount();
    wide = false;
    const narrow = show(client, { kind: "thread", roomId: ROOM, rootId: "$p1" });
    expect(screen.queryByTestId("chat-thread-resize")).toBeNull();
    expect(narrow.container.querySelector("[data-thread-width]")).toBeNull();
    expect(screen.getByTestId("chat-panel-backdrop")).toBeTruthy();
  });
});
