import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeetingInfo } from "@/lib/xenaxio/meet";

const meet = vi.hoisted(() => ({ info: vi.fn(), recording: vi.fn(), transcript: vi.fn(), retryTranscript: vi.fn() }));
// The room brings LiveKit and its styles; the summary does not need it.
vi.mock("../room", () => ({ MeetingRoom: () => null }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/lib/xenaxio/meet", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/meet")>()), meet }));

const { MeetLangProvider } = await import("../lang");
const { RecordingResult, Summary } = await import("../meeting-page");

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

describe("Step 90: the recording after a meeting", () => {
  beforeEach(() => {
    localStorage.setItem("locale-storage", JSON.stringify({ state: { locale: "en" } }));
    meet.recording.mockReset();
  });
  const recording = (over: object = {}) => ({ id: "r1", status: "stored", startedAt: "2026-10-30T13:42:00Z", stoppedAt: "2026-10-30T14:05:00Z", folder: "Meetings/2026-10-30 14-42 Kick-off", speakers: ["Anna"], error: null, ...over });
  const show = () =>
    render(
      <MeetLangProvider>
        <RecordingResult code="abcdefghij" />
      </MeetLangProvider>,
    );

  it("the organizer opens the folder in Files", async () => {
    meet.recording.mockResolvedValue({ recording: false, since: null, available: true, canControl: true, recordings: [recording()] });
    show();
    expect(await screen.findByText("Saved in Files: Meetings/2026-10-30 14-42 Kick-off")).toBeTruthy();
    expect(screen.getByText("Open in Files").getAttribute("href")).toBe("/files/Meetings/2026-10-30%2014-42%20Kick-off");
  });

  it("others in the meeting learn where it is; a failed one says so; while it is saved it says that", async () => {
    meet.recording.mockResolvedValue({ recording: false, since: null, available: true, canControl: false, recordings: [recording()] });
    const a = show();
    expect(await screen.findByText("Saved in the Files of the person who started the meeting.")).toBeTruthy();
    expect(screen.queryByText("Open in Files")).toBeNull();
    a.unmount();
    meet.recording.mockResolvedValue({ recording: false, since: null, available: true, canControl: true, recordings: [recording({ status: "failed", folder: null })] });
    const b = show();
    expect(await screen.findByText("The recording could not be saved.")).toBeTruthy();
    b.unmount();
    meet.recording.mockResolvedValue({ recording: false, since: null, available: true, canControl: true, recordings: [recording({ status: "processing", folder: null })] });
    show();
    expect(await screen.findByText("The recording is being saved …")).toBeTruthy();
  });

  it("nothing without a recording, or for guests", async () => {
    meet.recording.mockResolvedValue({ recording: false, since: null, available: true, canControl: true, recordings: [] });
    const a = show();
    await new Promise((r) => setTimeout(r, 20));
    expect(a.container.textContent).toBe("");
    a.unmount();
    meet.recording.mockRejectedValue(new Error("unauthorized"));
    const b = show();
    await new Promise((r) => setTimeout(r, 20));
    expect(b.container.textContent).toBe("");
  });
});

describe("Step 90, part B: the transcript after a meeting", () => {
  beforeEach(() => {
    localStorage.setItem("locale-storage", JSON.stringify({ state: { locale: "en" } }));
    for (const fn of Object.values(meet)) fn.mockReset();
  });
  const stored = (transcript: object) => ({ id: "r1", status: "stored", startedAt: "2026-10-30T13:42:00Z", stoppedAt: "2026-10-30T14:05:00Z", folder: "Meetings/x", speakers: ["Anna"], error: null, transcript });
  const show = () =>
    render(
      <MeetLangProvider>
        <RecordingResult code="abcdefghij" />
      </MeetLangProvider>,
    );

  it("shows the transcript by speaker on request", async () => {
    meet.recording.mockResolvedValue({ recording: false, since: null, available: true, canControl: false, recordings: [stored({ status: "done", error: null })] });
    meet.transcript.mockResolvedValue({
      recordingId: "r1",
      meeting: "Kick-off",
      startedAt: "2026-10-30T13:42:00Z",
      stoppedAt: null,
      timeZone: "Europe/Berlin",
      language: "de",
      lines: [
        { at: "2026-10-30T13:42:05Z", speaker: "Anna Schmidt", text: "Guten Morgen." },
        { at: "2026-10-30T13:42:11Z", speaker: "Ben Braun", text: "Zehn Prozent Rabatt." },
      ],
    });
    show();
    fireEvent.click(await screen.findByText("Show the transcript"));
    expect(await screen.findByText("Guten Morgen.", { exact: false })).toBeTruthy();
    expect(screen.getByText("14:42:05")).toBeTruthy();
    expect(screen.getByText("Ben Braun:")).toBeTruthy();
    expect(meet.transcript).toHaveBeenCalledWith("r1");
  });

  it("says why there is none, and the organizer asks again", async () => {
    meet.recording.mockResolvedValue({ recording: false, since: null, available: true, canControl: true, recordings: [stored({ status: "off", error: "ai_disabled" })] });
    meet.retryTranscript.mockResolvedValue({ ok: true });
    show();
    expect(await screen.findByText("There is no transcript: the AI is off for the person who started the meeting.")).toBeTruthy();
    meet.recording.mockResolvedValue({ recording: false, since: null, available: true, canControl: true, recordings: [stored({ status: "pending", error: null })] });
    fireEvent.click(screen.getByText("Make the transcript again"));
    expect(await screen.findByText("The transcript is being made …")).toBeTruthy();
    expect(meet.retryTranscript).toHaveBeenCalledWith("r1");
  });

  it("others in the meeting cannot ask again", async () => {
    meet.recording.mockResolvedValue({ recording: false, since: null, available: true, canControl: false, recordings: [stored({ status: "failed", error: "x" })] });
    show();
    expect(await screen.findByText("The transcript could not be made.")).toBeTruthy();
    expect(screen.queryByText("Make the transcript again")).toBeNull();
  });
});
