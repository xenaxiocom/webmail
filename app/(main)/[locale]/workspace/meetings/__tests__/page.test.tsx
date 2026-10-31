import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Step 92: the admin's company background for meetings — upload (made smaller
// in the browser first), remove, and "employees start with it".
const api = vi.hoisted(() => ({ settings: vi.fn(), saveSettings: vi.fn(), uploadBackground: vi.fn(), removeBackground: vi.fn(), recordings: vi.fn(async (): Promise<unknown[]> => []), deleteRecording: vi.fn() }));
const shrunk = vi.hoisted(() => new Blob(["jpeg"], { type: "image/jpeg" }));
const shrinkPicture = vi.hoisted(() => vi.fn(async () => shrunk));
const pictureSize = vi.hoisted(() => vi.fn(async () => ({ width: 4000, height: 3000 })));

vi.mock("next-intl", () => ({ useLocale: () => "de" }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
const product = vi.hoisted(() => ({ current: "workspace" as "workspace" | "rooms" }));
vi.mock("@/components/xenaxio/workspace-shell", () => ({
  WorkspaceShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useMe: () => ({ user: { id: "u1", role: "admin" }, tenant: { id: "t1", product: product.current } }),
}));
vi.mock("@/lib/xenaxio/meet-nav", () => ({ setMeetNavEnabled: vi.fn() }));
vi.mock("@/lib/xenaxio/meet", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/meet")>()), meet: api }));
vi.mock("@/lib/xenaxio/meet-background", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/meet-background")>()), shrinkPicture, pictureSize }));

const { default: MeetingsAdminPage } = await import("../page");

const base = { available: true, allowed: true, enabled: true, guests: true, maxParticipants: 25, maxHours: 8, background: null };
const picture = { url: "/api/meet/background?v=1", default: false };

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.recordings.mockResolvedValue([]);
  shrinkPicture.mockClear();
  pictureSize.mockClear();
  product.current = "workspace";
});

describe("step 92: company background on the meetings page", () => {
  it("uploads a picture made smaller in the browser", async () => {
    api.settings.mockResolvedValue(base);
    api.uploadBackground.mockResolvedValue({ ...base, background: picture });
    const { container } = render(<MeetingsAdminPage />);
    expect(await screen.findByText("Hintergrund der Firma")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /starten mit diesem Hintergrund/ })).toBeNull();
    const photo = new File(["x".repeat(100)], "foto.heic", { type: "image/heic" });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [photo] } });
    await waitFor(() => expect(api.uploadBackground).toHaveBeenCalledWith(shrunk));
    expect(shrinkPicture).toHaveBeenCalledWith(photo, 1920);
    expect(await screen.findByRole("img", { name: "Hintergrund der Firma" })).toHaveAttribute("src", "/api/meet/background?v=1");
  });

  it("makes it what employees start with, and removes it", async () => {
    api.settings.mockResolvedValue({ ...base, background: picture });
    api.saveSettings.mockResolvedValue({ ...base, background: { ...picture, default: true } });
    api.removeBackground.mockResolvedValue(base);
    render(<MeetingsAdminPage />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /starten mit diesem Hintergrund/ }));
    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ backgroundDefault: true }));
    expect(await screen.findByRole("checkbox", { name: /starten mit diesem Hintergrund/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Hintergrund entfernen" }));
    await waitFor(() => expect(api.removeBackground).toHaveBeenCalled());
    expect(await screen.findByText(/Noch kein Hintergrund/)).toBeInTheDocument();
  });

  it("step 93: a video goes up as it is, a panorama as a bigger JPEG", async () => {
    api.settings.mockResolvedValue(base);
    api.uploadBackground.mockResolvedValue({ ...base, background: { url: "/api/meet/background?v=3", default: false, kind: "animation", contentType: "video/mp4" } });
    const { container } = render(<MeetingsAdminPage />);
    await screen.findByText("Hintergrund der Firma");
    const input = container.querySelector('input[type="file"]')!;
    expect(input).toHaveAttribute("accept", "image/*,video/mp4,video/webm");
    const clip = new File(["mp4"], "logo.mp4", { type: "video/mp4" });
    fireEvent.change(input, { target: { files: [clip] } });
    await waitFor(() => expect(api.uploadBackground).toHaveBeenCalledWith(clip));
    expect(shrinkPicture).not.toHaveBeenCalled();
    expect(await screen.findByText("Animation")).toBeInTheDocument();
    expect(container.querySelector("video")).toHaveAttribute("src", "/api/meet/background?v=3");

    pictureSize.mockResolvedValueOnce({ width: 8192, height: 4096 });
    const pano = new File(["x"], "buero-360.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [pano] } });
    await waitFor(() => expect(shrinkPicture).toHaveBeenCalledWith(pano, 6144, 0.85));
    // Too big a video never leaves the browser.
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.webm", { type: "video/webm" });
    api.uploadBackground.mockClear();
    fireEvent.change(input, { target: { files: [big] } });
    expect(await screen.findByText(/Animation oder Panorama 10 MB/)).toBeInTheDocument();
    expect(api.uploadBackground).not.toHaveBeenCalled();
  });

  it("names the platform's refusal", async () => {
    api.settings.mockResolvedValue(base);
    const { XenaxioApiError } = await import("@/lib/xenaxio/api");
    api.uploadBackground.mockRejectedValue(new XenaxioApiError(413, "meet_background_too_large"));
    const { container } = render(<MeetingsAdminPage />);
    await screen.findByText("Hintergrund der Firma");
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["x"], "a.png", { type: "image/png" })] } });
    expect(await screen.findByText("Die Datei ist zu groß (Bild höchstens 2 MB, Animation oder Panorama 10 MB).")).toBeInTheDocument();
  });
});

