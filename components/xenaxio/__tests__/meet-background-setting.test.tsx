import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Step 116: the camera background in Settings → Account.
vi.mock("next-intl", () => ({ useLocale: () => "de" }));
const nav = vi.hoisted(() => ({ visible: false }));
vi.mock("@/lib/xenaxio/meet-nav", () => ({ useMeetNavItem: () => ({ visible: nav.visible, label: "Meetings", webinars: false }) }));
const api = vi.hoisted(() => ({ status: vi.fn() }));
vi.mock("@/lib/xenaxio/meet", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/meet")>()), meet: api }));
const support = vi.hoisted(() => ({ ok: false }));
vi.mock("../meet/background", async (orig) => ({ ...(await orig<typeof import("../meet/background")>()), backgroundsSupported: () => support.ok }));
vi.mock("../meet/background-preview", () => ({ Preview: ({ company }: { company: { url: string } | null }) => <p>preview {company?.url ?? "none"}</p> }));

import { MeetBackgroundSetting } from "../meet/background-setting";

afterEach(() => {
  nav.visible = false;
  support.ok = false;
  api.status.mockReset();
});

describe("step 116: meeting background in the settings", () => {
  it("is not there when the company has no meetings", () => {
    const { container } = render(<MeetBackgroundSetting />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says so when the browser cannot do it, without asking the platform", () => {
    nav.visible = true;
    render(<MeetBackgroundSetting />);
    expect(screen.getByText("Hintergrund in Meetings und Anrufen")).toBeInTheDocument();
    expect(screen.getByText(/kann den Hintergrund der Kamera nicht ersetzen/)).toBeInTheDocument();
    expect(api.status).not.toHaveBeenCalled();
  });

  it("offers the company's background with the preview", async () => {
    nav.visible = true;
    support.ok = true;
    api.status.mockResolvedValue({ enabled: true, background: { url: "/api/meet/background", kind: "image" } });
    render(<MeetBackgroundSetting />);
    expect(await screen.findByText("preview /api/meet/background")).toBeInTheDocument();
    await waitFor(() => expect(api.status).toHaveBeenCalledTimes(1));
  });
});
