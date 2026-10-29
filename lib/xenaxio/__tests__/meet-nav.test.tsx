import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The "Meetings" menu entry follows the admin's switch without a reload.
vi.mock("@/lib/xenaxio/bff", () => ({ XENAXIO_BFF: true }));
vi.mock("@/lib/xenaxio/i18n", () => ({ useXT: () => (key: string) => key }));
const status = vi.hoisted(() => vi.fn());
vi.mock("@/lib/xenaxio/meet", () => ({ meet: { status } }));

import { setMeetNavEnabled, useMeetNavItem } from "../meet-nav";

describe("step 78: Meetings in the menu", () => {
  it("shows up as soon as meetings are turned on, asked once per page", async () => {
    status.mockResolvedValue({ enabled: false });
    const { result } = renderHook(() => useMeetNavItem());
    await waitFor(() => expect(status).toHaveBeenCalledTimes(1));
    expect(result.current.visible).toBe(false);
    // The admin turns meetings on: no new question, the entry is there.
    act(() => setMeetNavEnabled(true));
    expect(result.current.visible).toBe(true);
    renderHook(() => useMeetNavItem());
    expect(status).toHaveBeenCalledTimes(1);
    act(() => setMeetNavEnabled(false));
    expect(result.current.visible).toBe(false);
  });
});
