import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Step 78, part C: a Xenaxio Meeting for a calendar event, and "Join" in its card.
vi.mock("next-intl", () => ({ useLocale: () => "de" }));
const nav = vi.hoisted(() => ({ visible: true, webinars: false }));
vi.mock("@/lib/xenaxio/meet-nav", () => ({ useMeetNavItem: () => ({ visible: nav.visible, label: "Meetings", webinars: nav.webinars }) }));
const api = vi.hoisted(() => ({ create: vi.fn(), updateWebinar: vi.fn() }));
vi.mock("@/lib/xenaxio/meet", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/meet")>()), meet: api }));

import { XenaxioApiError } from "@/lib/xenaxio/api";
import { meetingCodeOfLink } from "@/lib/xenaxio/meet";
import { EventMeetingButton, eventLinkName, followWebinar, MeetingJoinButton } from "../meet/event-meeting";

afterEach(() => {
  vi.useRealTimers();
  api.create.mockReset();
  api.updateWebinar.mockReset();
  nav.visible = true;
  nav.webinars = false;
});

describe("step 78: meetings in the calendar", () => {
  it("knows Xenaxio Meeting links", () => {
    expect(meetingCodeOfLink("https://acme.xenaxio.com/meet/abcdefghjk23")).toBe("abcdefghjk23");
    expect(meetingCodeOfLink("https://zoom.us/j/123")).toBeNull();
    expect(meetingCodeOfLink("http://evil.example/meet/abcdefghjk23")).toBeNull();
    expect(meetingCodeOfLink("nonsense")).toBeNull();
    expect(meetingCodeOfLink(null)).toBeNull();
  });

  it("makes a link for the event until its end", async () => {
    api.create.mockResolvedValue({ code: "abcdefghjk23", path: "/meet/abcdefghjk23" });
    const onLink = vi.fn();
    const until = new Date("2027-03-10T10:00:00Z");
    render(<EventMeetingButton title="  " until={until} link="" onLink={onLink} />);
    fireEvent.click(screen.getByRole("button", { name: "Xenaxio Meeting erstellen" }));
    await waitFor(() => expect(onLink).toHaveBeenCalledWith(`${location.origin}/meet/abcdefghjk23`));
    expect(api.create).toHaveBeenCalledWith("Besprechung", until);
  });

  it("is hidden when meetings are off or the event has one; says why it failed", async () => {
    nav.visible = false;
    const { container, rerender } = render(<EventMeetingButton title="x" until={null} link="" onLink={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    nav.visible = true;
    rerender(<EventMeetingButton title="x" until={null} link="https://acme.xenaxio.com/meet/abcdefghjk23" onLink={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    api.create.mockRejectedValue(new XenaxioApiError(409, "meetings_off"));
    rerender(<EventMeetingButton title="x" until={null} link="https://zoom.us/j/1" onLink={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Xenaxio Meeting erstellen" }));
    expect(await screen.findByText("Meetings sind für Ihr Unternehmen ausgeschaltet.")).toBeInTheDocument();
  });

  it("shows Join from 10 minutes before the start until the end", () => {
    vi.useFakeTimers();
    const uri = "https://acme.xenaxio.com/meet/abcdefghjk23";
    const start = new Date("2027-03-10T09:00:00Z");
    const end = new Date("2027-03-10T09:30:00Z");
    vi.setSystemTime(new Date("2027-03-10T08:40:00Z"));
    const { rerender } = render(<MeetingJoinButton uri={uri} start={start} end={end} />);
    expect(screen.queryByRole("link", { name: "Beitreten" })).toBeNull();
    act(() => {
      vi.setSystemTime(new Date("2027-03-10T08:51:00Z"));
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByRole("link", { name: "Beitreten" })).toHaveAttribute("href", uri);
    rerender(<MeetingJoinButton uri="https://zoom.us/j/1" start={start} end={end} />);
    expect(screen.queryByRole("link", { name: "Beitreten" })).toBeNull();
  });
});

describe("step 79, part D: a webinar from a calendar event", () => {
  const start = new Date("2027-03-10T14:00:00");
  const until = new Date("2027-03-10T15:30:00");

  it("offers a webinar where they are allowed, for events with a time", () => {
    const { rerender } = render(<EventMeetingButton title="x" until={until} start={start} link="" onLink={() => {}} />);
    expect(screen.queryByRole("button", { name: "Webinar erstellen" })).toBeNull();
    nav.webinars = true;
    rerender(<EventMeetingButton title="x" until={until} start={start} link="" onLink={() => {}} />);
    expect(screen.getByRole("button", { name: "Webinar erstellen" })).toBeInTheDocument();
    // An all-day event cannot be a webinar.
    rerender(<EventMeetingButton title="x" until={until} start={null} link="" onLink={() => {}} />);
    expect(screen.queryByRole("button", { name: "Webinar erstellen" })).toBeNull();
  });

  it("makes the webinar at the event's time and names its link; saving the event moves the webinar", async () => {
    nav.webinars = true;
    api.create.mockResolvedValue({ code: "webinarcode23", path: "/meet/webinarcode23" });
    api.updateWebinar.mockResolvedValue({});
    const onLink = vi.fn();
    render(<EventMeetingButton title="Produktvorstellung" until={until} start={start} description=" Neu im Frühjahr " link="" onLink={onLink} />);
    fireEvent.click(screen.getByRole("button", { name: "Webinar erstellen" }));
    const url = `${location.origin}/meet/webinarcode23`;
    await waitFor(() => expect(onLink).toHaveBeenCalledWith(url));
    expect(api.create).toHaveBeenCalledWith("Produktvorstellung", undefined, "webinar", { startsAt: start, durationMinutes: 90, description: "Neu im Frühjahr", registration: true });
    expect(eventLinkName(url, null)).toBe("Xenaxio Webinar");

    const later = new Date("2027-03-11T10:00:00");
    await followWebinar(url, "Xenaxio Webinar", { title: "Frühjahr", start: later, end: new Date("2027-03-11T11:00:00") });
    expect(api.updateWebinar).toHaveBeenCalledWith("webinarcode23", { title: "Frühjahr", startsAt: later, durationMinutes: 60 });
  });

  it("keeps the name a link had, and leaves meetings and other links alone", async () => {
    const meeting = "https://acme.xenaxio.com/meet/abcdefghjk23";
    expect(eventLinkName(meeting, { virtualLocations: { xm: { uri: meeting, name: "Xenaxio Meeting" } } })).toBe("Xenaxio Meeting");
    expect(eventLinkName("https://zoom.us/j/1", { virtualLocations: { xm: { uri: meeting, name: "Xenaxio Meeting" } } })).toBeNull();
    await followWebinar(meeting, "Xenaxio Meeting", { title: "x", start, end: until });
    await followWebinar("https://zoom.us/j/1", "Xenaxio Webinar", { title: "x", start, end: until });
    expect(api.updateWebinar).not.toHaveBeenCalled();
    // Not the host: the platform says no, the event is saved anyway.
    api.updateWebinar.mockRejectedValue(new XenaxioApiError(403, "not_host"));
    await expect(followWebinar("https://acme.xenaxio.com/meet/webinarcode99", "Xenaxio Webinar", { title: "x", start, end: until })).resolves.toBeUndefined();
  });
});
