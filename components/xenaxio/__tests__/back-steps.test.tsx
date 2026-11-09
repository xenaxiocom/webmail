import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBackSteps } from "../use-close-gestures";

function Panes({ depth, onBack }: { depth: number; onBack: (depth: number) => void }) {
  useBackSteps(depth, true, onBack);
  return null;
}

const depthNow = () => (window.history.state as { xenaxioDepth?: number } | null)?.xenaxioDepth ?? 0;

// Rooms on the phone: Back steps out of the side panel and the conversation instead of leaving.
describe("Back steps for nested panes", () => {
  it("adds a step for each pane, Back returns one level, going up in the page drops the steps", async () => {
    window.history.replaceState(null, "");
    const onBack = vi.fn();
    const { rerender } = render(<Panes depth={0} onBack={onBack} />);
    const start = window.history.length;

    rerender(<Panes depth={1} onBack={onBack} />);
    rerender(<Panes depth={2} onBack={onBack} />);
    expect(window.history.length).toBe(start + 2);
    expect(depthNow()).toBe(2);

    // The phone's Back: from the side panel to the conversation.
    window.history.back();
    await waitFor(() => expect(onBack).toHaveBeenCalledWith(1));
    rerender(<Panes depth={1} onBack={onBack} />);

    // The page's own back button: to the list; the history follows without calling back.
    onBack.mockClear();
    rerender(<Panes depth={0} onBack={onBack} />);
    await waitFor(() => expect(depthNow()).toBe(0));
    expect(onBack).not.toHaveBeenCalled();
  });
});
