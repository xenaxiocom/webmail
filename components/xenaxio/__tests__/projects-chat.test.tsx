import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Step 142: the chat of a task or a record — answers, reactions, own messages, the "new" line.
vi.mock("next-intl", async (orig) => ({ ...(await orig<typeof import("next-intl")>()), useLocale: () => "en" }));

import { Chat, type ChatActions, firstNew, REACTION } from "../projects/chat";
import type { ChatMessage } from "@/lib/xenaxio/projects";

const anna = { id: "u1", name: "Anna Schmidt", email: "anna@acme.de" };
const max = { id: "u2", name: "Max Weber", email: "max@acme.de" };
const m = (id: string, author: typeof anna, body: string, at: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  author,
  body,
  createdAt: at,
  editedAt: null,
  deleted: false,
  replyTo: null,
  reactions: [],
  can: { edit: author.id === "u1", delete: author.id === "u1" },
  ...extra,
});
const actions = (): ChatActions & Record<string, ReturnType<typeof vi.fn>> => ({
  send: vi.fn().mockResolvedValue(true),
  edit: vi.fn().mockResolvedValue(true),
  remove: vi.fn().mockResolvedValue(true),
  react: vi.fn().mockResolvedValue(true),
  typing: vi.fn(),
});

describe("task chat (step 142)", () => {
  it("finds where the new messages start: someone else's, after what was read", () => {
    const list = [m("1", max, "a", "2026-11-08T10:00:00Z"), m("2", anna, "b", "2026-11-08T11:00:00Z"), m("3", max, "c", "2026-11-08T12:00:00Z")];
    expect(firstNew(list, "2026-11-08T10:30:00Z", "u1")).toBe("3");
    expect(firstNew(list, null, "u1")).toBeNull();
    expect(firstNew(list, "2026-11-08T13:00:00Z", "u1")).toBeNull();
  });

  it("takes one emoji or the company's own as a reaction", () => {
    expect(REACTION.test("👍")).toBe(true);
    expect(REACTION.test("👍🏽")).toBe(true);
    expect(REACTION.test(":party_parrot:")).toBe(true);
    expect(REACTION.test("ok")).toBe(false);
  });

  it("answers a message with a quote; Enter sends", async () => {
    const a = actions();
    render(<Chat messages={[m("1", max, "Welche Farbe?", "2026-11-08T10:00:00Z")]} me="u1" people={[anna, max]} canWrite objectId="o1" typing={[]} actions={a} />);
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(screen.getByText(/Replying to Max Weber/)).toBeTruthy();
    const box = screen.getByRole("combobox");
    fireEvent.change(box, { target: { value: "Blau" } });
    expect(a.typing).toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(a.send).toHaveBeenCalledWith("Blau", [], "1"));
    await waitFor(() => expect(screen.queryByText(/Replying to/)).toBeNull());
  });

  it("shows quotes, deleted messages, reactions and the new line; edits and deletes only own", async () => {
    const a = actions();
    const list = [
      m("1", max, "", "2026-11-08T10:00:00Z", { deleted: true, can: { edit: false, delete: false } }),
      m("2", anna, "Blau", "2026-11-08T11:00:00Z", { replyTo: { id: "1", author: "Max Weber", text: "", deleted: true }, reactions: [{ emoji: "👍", count: 2, mine: true, people: ["Anna", "Max"] }] }),
      m("3", max, "Gut", "2026-11-08T12:00:00Z", { editedAt: "2026-11-08T12:05:00Z" }),
    ];
    render(<Chat messages={list} lastRead="2026-11-08T11:30:00Z" me="u1" people={[anna, max]} canWrite objectId="o1" typing={["Max Weber"]} actions={a} />);
    expect(screen.getAllByText("Message deleted")).toHaveLength(2);
    expect(screen.getByRole("separator").textContent).toContain("New");
    expect(screen.getByText(/edited/)).toBeTruthy();
    expect(screen.getByText("Max Weber is typing …")).toBeTruthy();
    const chip = screen.getByRole("button", { name: "👍 2" });
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(chip);
    expect(a.react).toHaveBeenCalledWith("2", "👍");
    // Only Anna's own message can be edited or deleted; the deleted one has no actions.
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Delete message" }));
    expect(a.remove).toHaveBeenCalledWith("2");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const field = screen.getByRole("textbox", { name: "Edit" });
    fireEvent.change(field, { target: { value: "Dunkelblau" } });
    fireEvent.submit(field.closest("form")!);
    await waitFor(() => expect(a.edit).toHaveBeenCalledWith("2", "Dunkelblau"));
  });

  it("is read-only without the right to write", () => {
    render(<Chat messages={[m("1", max, "Hallo", "2026-11-08T10:00:00Z", { reactions: [{ emoji: "🎉", count: 1, mine: false, people: ["Max"] }] })]} me="u1" canWrite={false} objectId="o1" typing={[]} actions={actions()} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reply" })).toBeNull();
    expect((within(screen.getByRole("list")).getByRole("button", { name: "🎉 1" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
