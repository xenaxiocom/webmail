// Step 89: the screen the assistant is asked from.
import { describe, expect, it } from "vitest";
import { eventItem, screenOf, screenSuggestions } from "../assistant-screen";

const email = { id: "m1", threadId: "t1", subject: "Angebot Webshop", mailboxIds: { inbox: true } };
const chat = (view: { kind: string; roomId?: string }, panel: { kind: string; roomId?: string; rootId?: string } | null = null) => ({
  view: view as never,
  panel: panel as never,
  roomName: (id: string) => (id === "!r:x" ? "vertrieb" : undefined),
});

describe("screenOf (step 89)", () => {
  it("sends the open email only on the mail page", () => {
    expect(screenOf({ pathname: "/mail/thread/t1", email })).toEqual({
      page: "mail",
      context: { page: "mail", emailId: "m1", threadId: "t1" },
      label: { kind: "email", name: "Angebot Webshop" },
    });
    // The email stays selected in its store when the person opens the calendar.
    expect(screenOf({ pathname: "/calendar", email }).context).not.toHaveProperty("emailId");
  });

  it("names a selection of two or more emails, at most 20 of them", () => {
    const selected = Array.from({ length: 25 }, (_, i) => ({ id: `m${i}`, threadId: `t${i}`, mailboxIds: { "info:inbox": true } }));
    const s = screenOf({ pathname: "/mail", selected });
    expect(s.context.selectedEmailIds).toHaveLength(20);
    expect(s.context.selectedEmailIds?.[0]).toBe("info:m0");
    expect(s.label).toEqual({ kind: "emails", name: "25" });
    expect(screenOf({ pathname: "/mail", selected: selected.slice(0, 1) }).context.selectedEmailIds).toBeUndefined();
  });

  it("calendar: view, day and the open event with the series id", () => {
    const item = eventItem({ id: "occ-1", baseEventId: "ev1", title: "Jour fixe", start: "2026-11-02T10:00:00" });
    const s = screenOf({ pathname: "/calendar/week/2026-11-02", calendar: { view: "week", date: new Date(2026, 10, 2) }, items: { event: item! } });
    expect(s.context).toEqual({ page: "calendar", view: "week", day: "2026-11-02", open: { kind: "event", id: "ev1", day: "2026-11-02", time: "10:00" } });
    expect(s.label).toEqual({ kind: "event", name: "Jour fixe" });
    expect(screenOf({ pathname: "/calendar/event/ev9" }).context.open).toEqual({ kind: "event", id: "ev9" });
  });

  it("tasks, files, Rooms and contacts", () => {
    expect(screenOf({ pathname: "/calendar/tasks", items: { task: { id: "k1", name: "Steuerberater" } } }).context).toEqual({ page: "tasks", open: { kind: "task", id: "k1" } });
    expect(screenOf({ pathname: "/files/Projekte", folder: "/Projekte", items: { file: { id: "f1", name: "Plan.pdf" } } })).toMatchObject({ context: { folder: "/Projekte", open: { kind: "file", id: "f1" } }, label: { kind: "file", name: "Plan.pdf" } });
    expect(screenOf({ pathname: "/files", folder: "/" }).label).toBeUndefined();
    expect(screenOf({ pathname: "/chat", chat: chat({ kind: "room", roomId: "!r:x" }) })).toMatchObject({ context: { open: { kind: "room", id: "!r:x" } }, label: { kind: "room", name: "vertrieb" } });
    expect(screenOf({ pathname: "/chat", chat: chat({ kind: "room", roomId: "!r:x" }, { kind: "thread", roomId: "!r:x", rootId: "$e1" }) }).context.open).toEqual({ kind: "thread", id: "$e1", room: "!r:x" });
    expect(screenOf({ pathname: "/chat", chat: chat({ kind: "mentions" }) }).context.view).toBe("mentions");
    expect(screenOf({ pathname: "/contacts/c1", contact: { address: "jan@mueller.de", name: "Jan Müller" } }).context.open).toEqual({ kind: "contact", id: "jan@mueller.de" });
  });

  it("settings and administration: the path of the page", () => {
    expect(screenOf({ pathname: "/settings/vacation" }).context).toEqual({ page: "settings", path: "/settings/vacation/" });
    expect(screenOf({ pathname: "/workspace/ai/permissions/" }).context.path).toBe("/workspace/ai/permissions/");
    expect(screenOf({ pathname: "/settings" }).context).toEqual({ page: "settings" });
  });

  it("nothing on pages without an assistant topic", () => {
    expect(screenOf({ pathname: "/meet/abc", email })).toEqual({ context: {} });
  });
});

describe("screenSuggestions (step 89)", () => {
  it("offers questions that fit the screen", () => {
    expect(screenSuggestions(screenOf({ pathname: "/mail/thread/t1", email }))).toEqual(["email_tasks", "email_points"]);
    expect(screenSuggestions(screenOf({ pathname: "/settings/vacation" }))).toEqual(["vacation_on", "page_what"]);
    expect(screenSuggestions(screenOf({ pathname: "/chat", chat: chat({ kind: "room", roomId: "!r:x" }) }))).toEqual(["room_missed", "room_summary"]);
    expect(screenSuggestions(screenOf({ pathname: "/meet/abc" }))).toEqual([]);
  });
});

describe("screen strings (step 89)", () => {
  it("every suggestion and label has German and English text", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("lib/xenaxio/assistant-screen.ts", "utf8");
    const body = source.slice(source.indexOf("export function screenSuggestions"));
    const keys = [...new Set([...body.matchAll(/"([a-z]+_[a-z_]+)"/g)].map((m) => `ask_${m[1]}`))];
    expect(keys.length).toBeGreaterThan(30);
    const de = (await import("../messages-de.json")).default.assistant.screen as Record<string, string>;
    const en = (await import("../messages-en.json")).default.assistant.screen as Record<string, string>;
    const labels = ["mail", "calendar", "tasks", "files", "rooms", "contacts", "settings", "workspace"].map((p) => `page_${p}`);
    for (const k of [...keys, ...labels, "kind_event", "kind_task", "kind_file", "kind_room", "kind_thread", "kind_contact"]) {
      expect(de[k], `de ${k}`).toBeTruthy();
      expect(en[k], `en ${k}`).toBeTruthy();
    }
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });
});
