import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Step 78, part C: a Xenaxio Meeting for a calendar event, and "Join" in its card.
vi.mock("next-intl", () => ({ useLocale: () => "de" }));
const nav = vi.hoisted(() => ({ visible: true }));
vi.mock("@/lib/xenaxio/meet-nav", () => ({ useMeetNavItem: () => ({ visible: nav.visible, label: "Meetings" }) }));
const api = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/xenaxio/meet", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/meet")>()), meet: api }));

import { XenaxioApiError } from "@/lib/xenaxio/api";
import { meetingCodeOfLink } from "@/lib/xenaxio/meet";
import { EventMeetingButton, MeetingJoinButton } from "../meet/event-meeting";

afterEach(() => {
  vi.useRealTimers();
  api.create.mockReset();
  nav.visible = true;
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
