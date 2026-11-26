import { describe, expect, it } from "vitest";
import { keepOrder, ORDER_KEY, parseOrder } from "../company-order";

// Step 152 R1d: the companies' order on the platform, shared with the XenRooms phone app.
describe("company order on the platform", () => {
  it("reads the stored value; a bare list counts as oldest", () => {
    expect(parseOrder({ order: ["a", "b"], at: 5 })).toEqual({ order: ["a", "b"], at: 5 });
    expect(parseOrder(["a"])).toEqual({ order: ["a"], at: 0 });
    expect(parseOrder({ order: [1] })).toBeNull();
    expect(parseOrder(null)).toBeNull();
  });

  it("a settings save keeps the order the phone wrote, unless the browser's is newer", () => {
    const phone = { theme: "dark", [ORDER_KEY]: { order: ["b", "a"], at: 200 } };
    // The browser's copy has no order (Bulwark's settings save sends the whole document).
    expect(keepOrder(phone, { theme: "light" })).toEqual({ theme: "light", [ORDER_KEY]: { order: ["b", "a"], at: 200 } });
    expect(keepOrder(phone, { [ORDER_KEY]: { order: ["a", "b"], at: 100 } })[ORDER_KEY]).toEqual({ order: ["b", "a"], at: 200 });
    expect(keepOrder(phone, { [ORDER_KEY]: { order: ["a", "b"], at: 300 } })[ORDER_KEY]).toEqual({ order: ["a", "b"], at: 300 });
    expect(keepOrder(null, { theme: "light" })).toEqual({ theme: "light" });
  });
});
