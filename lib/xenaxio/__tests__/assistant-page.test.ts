import { describe, expect, it } from "vitest";
import { pageOf } from "../assistant";

describe("pageOf (step 84)", () => {
  it("names the page the person is on, for the assistant's topics", () => {
    expect(pageOf("/")).toBe("mail");
    expect(pageOf("/mail/inbox/abc")).toBe("mail");
    expect(pageOf("/calendar")).toBe("calendar");
    expect(pageOf("/calendar/week/2026-10-30")).toBe("calendar");
    expect(pageOf("/calendar/tasks")).toBe("tasks");
    expect(pageOf("/files/Projekte/")).toBe("files");
    expect(pageOf("/chat/general")).toBe("rooms");
    expect(pageOf("/workspace/ai")).toBeUndefined();
    expect(pageOf("/mailbox")).toBeUndefined();
  });
});
