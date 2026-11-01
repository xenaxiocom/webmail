import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ShareCollectionDialog } from "@/components/settings/share-collection-dialog";
import type { IJMAPClient } from "@/lib/jmap/client-interface";

// Xenaxio step 116: "Copy link" next to Close in the Share dialog of Files.

function renderDialog(onCopyLink?: () => void) {
  const client = { getPrincipals: vi.fn(async () => []) } as unknown as IJMAPClient;
  render(
    <ShareCollectionDialog
      client={client}
      kind="file"
      collectionName="1-11-2026_meet_summary.txt"
      shareWith={null}
      ownAccountId="a"
      onShare={vi.fn(async () => {})}
      onClose={vi.fn()}
      onCopyLink={onCopyLink}
    />,
  );
}

describe("Share dialog: copy link (step 116)", () => {
  it("copies the link when Files passes one", () => {
    const onCopyLink = vi.fn();
    renderDialog(onCopyLink);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(onCopyLink).toHaveBeenCalledOnce();
  });

  it("shows no such button for calendars and address books", () => {
    renderDialog();
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
  });
});
