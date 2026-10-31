import { describe, expect, it } from "vitest";
import { isSidebarShortcut, moveInOrder, orderAccounts } from "../layout";

const a = (userId: string) => ({ userId });

describe("company order (step 106)", () => {
  it("keeps the saved order whichever account is active, new ones last", () => {
    expect(orderAccounts([a("c"), a("b"), a("a")], ["a", "b"]).map((x) => x.userId)).toEqual(["a", "b", "c"]);
  });
  it("uses the platform's order before anything was saved, and drops gone ones", () => {
    expect(orderAccounts([a("b"), a("a")], []).map((x) => x.userId)).toEqual(["b", "a"]);
    expect(orderAccounts([a("b")], ["a", "b"]).map((x) => x.userId)).toEqual(["b"]);
  });
  it("moves a company onto another's place", () => {
    expect(moveInOrder(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(moveInOrder(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(moveInOrder(["a", "b"], "a", "a")).toBeNull();
    expect(moveInOrder(["a", "b"], "x", "a")).toBeNull();
  });
  it("knows Ctrl/Cmd+Shift+D", () => {
    const k = { key: "D", ctrlKey: true, metaKey: false, shiftKey: true, altKey: false };
    expect(isSidebarShortcut(k)).toBe(true);
    expect(isSidebarShortcut({ ...k, ctrlKey: false, metaKey: true, key: "d" })).toBe(true);
    expect(isSidebarShortcut({ ...k, shiftKey: false })).toBe(false);
    expect(isSidebarShortcut({ ...k, altKey: true })).toBe(false);
  });
});
