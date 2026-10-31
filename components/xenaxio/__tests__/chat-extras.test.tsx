import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as { method: string; path: string; body?: unknown }[]);
vi.mock("@/lib/xenaxio/chat/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/xenaxio/chat/api")>()),
  mx: vi.fn(async (method: string, path: string, body?: unknown) => {
    calls.push({ method, path: decodeURIComponent(path), body });
    return { room_id: "!new:x", event_id: "$e" };
  }),
}));

const { ChatClient } = await import("@/lib/xenaxio/chat/client");
const { bookmarksOf, POST_FIELD, postOf } = await import("@/lib/xenaxio/chat/extras");
const { messageHtml, setCompanyEmoji, withGroupMentions } = await import("@/lib/xenaxio/chat/format");
const { useChatStore } = await import("@/lib/xenaxio/chat/store");
const { ChatDialogsProvider } = await import("../chat/dialogs");
const { BookmarksBar, CatchUpView, ForumView } = await import("../chat/channel-extras");

const R = "!f:x";
const st = (type: string, content: Record<string, unknown>) => ({ type, state_key: "", sender: "@a:x", origin_server_ts: 1, content });
const post = (id: string, ts: number, title: string, tags: string[]) => ({ event_id: id, type: "m.room.message", sender: "@a:x", origin_server_ts: ts, content: { msgtype: "m.text", body: `**${title}**\nText`, [POST_FIELD]: { title, tags } } });

function client() {
  const c = new ChatClient();
  c.userId = "@max:x";
  c.processSync(
    {
      next_batch: "s",
      rooms: {
        join: {
          [R]: {
            state: { events: [st("m.room.name", { name: "fragen" }), st("com.xenaxio.forum", { forum: true, tags: ["Frage", "Idee"] }), st("com.xenaxio.bookmarks", { items: [{ title: "Wiki", url: "https://wiki.x" }, { url: "javascript:x" }] }), st("com.xenaxio.canvas", { text: "# Regeln" })] },
            timeline: { events: [post("$p1", 10, "Alte Frage", ["Frage"]), post("$p2", 20, "Neue Idee", ["Idee"])] },
            unread_notifications: { notification_count: 2 },
          },
        },
      },
    } as never,
    true,
  );
  useChatStore.setState({ client: c, colleagues: new Map(), view: { kind: "home" }, panel: null });
  return c;
}

describe("from Slack and Discord (step 99, part H)", () => {
  it("room state: forum, bookmarks (https only), canvas; posts and mentions of groups", () => {
    const c = client();
    const room = c.rooms.get(R)!;
    expect(room.forum).toEqual({ tags: ["Frage", "Idee"] });
    expect(room.bookmarks).toEqual([{ title: "Wiki", url: "https://wiki.x" }]);
    expect(room.canvas?.text).toBe("# Regeln");
    expect(bookmarksOf({ items: [{ url: "https://a.de/x" }] })).toEqual([{ title: "a.de/x", url: "https://a.de/x" }]);
    expect(postOf({ [POST_FIELD]: { title: " ", tags: [] } })).toBeNull();
    const content = withGroupMentions({ msgtype: "m.text", body: "x", "m.mentions": { user_ids: ["@b:x"] } }, "Hallo @vertrieb!", [{ handle: "vertrieb", addresses: ["@a:x", "@max:x", "@b:x"] }, { handle: "vertr", addresses: ["@z:x"] }], "@max:x");
    expect(content["m.mentions"]).toEqual({ user_ids: ["@b:x", "@a:x"] });
  });

  it("the company's emoji show as pictures in text, not in code", () => {
    setCompanyEmoji([{ name: "logo", url: "/api/chat/emoji/logo" }]);
    const html = messageHtml({ body: "x", format: "org.matrix.custom.html", formatted_body: "Hey :logo: <code>:logo:</code> :unknown:" });
    expect(html).toBe('Hey <img class="chat-emoji" src="/api/chat/emoji/logo" alt=":logo:" title=":logo:"> <code>:logo:</code> :unknown:');
    setCompanyEmoji([]);
  });

  it("a voice channel and a forum are made with their state; everyone may edit canvas and bookmarks", async () => {
    const c = client();
    calls.length = 0;
    await c.createChannel({ name: "talk", isPublic: true, kind: "voice" });
    await c.createChannel({ name: "ideen", isPublic: true, kind: "forum", tags: ["Idee"] });
    const [voice, forum] = calls.map((x) => x.body as Record<string, unknown>);
    expect(voice!.initial_state).toEqual([{ type: "com.xenaxio.voice", state_key: "", content: { voice: true } }]);
    expect(forum!.initial_state).toEqual([{ type: "com.xenaxio.forum", state_key: "", content: { forum: true, tags: ["Idee"] } }]);
    expect((voice!.power_level_content_override as { events: Record<string, number> }).events).toMatchObject({ "com.xenaxio.canvas": 0, "com.xenaxio.bookmarks": 0 });
  });

  it("a forum lists posts by activity, filters by tag and writes a new post", async () => {
    const c = client();
    const send = vi.spyOn(c, "send").mockResolvedValue();
    render(
      <ChatDialogsProvider>
        <ForumView client={c} room={c.rooms.get(R)!} />
      </ChatDialogsProvider>,
    );
    const titles = () => screen.getAllByRole("listitem").map((li) => li.querySelector(".font-semibold")?.textContent);
    expect(titles()).toEqual(["Neue Idee", "Alte Frage"]);
    fireEvent.click(screen.getByRole("button", { name: "Frage" }));
    expect(titles()).toEqual(["Alte Frage"]);
    fireEvent.click(screen.getByRole("button", { name: /New post/ }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Wie geht X?" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Frage" }).at(-1)!);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Post" }));
    });
    expect(send).toHaveBeenCalledWith(R, expect.objectContaining({ body: "**Wie geht X?**", [POST_FIELD]: { title: "Wie geht X?", tags: ["Frage"] } }));
  });

  it("bookmarks show as links; catch up goes through unread channels", async () => {
    const c = client();
    render(
      <ChatDialogsProvider>
        <BookmarksBar client={c} room={c.rooms.get(R)!} />
      </ChatDialogsProvider>,
    );
    expect(screen.getByRole("link", { name: "Wiki" }).getAttribute("href")).toBe("https://wiki.x");
    const markRead = vi.spyOn(c, "markRead").mockResolvedValue();
    render(<CatchUpView client={c} />);
    expect(screen.getByText("#fragen")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Read, next" }));
    expect(markRead).toHaveBeenCalledWith(R);
  });
});
