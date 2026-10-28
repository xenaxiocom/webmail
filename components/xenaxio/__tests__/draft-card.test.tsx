import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProposalSummary } from "@/lib/xenaxio/assistant";
import { DraftDeleteCard, type DraftProposal } from "../draft-card";

vi.mock("next-intl", () => ({ useLocale: () => "de" }));

const proposal = (summary: ProposalSummary, state = "pending"): DraftProposal => ({ id: "p1", tool: "delete_draft", summary, state });

describe("DraftDeleteCard (step 69)", () => {
  it("shows the draft and asks before deleting it", () => {
    const decide = vi.fn();
    render(<DraftDeleteCard proposal={proposal({ draftId: "d1", subject: "AW: Angebot", to: ["max@kunde.de"], preview: "Hallo Max", attachments: ["Angebot.pdf"] })} onDecide={decide} />);
    expect(screen.getByText("Entwurf löschen")).toBeTruthy();
    expect(screen.getByText("AW: Angebot")).toBeTruthy();
    expect(screen.getByText("max@kunde.de")).toBeTruthy();
    expect(screen.getByText("Angebot.pdf")).toBeTruthy();
    expect(screen.getByText("Hallo Max")).toBeTruthy();
    expect(screen.getByText(/endgültig gelöscht/)).toBeTruthy();
    fireEvent.click(screen.getByText("Löschen"));
    expect(decide).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }), true);
    fireEvent.click(screen.getByText("Verwerfen"));
    expect(decide).toHaveBeenLastCalledWith(expect.objectContaining({ id: "p1" }), false);
  });

  it("says when it is done, without buttons", () => {
    render(<DraftDeleteCard proposal={proposal({ draftId: "d1", subject: "" }, "done")} onDecide={() => {}} />);
    expect(screen.getByText("(ohne Betreff)").className).toContain("line-through");
    expect(screen.getByText("Entwurf gelöscht.")).toBeTruthy();
    expect(screen.queryByText("Löschen")).toBeNull();
  });
});
