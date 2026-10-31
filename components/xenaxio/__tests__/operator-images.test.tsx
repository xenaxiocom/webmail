import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Step 108, part C: the pictures people upload, in the operator console.
const api = vi.hoisted(() => ({
  images: vi.fn(),
  reviewImages: vi.fn(),
  removeImage: vi.fn(),
  hiddenImages: vi.fn(),
  restoreImage: vi.fn(),
  purgeImage: vi.fn(),
  blockPerson: vi.fn(),
  setTenantBlocked: vi.fn(),
  chatImages: vi.fn(),
  imageCheckSettings: vi.fn(),
  setImageCheckThreshold: vi.fn(),
  dismissChatImage: vi.fn(),
  removeChatImage: vi.fn(),
  blockFromChatImage: vi.fn(),
}));
vi.mock("next-intl", () => ({ useLocale: () => "de" }));
vi.mock("@/lib/xenaxio/api", async (orig) => {
  const real = await orig<typeof import("@/lib/xenaxio/api")>();
  return { ...real, xenaxio: { ...real.xenaxio, operator: api } };
});

const { OperatorImages } = await import("../operator-images");

const avatar = {
  kind: "avatar",
  ref: "a1",
  tenantId: "t1",
  company: "Acme GmbH",
  slug: "acme",
  product: "workspace",
  plan: null,
  owner: { userId: "u1", email: "anna@acme.de", name: "Anna", kind: "person" },
  contentType: "image/png",
  animated: false,
  version: "2026-10-31T10:00:00.000Z",
  reviewed: false,
};
const logo = { ...avatar, kind: "logo", ref: "t1", owner: { userId: null, email: null, name: null, kind: "company" } };

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.images.mockResolvedValue({ images: [avatar, logo], total: 2, newCount: 2, page: 1, pageSize: 48 });
  api.reviewImages.mockResolvedValue({ ok: true });
  api.removeImage.mockResolvedValue({ ok: true });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.spyOn(window, "prompt").mockReturnValue("Anstößig");
});

describe("step 108, part C: pictures", () => {
  it("shows the new pictures with their company and owner; checks, hides and blocks from a picture", async () => {
    render(<OperatorImages />);
    expect(await screen.findByText("Neu (2)")).toBeInTheDocument();
    const card = screen.getByAltText("Profilbild — Acme GmbH").closest("div.flex-col") as HTMLElement;
    expect(screen.getByAltText("Profilbild — Acme GmbH")).toHaveAttribute("src", "/api/operator/images/avatar/content?ref=a1");
    expect(within(card).getByText(/anna@acme\.de/)).toBeInTheDocument();
    // A logo has no person to block.
    const logoCard = screen.getByAltText("Firmenlogo — Acme GmbH").closest("div.flex-col") as HTMLElement;
    expect(within(logoCard).queryByRole("button", { name: "Person sperren" })).toBeNull();

    fireEvent.click(within(card).getByRole("button", { name: "Geprüft" }));
    await waitFor(() => expect(api.reviewImages).toHaveBeenCalledWith([{ kind: "avatar", ref: "a1", version: "2026-10-31T10:00:00.000Z" }]));
    fireEvent.click(within(card).getByRole("button", { name: "Ausblenden" }));
    await waitFor(() => expect(api.removeImage).toHaveBeenCalledWith("avatar", "a1", "Anstößig", "hide"));
    api.blockPerson.mockResolvedValue({ blocked: 1 });
    fireEvent.click(within(card).getByRole("button", { name: "Person sperren" }));
    await waitFor(() => expect(api.blockPerson).toHaveBeenCalledWith({ email: "anna@acme.de", reason: "Anstößig", blockSignup: true, blockDomain: false, notify: true }));
    api.setTenantBlocked.mockResolvedValue({ id: "t1", status: "blocked" });
    fireEvent.click(within(logoCard).getByRole("button", { name: "Firma sperren" }));
    await waitFor(() => expect(api.setTenantBlocked).toHaveBeenCalledWith("t1", true));
  });

  it("marks a whole page as checked; without a reason nothing is removed", async () => {
    render(<OperatorImages />);
    fireEvent.click(await screen.findByRole("button", { name: "Alle auf dieser Seite geprüft" }));
    await waitFor(() => expect(api.reviewImages).toHaveBeenCalledWith([
      { kind: "avatar", ref: "a1", version: avatar.version },
      { kind: "logo", ref: "t1", version: avatar.version },
    ]));
    vi.spyOn(window, "prompt").mockReturnValue("");
    fireEvent.click(screen.getAllByRole("button", { name: "Löschen" })[0]!);
    expect(api.removeImage).not.toHaveBeenCalled();
  });

  it("lists hidden pictures and puts one back", async () => {
    api.hiddenImages.mockResolvedValue([
      { id: "q1", kind: "avatar", ref: "a1", tenantId: "t1", company: "Acme GmbH", ownerEmail: "anna@acme.de", contentType: "image/png", reason: "Anstößig", hiddenAt: "2026-10-31T10:00:00Z", hiddenBy: "op@xenaxio.test", deletesAt: "2026-11-30T10:00:00Z" },
    ]);
    api.restoreImage.mockResolvedValue([]);
    render(<OperatorImages />);
    fireEvent.click(await screen.findByRole("tab", { name: "Ausgeblendet" }));
    expect(await screen.findByText("— Anstößig")).toBeInTheDocument();
    expect(screen.getByAltText("Profilbild — Acme GmbH")).toHaveAttribute("src", "/api/operator/images/hidden/q1/content");
    fireEvent.click(screen.getByRole("button", { name: "Wiederherstellen" }));
    await waitFor(() => expect(api.restoreImage).toHaveBeenCalledWith("q1"));
    expect(await screen.findByText("Keine ausgeblendeten Bilder.")).toBeInTheDocument();
  });

  it("step 108, part C3: flagged chat pictures — only a preview, the company and the time; remove, block, threshold", async () => {
    const flag = { id: "f1", tenantId: "t1", company: "Spam Club", plan: "free", product: "rooms", score: 0.97, createdAt: "2026-10-31T10:00:00Z", removable: true };
    api.chatImages.mockResolvedValue({ flags: [flag], available: true });
    api.imageCheckSettings.mockResolvedValue({ available: true, threshold: 0.85 });
    api.removeChatImage.mockResolvedValue([]);
    api.setImageCheckThreshold.mockResolvedValue({ available: true, threshold: 0.9 });
    render(<OperatorImages />);
    fireEvent.click(await screen.findByRole("tab", { name: "Chat (Verdacht)" }));
    expect(await screen.findByText("Verdacht 97 %")).toBeInTheDocument();
    expect(screen.getByAltText("Auffälliges Bild — Spam Club")).toHaveAttribute("src", "/api/operator/chat-images/f1/preview");
    fireEvent.change(screen.getByLabelText("Ab welcher Sicherheit des Modells:"), { target: { value: "0.9" } });
    await waitFor(() => expect(api.setImageCheckThreshold).toHaveBeenCalledWith(0.9));
    fireEvent.click(screen.getByRole("button", { name: "Bild entfernen" }));
    await waitFor(() => expect(api.removeChatImage).toHaveBeenCalledWith("f1", "Anstößig"));
    expect(await screen.findByText("Keine auffälligen Bilder.")).toBeInTheDocument();
  });
});
