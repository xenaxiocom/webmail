import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatClient, type Room } from "@/lib/xenaxio/chat/client";
import { useChatStore } from "@/lib/xenaxio/chat/store";
import { ChatDialogsProvider } from "../chat/dialogs";
import { ChatSidebar } from "../chat/sidebar";

const room = (id: string, name: string, extra: Partial<Room> = {}): Room =>
  ({ id, name, kind: "channel", joinRule: "public", membership: "join", tags: {}, lastTs: 0, archived: false, notifications: 0, highlights: 0, threadUnread: new Map(), members: new Map(), timeline: [], threads: new Map(), byId: new Map(), pinned: [], typing: [], external: false, ...extra }) as unknown as Room;

function setup() {
  const client = new ChatClient();
  client.userId = "@anna:acme.de";
  for (const r of [room("!v:acme.de", "vertrieb", { notifications: 3 }), room("!m:acme.de", "marketing")]) client.rooms.set(r.id, r);
  client.roomLevels = new Map([["!m:acme.de", "none"]]);
  const setSidebar = vi.spyOn(client, "setSidebar").mockImplementation(async (next) => {
    client.sidebar = next;
  });
  const markAllRead = vi.spyOn(client, "markAllRead").mockResolvedValue();
  useChatStore.setState({ client, colleagues: new Map(), view: { kind: "home" } });
  const ui = render(
    <ChatDialogsProvider>
      <ChatSidebar client={client} companyName="Acme" onJump={vi.fn()} onCreateChannel={vi.fn()} onNewMessage={vi.fn()} onNotify={vi.fn()} />
    </ChatDialogsProvider>,
  );
  return { client, setSidebar, markAllRead, rerender: () => ui.rerender(
    <ChatDialogsProvider>
      <ChatSidebar client={client} companyName="Acme" onJump={vi.fn()} onCreateChannel={vi.fn()} onNewMessage={vi.fn()} onNotify={vi.fn()} />
    </ChatDialogsProvider>,
  ) };
}

describe("sidebar menus and own sections (step 99, part C)", () => {
  it("a right click opens the channel's menu; a new section takes the channel; it is kept on the server", async () => {
    const { client, setSidebar, rerender } = setup();
    fireEvent.contextMenu(screen.getByRole("button", { name: /^vertrieb/ }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Star" })).toBeTruthy();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "New section…" }));
    const dialog = await screen.findByRole("dialog", { name: "New section" });
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Kunden" } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    });
    expect(setSidebar).toHaveBeenCalled();
    expect(client.sidebar.sections).toEqual([{ id: expect.stringMatching(/^s/), name: "Kunden", rooms: ["!v:acme.de"] }]);
    rerender();
    const section = document.querySelector(`[data-section="${client.sidebar.sections[0]?.id}"]`) as HTMLElement;
    expect(within(section).getByText("Kunden")).toBeTruthy();
    expect(within(section).getByRole("button", { name: /^vertrieb/ })).toBeTruthy();
  });

  it("a muted channel shows it; 'unread only' and Shift+Esc", async () => {
    const { client, markAllRead, rerender } = setup();
    expect(within(screen.getByRole("button", { name: /^marketing/ })).getByLabelText("Nothing")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sidebar" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitemradio", { name: "Show unread only" }));
    });
    expect(client.sidebar.unreadOnly).toBe(true);
    rerender();
    expect(screen.queryByRole("button", { name: /^marketing/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^vertrieb/ })).toBeTruthy();
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape", shiftKey: true });
    });
    expect(markAllRead).toHaveBeenCalled();
  });

  it("a long press opens the menu, and lifting the finger does not open the channel", () => {
    vi.useFakeTimers();
    setup();
    const row = screen.getByRole("button", { name: /^vertrieb/ });
    fireEvent.pointerDown(row, { pointerType: "touch", clientX: 5, clientY: 5 });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.click(row);
    expect(useChatStore.getState().view).toEqual({ kind: "home" });
    vi.useRealTimers();
  });
});
