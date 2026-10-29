import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useLocale: () => "de" }));
vi.mock("@/lib/xenaxio/bff", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/bff")>()), XENAXIO_BFF: true }));

const api = vi.hoisted(() => ({
  settings: vi.fn(),
  bookings: vi.fn(),
  updateProfile: vi.fn(),
  createType: vi.fn(),
  updateType: vi.fn(),
  deleteType: vi.fn(),
  confirm: vi.fn(),
  decline: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("@/lib/xenaxio/booking", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/booking")>()), booking: api }));

import { BookingSettings } from "../booking-settings";

const settings = {
  enabled: true,
  profile: { slug: "eugen", timeZone: "Europe/Berlin", notify: true, url: "https://acme.xenaxio.com/book/eugen" },
  name: "Eugen",
  types: [],
  calendars: [{ id: "default", name: "Kalender", color: null, isDefault: true }],
};

describe("step 56: online booking settings", () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    api.settings.mockResolvedValue(settings);
    api.bookings.mockResolvedValue({ upcoming: [], requests: [] });
  });

  it("creates a meeting type; the link part follows the name", async () => {
    api.createType.mockResolvedValue({ type: {} });
    render(<BookingSettings />);
    expect(await screen.findByText("Online-Terminbuchung")).toBeTruthy();
    expect(screen.getByText(/Noch keine Terminart/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Neue Terminart" }));
    fireEvent.change(screen.getByPlaceholderText("z. B. Erstgespräch"), { target: { value: "Erstgespräch Steuer" } });
    expect((screen.getByDisplayValue("erstgespraech-steuer") as HTMLInputElement).value).toBe("erstgespraech-steuer");
    fireEvent.change(screen.getByPlaceholderText("https://zoom.us/j/…"), { target: { value: "https://zoom.us/j/123" } });
    // Step 77: the company is not asked by default; here it is required.
    const company = screen.getByLabelText("Firma") as HTMLSelectElement;
    expect(company.value).toBe("off");
    fireEvent.change(company, { target: { value: "required" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(api.createType).toHaveBeenCalled());
    expect(api.createType.mock.calls[0]![0]).toMatchObject({
      slug: "erstgespraech-steuer",
      title: "Erstgespräch Steuer",
      durationMinutes: 30,
      locationKind: "video",
      location: "https://zoom.us/j/123",
      hours: { mo: [["09:00", "17:00"]], fr: [["09:00", "17:00"]] },
      askCompany: "required",
      allowRequests: true,
      reminder: true,
    });
  });

  it("shows a request with its conflict and confirms a proposed time", async () => {
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
    api.bookings.mockResolvedValue({
      upcoming: [],
      requests: [
        {
          id: "r1",
          status: "requested",
          title: "Demo",
          start: null,
          end: null,
          proposals: [
            { start: future, end: future, conflict: false },
            { start: future.replace(/T\d\d/, "T15"), end: future, conflict: true },
          ],
          guest: { name: "Max Muster", email: "max@example.com", company: "Muster GmbH", message: "Gern vormittags" },
          timeZone: "Europe/Berlin",
          createdAt: future,
        },
      ],
    });
    api.confirm.mockResolvedValue({ booking: {} });
    render(<BookingSettings />);
    expect(await screen.findByText("Anfragen (1)")).toBeTruthy();
    expect(screen.getByText("Überschneidung")).toBeTruthy();
    expect(screen.getByText("Gern vormittags")).toBeTruthy();
    expect(screen.getByText("Muster GmbH")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Bestätigen" })[0]!);
    await waitFor(() => expect(api.confirm).toHaveBeenCalledWith("r1", 0));
  });

  it("says when the admin switched it off", async () => {
    api.settings.mockResolvedValue({ ...settings, enabled: false });
    render(<BookingSettings />);
    expect(await screen.findByText(/Ihr Administrator hat die Online-Terminbuchung ausgeschaltet/)).toBeTruthy();
  });
});
