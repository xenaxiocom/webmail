import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Step 89: the admin's company background for meetings — upload (made smaller
// in the browser first), remove, and "employees start with it".
const api = vi.hoisted(() => ({ settings: vi.fn(), saveSettings: vi.fn(), uploadBackground: vi.fn(), removeBackground: vi.fn() }));
const shrunk = vi.hoisted(() => new Blob(["jpeg"], { type: "image/jpeg" }));
const shrinkPicture = vi.hoisted(() => vi.fn(async () => shrunk));

vi.mock("next-intl", () => ({ useLocale: () => "de" }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/components/xenaxio/workspace-shell", () => ({ WorkspaceShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/xenaxio/meet-nav", () => ({ setMeetNavEnabled: vi.fn() }));
vi.mock("@/lib/xenaxio/meet", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/meet")>()), meet: api }));
vi.mock("@/lib/xenaxio/meet-background", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/meet-background")>()), shrinkPicture }));

const { default: MeetingsAdminPage } = await import("../page");

const base = { available: true, allowed: true, enabled: true, guests: true, maxParticipants: 25, maxHours: 8, background: null };
const picture = { url: "/api/meet/background?v=1", default: false };

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  shrinkPicture.mockClear();
});

describe("step 89: company background on the meetings page", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Bild entfernen" }));
    await waitFor(() => expect(api.removeBackground).toHaveBeenCalled());
    expect(await screen.findByText(/Noch kein Bild/)).toBeInTheDocument();
  });

  it("names the platform's refusal", async () => {
    api.settings.mockResolvedValue(base);
    const { XenaxioApiError } = await import("@/lib/xenaxio/api");
    api.uploadBackground.mockRejectedValue(new XenaxioApiError(413, "meet_background_too_large"));
    const { container } = render(<MeetingsAdminPage />);
    await screen.findByText("Hintergrund der Firma");
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["x"], "a.png", { type: "image/png" })] } });
    expect(await screen.findByText("Das Bild ist zu groß (höchstens 2 MB).")).toBeInTheDocument();
  });
});
