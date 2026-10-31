import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ProposalSummary } from "@/lib/xenaxio/assistant";

vi.mock("next-intl", () => ({ useLocale: () => "de" }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => <a href={href} className={className}>{children}</a>,
}));

const { isSettingProposal, SettingCard } = await import("../setting-card");

const proposal = (tool: string, summary: object, state = "pending") => ({ id: "p1", tool, summary: summary as ProposalSummary, state });

describe("SettingCard (step 85)", () => {
  it("tells setting proposals from others", () => {
    expect(isSettingProposal({ setting: "signature" } as unknown as ProposalSummary)).toBe(true);
    expect(isSettingProposal({ title: "Termin" })).toBe(false);
  });

  it("shows the new signature and the old one, and confirms", () => {
    const decide = vi.fn();
    render(<SettingCard proposal={proposal("set_signature", { setting: "signature", email: "anna@acme.de", text: "Beste Grüße\nAnna", before: { text: "Gruß" } })} locale="de" onDecide={decide} />);
    expect(screen.getByText("Signatur ändern")).toBeTruthy();
    expect(screen.getByText("Für anna@acme.de")).toBeTruthy();
    expect(screen.getByText(/Beste Grüße/)).toBeTruthy();
    expect(screen.getByText("Gruß")).toBeTruthy();
    expect(screen.getByText("In den Einstellungen ansehen").getAttribute("href")).toBe("/settings/account");
    fireEvent.click(screen.getByText("Bestätigen"));
    expect(decide).toHaveBeenCalledWith(true);
  });

  it("shows the out-of-office period, subject and text; done after confirming", () => {
    const summary = { setting: "out_of_office", enabled: true, from: "2026-11-02T00:00", until: "2026-11-06T23:59", subject: "Urlaub", text: "Bin weg.", before: { enabled: false, text: "Bin weg." } };
    const { rerender } = render(<SettingCard proposal={proposal("set_out_of_office", summary)} locale="de" onDecide={() => {}} />);
    expect(screen.getByText("Abwesenheitsnotiz einschalten")).toBeTruthy();
    expect(screen.getByText("Mo., 02.11.2026, 00:00 – Fr., 06.11.2026, 23:59")).toBeTruthy();
    expect(screen.getByText("Urlaub")).toBeTruthy();
    expect(screen.getByText("In den Einstellungen ansehen").getAttribute("href")).toBe("/settings/vacation");
    rerender(<SettingCard proposal={proposal("set_out_of_office", summary, "done")} locale="de" onDecide={() => {}} />);
    expect(screen.getByText("Abwesenheitsnotiz eingeschaltet.")).toBeTruthy();
    expect(screen.queryByText("Bestätigen")).toBeNull();
  });

  it("switching off needs no details", () => {
    render(<SettingCard proposal={proposal("set_out_of_office", { setting: "out_of_office", enabled: false, before: { enabled: true } })} locale="de" onDecide={() => {}} />);
    expect(screen.getByText("Abwesenheitsnotiz ausschalten")).toBeTruthy();
    expect(screen.queryByText("Zeitraum")).toBeNull();
  });
});
