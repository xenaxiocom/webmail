import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Step 106, part C3: the admin switches the automatic check of chat pictures on or off.
const api = vi.hoisted(() => ({ imageCheck: vi.fn(), setImageCheck: vi.fn() }));
vi.mock("next-intl", () => ({ useLocale: () => "de" }));
vi.mock("@/lib/xenaxio/api", async (orig) => {
  const real = await orig<typeof import("@/lib/xenaxio/api")>();
  return { ...real, xenaxio: { ...real.xenaxio, ...api } };
});
const { ImageCheckAdmin } = await import("../chat/image-check-admin");

beforeEach(() => {
  api.imageCheck.mockReset();
  api.setImageCheck.mockReset();
});

describe("step 106, part C3: image check for the admin", () => {
  it("switches it on", async () => {
    api.imageCheck.mockResolvedValue({ enabled: false, forced: false, available: true });
    api.setImageCheck.mockResolvedValue({ enabled: true, forced: false, available: true });
    render(<ImageCheckAdmin />);
    const box = await screen.findByLabelText("Bilder automatisch prüfen");
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    await waitFor(() => expect(api.setImageCheck).toHaveBeenCalledWith(true));
    await waitFor(() => expect(box).toBeChecked());
  });

  it("is always on in XenRooms Free", async () => {
    api.imageCheck.mockResolvedValue({ enabled: true, forced: true, available: true });
    render(<ImageCheckAdmin />);
    expect(await screen.findByLabelText("Bilder automatisch prüfen")).toBeDisabled();
    expect(screen.getByText("In XenRooms Free ist die Prüfung immer an.")).toBeInTheDocument();
  });
});