describe("step 90: recording meetings", () => {
  it("the admin forbids and allows it; without a recorder or when the operator blocked it there is nothing to switch", async () => {
    api.settings.mockResolvedValue({ ...base, recordingAvailable: true, recordingAllowed: true, recording: true });
    api.saveSettings.mockResolvedValue({ ...base, recordingAvailable: true, recordingAllowed: true, recording: false });
    const { unmount } = render(<MeetingsAdminPage />);
    const box = await screen.findByRole("checkbox", { name: /Aufnahme von Besprechungen erlauben/ });
    expect(box).toBeChecked();
    fireEvent.click(box);
    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ recording: false }));
    expect(await screen.findByRole("checkbox", { name: /Aufnahme von Besprechungen erlauben/ })).not.toBeChecked();
    unmount();

    api.settings.mockResolvedValue({ ...base, recordingAvailable: true, recordingAllowed: false, recording: true });
    const blocked = render(<MeetingsAdminPage />);
    expect(await screen.findByRole("checkbox", { name: /Aufnahme von Besprechungen erlauben/ })).toBeDisabled();
    expect(screen.getByText(/Betreiber hat Aufnahmen/)).toBeInTheDocument();
    blocked.unmount();

    api.settings.mockResolvedValue({ ...base, recordingAvailable: false });
    render(<MeetingsAdminPage />);
    expect(await screen.findByText("Hintergrund der Firma")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Aufnahme/ })).toBeNull();
  });
});

describe("step 90, part D: the company's recordings", () => {
  it("lists them and deletes one", async () => {
    api.settings.mockResolvedValue(base);
    api.recordings.mockResolvedValue([
      { id: "r1", meeting: "Kick-off", organizer: "Anna Schmidt", startedAt: "2026-10-30T13:42:00Z", stoppedAt: "2026-10-30T14:05:00Z", status: "stored", transcript: "done", folder: "Meetings/x", bytes: 5 * 1024 * 1024, speakers: ["Anna"] },
    ]);
    api.deleteRecording.mockResolvedValue({ ok: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<MeetingsAdminPage />);
    expect(await screen.findByText("Kick-off")).toBeInTheDocument();
    expect(screen.getByText(/Anna Schmidt · 5 MB · Transkript/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aufnahme von Kick-off löschen" }));
    await waitFor(() => expect(api.deleteRecording).toHaveBeenCalledWith("r1"));
    await waitFor(() => expect(screen.queryByText("Kick-off")).toBeNull());
  });
});

describe("step 109: meetings in XenRooms", () => {
  it("keeps the background for calls and leaves out recording (XenRooms has none)", async () => {
    product.current = "rooms";
    api.settings.mockResolvedValue({ ...base, recordingAvailable: true, recordingAllowed: true, recording: false });
    render(<MeetingsAdminPage />);
    expect(await screen.findByText("Hintergrund der Firma")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Aufnahme von Besprechungen erlauben/ })).toBeNull();
    expect(screen.queryByText("Aufnahmen")).toBeNull();
    expect(api.recordings).not.toHaveBeenCalled();
  });
});
