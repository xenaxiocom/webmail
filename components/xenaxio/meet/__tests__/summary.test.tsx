import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeetingInfo } from "@/lib/xenaxio/meet";

const meet = vi.hoisted(() => ({ info: vi.fn() }));
// The room brings LiveKit and its styles; the summary does not need it.
vi.mock("../room", () => ({ MeetingRoom: () => null }));
vi.mock("@/lib/xenaxio/meet", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/meet")>()), meet }));

const { MeetLangProvider } = await import("../lang");
const { Summary } = await import("../meeting-page");

const info = (over: Partial<MeetingInfo> = {}): MeetingInfo => ({
  title: "SuperRonin – Anruf",
  company: "SuperRonin",
  state: "open",
  guests: true,
  member: true,
  running: false,
  participants: 0,
  peakParticipants: 3,
  startedAt: "2026-10-30T14:42:00Z",
  finishedAt: "2026-10-30T15:05:00Z",
  ...over,
});

const show = (i: MeetingInfo, leftAt?: number) =>
  render(
    <MeetLangProvider>
      <Summary code="abcdefghij" info={i} leftAt={leftAt} />
    </MeetLangProvider>,
  );

describe("Summary after a meeting", () => {
  beforeEach(() => {
    localStorage.setItem("locale-storage", JSON.stringify({ state: { locale: "en" } }));
    meet.info.mockReset();
  });

  it("shows title, when, how long and how many people", async () => {
    meet.info.mockResolvedValue(info());
    show(info({ finishedAt: null, peakParticipants: 1 }));
    expect(await screen.findByText(/· 23 min$/)).toBeTruthy();
    expect(screen.getByText("SuperRonin – Anruf")).toBeTruthy();
    expect(screen.getByText("Up to 3 people")).toBeTruthy();
  });

  it("counts until the person left when the server has no end yet", async () => {
    const i = info({ finishedAt: null });
    meet.info.mockResolvedValue(i);
    show(i, Date.parse("2026-10-30T14:52:00Z"));
    expect(await screen.findByText(/· 10 min$/)).toBeTruthy();
  });

  it("says when nobody else came", async () => {
    meet.info.mockResolvedValue(info({ peakParticipants: 1 }));
    show(info({ peakParticipants: 1 }));
    expect(await screen.findByText("Nobody else joined")).toBeTruthy();
  });

  it("still running: no end, how many are in it", async () => {
    const i = info({ running: true, participants: 2, finishedAt: null });
    meet.info.mockResolvedValue(i);
    show(i, Date.now());
    expect(await screen.findByText("Still running · 2 in the meeting")).toBeTruthy();
    expect(screen.queryByText(/min$/)).toBeNull();
  });

  it("guests see no number of people", async () => {
    const i = info({ member: false });
    meet.info.mockResolvedValue(i);
    show(i);
    expect(await screen.findByText(/· 23 min$/)).toBeTruthy();
    expect(screen.queryByText(/people/)).toBeNull();
  });
});
