import { describe, expect, it } from "vitest";
import { badgeText, companyInitials } from "@/lib/xenaxio/chat/rooms";
import { activeBrand, isRoomsPath } from "@/lib/xenaxio/portal";

describe("XenRooms helpers (step 67)", () => {
  it("has pages for the chat, sign-in and the forced password change only", () => {
    for (const path of ["/de/chat/", "/en/chat", "/de/login/", "/de/auth/x", "/de/workspace/password/"]) expect(isRoomsPath(path)).toBe(true);
    for (const path of ["/", "/de/", "/de/mail/", "/de/workspace/", "/de/calendar/", "/de/chatty/"]) expect(isRoomsPath(path)).toBe(false);
  });

  it("step 96: has creating a company without email, its people and the chat settings", () => {
    for (const path of ["/en/rooms/start/", "/de/workspace/rooms/people/", "/de/workspace/chat/", "/en/start/"]) expect(isRoomsPath(path)).toBe(true);
    for (const path of ["/de/rooms/", "/de/workspace/users/", "/de/workspace/roomsx/"]) expect(isRoomsPath(path)).toBe(false);
  });

  it("names companies without a logo by two letters and caps counts", () => {
    expect(companyInitials("Acme GmbH")).toBe("AG");
    expect(companyInitials("botkontor")).toBe("BO");
    expect(companyInitials("  ")).toBe("?");
    expect(badgeText(7)).toBe("7");
    expect(badgeText(120)).toBe("99+");
  });

  it("brands XenRooms with the signed-in person's company", () => {
    const portal = { name: "Acme", slug: "acme", url: "https://acme.x", color: "#003366", colorText: "#fff", logoUrl: null };
    expect(activeBrand({ kind: "rooms" }, { portal } as never)).toBe(portal);
    expect(activeBrand({ kind: "rooms" }, null)).toBeNull();
  });
});
