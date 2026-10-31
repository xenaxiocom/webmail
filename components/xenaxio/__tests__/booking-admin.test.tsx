import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useLocale: () => "de" }));

const api = vi.hoisted(() => ({ admin: vi.fn(), setAdmin: vi.fn() }));
vi.mock("@/lib/xenaxio/booking", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/booking")>()), booking: api }));

import { XenaxioApiError } from "@/lib/xenaxio/api";
import { BookingAdmin } from "../booking-admin";

const state = { enabled: true, imprintUrl: null, privacyUrl: "https://acme.de/datenschutz", theme: "auto" as const, salesforceOrgId: null, leadSource: null };

describe("step 77: Salesforce in the company's booking settings", () => {
  beforeEach(() => {
    api.admin.mockReset();
    api.setAdmin.mockReset();
  });

  it("saves the Org ID and the Lead Source", async () => {
    api.admin.mockResolvedValue(state);
    api.setAdmin.mockResolvedValue({ ...state, salesforceOrgId: "00D5g000004ABCDEAA", leadSource: "Online-Buchung" });
    render(<BookingAdmin />);
    const org = (await screen.findByLabelText("Salesforce Org-ID")) as HTMLInputElement;
    expect(org.placeholder).toBe("00D…");
    expect((screen.getByLabelText("Lead Source") as HTMLInputElement).placeholder).toBe("Online-Buchung");
    expect(screen.getByText(/gehen als Lead an Salesforce \(Web-to-Lead\)/)).toBeTruthy();
    fireEvent.change(org, { target: { value: " 00D5g000004ABCDEAA " } });
    fireEvent.change(screen.getByLabelText("Lead Source"), { target: { value: "Online-Buchung" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(api.setAdmin).toHaveBeenCalledWith({ salesforceOrgId: "00D5g000004ABCDEAA", leadSource: "Online-Buchung" }));
    expect(await screen.findByText("Gespeichert.")).toBeTruthy();
    expect((screen.getByLabelText("Salesforce Org-ID") as HTMLInputElement).value).toBe("00D5g000004ABCDEAA");
  });

  it("empty fields switch it off; a wrong Org ID is explained", async () => {
    api.admin.mockResolvedValue({ ...state, salesforceOrgId: "00D5g000004ABCD", leadSource: "Web" });
    api.setAdmin.mockRejectedValueOnce(new XenaxioApiError(400, "validation", undefined, [{ path: "salesforceOrgId", message: "salesforce_org_invalid" }]));
    api.setAdmin.mockResolvedValueOnce(state);
    render(<BookingAdmin />);
    const org = (await screen.findByLabelText("Salesforce Org-ID")) as HTMLInputElement;
    expect(org.value).toBe("00D5g000004ABCD");
    fireEvent.change(org, { target: { value: "12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText("Die Org-ID beginnt mit 00D und hat 15 oder 18 Zeichen.")).toBeTruthy();
    fireEvent.change(org, { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Lead Source"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(api.setAdmin).toHaveBeenLastCalledWith({ salesforceOrgId: null, leadSource: null }));
  });
});
