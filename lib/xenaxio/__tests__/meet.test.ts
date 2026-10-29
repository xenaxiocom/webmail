import { afterEach, describe, expect, it } from "vitest";
import { getPathPrefix } from "@/lib/browser-navigation";
import { isGuest, loadGuestVisit, meetingCode, meetingLink, personalLink, saveGuestVisit, signalUrl } from "@/lib/xenaxio/meet";

// Step 78: the meeting page reads its code from the address and connects its
// signal through the platform's own address.
afterEach(() => {
  window.history.replaceState(null, "", "/");
  sessionStorage.clear();
});

describe("meeting links", () => {
  it("reads the code from /meet/<code>, also under a locale", () => {
    expect(meetingCode("/meet/abcdefghjk23")).toBe("abcdefghjk23");
    expect(meetingCode("/meet/abcdefghjk23/")).toBe("abcdefghjk23");
    expect(meetingCode("/en/meet/abcdefghjk23")).toBe("abcdefghjk23");
    for (const bad of ["/meet/", "/meet/short", "/meet/ABCDEFGHJK23", "/meet/abcdefghjk23/x", "/book/abcdefghjk23"]) expect(meetingCode(bad)).toBeNull();
  });

  it("is never a mount prefix", () => {
    window.history.replaceState(null, "", "/meet/abcdefghjk23");
    expect(getPathPrefix()).toBe("");
  });

  it("builds the link to send and the signal address", () => {
    expect(meetingLink("abcdefghjk23", "https://firma.xenaxio.com")).toBe("https://firma.xenaxio.com/meet/abcdefghjk23");
    expect(signalUrl("/api/meet/rtc", "https://firma.xenaxio.com/meet/abcdefghjk23")).toBe("wss://firma.xenaxio.com/api/meet/rtc");
    expect(signalUrl("/api/meet/rtc", "http://localhost:3000/meet/x")).toBe("ws://localhost:3000/api/meet/rtc");
  });

  it("keeps a guest's visit for this meeting only", () => {
    expect(loadGuestVisit("abcdefghjk23")).toBeNull();
    saveGuestVisit({ code: "abcdefghjk23", guestId: "g1", key: "k".repeat(32), name: "Erika" });
    expect(loadGuestVisit("abcdefghjk23")).toMatchObject({ guestId: "g1", name: "Erika" });
    expect(loadGuestVisit("otherotherxx")).toBeNull();
    saveGuestVisit(null);
    expect(loadGuestVisit("abcdefghjk23")).toBeNull();
    sessionStorage.setItem("xenaxio-meet-guest", "{broken");
    expect(loadGuestVisit("abcdefghjk23")).toBeNull();
  });

  it("tells guests from employees", () => {
    expect(isGuest("g:1")).toBe(true);
    expect(isGuest("u:1")).toBe(false);
  });

  it("step 79, part B: reads a personal webinar link from the fragment", () => {
    const id = "11111111-2222-4333-8444-555555555555";
    const key = "AbC_def-".repeat(4);
    expect(personalLink(`#r=${id}.${key}`)).toEqual({ id, key, cancel: false });
    expect(personalLink(`#r=${id}.${key}&cancel=1`)).toEqual({ id, key, cancel: true });
    expect(personalLink("#r=nope.short")).toBeNull();
    expect(personalLink("")).toBeNull();
  });
});
