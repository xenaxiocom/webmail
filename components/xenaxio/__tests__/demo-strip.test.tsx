import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { minutesLeft, XenaxioDemoStrip } from "../demo-strip";
import { useXenaxioMeStore } from "@/lib/xenaxio/me-store";
import type { Me } from "@/lib/xenaxio/api";

const demoExtend = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({ useLocale: () => "de" }));
vi.mock("@/lib/xenaxio/api", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/api")>()), xenaxio: { demoExtend, me: vi.fn() } }));

const links = { site: "https://xenaxio.com/de/", quote: "https://xenaxio.com/de/zugang/", book: "https://essotec.xenaxio.com/book/es/first-call" };

function signedIn(demo: Me["demo"]) {
  const me = {
    user: { id: "u1", email: "anna@demo4.mail.test", displayName: "Anna", role: "admin", mustChangePassword: false },
    tenant: { id: "t1", name: "Schneider Haustechnik GmbH", status: "active" },
    edition: "cloud",
    demo,
  } as Me;
  useXenaxioMeStore.setState({ me, loadedAt: Date.now(), loading: false });
}

describe("live demo strip (step 73)", () => {
  beforeEach(() => demoExtend.mockReset());

  it("counts whole minutes up and never below zero", () => {
    const now = Date.parse("2026-10-29T12:00:00Z");
    expect(minutesLeft("2026-10-29T12:59:01Z", now)).toBe(60);
    expect(minutesLeft("2026-10-29T12:00:30Z", now)).toBe(1);
    expect(minutesLeft("2026-10-29T11:59:00Z", now)).toBe(0);
  });

  it("is not there outside the demo", () => {
    signedIn(null);
    const { container } = render(<XenaxioDemoStrip />);
    expect(container.textContent).toBe("");
  });

  it("shows the time left, the ways on, and extends once", async () => {
    signedIn({ expiresAt: new Date(Date.now() + 42 * 60_000 - 1000).toISOString(), extendable: true, links });
    render(<XenaxioDemoStrip />);
    expect(screen.getByText(/wird in 42 Min. zurückgesetzt/)).toBeTruthy();
    expect(screen.getByText("Demo buchen").getAttribute("href")).toBe(links.book);
    expect(screen.getByText("Angebot anfragen").getAttribute("href")).toBe(links.quote);
    demoExtend.mockResolvedValue({ expiresAt: new Date(Date.now() + 72 * 60_000 - 1000).toISOString(), extendable: false, links });
    await act(async () => fireEvent.click(screen.getByText("+30 Min.")));
    expect(screen.getByText(/wird in 72 Min. zurückgesetzt/)).toBeTruthy();
    expect(screen.queryByText("+30 Min.")).toBeNull();
  });
});
