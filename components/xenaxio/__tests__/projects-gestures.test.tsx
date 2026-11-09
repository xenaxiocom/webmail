import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ObjectDetail } from "@/lib/xenaxio/projects";
import { Modal } from "../projects/bits";
import { TaskPanel } from "../projects/task-panel";

vi.mock("next-intl", async (orig) => ({ ...(await orig<typeof import("next-intl")>()), useLocale: () => "en", useTranslations: () => (key: string) => key }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ children }: { children: unknown }) => children, useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const api = vi.hoisted(() => ({ task: vi.fn(), tasks: vi.fn() }));
vi.mock("@/lib/xenaxio/projects", async (orig) => {
  const real = await orig<typeof import("@/lib/xenaxio/projects")>();
  return { ...real, projectsApi: { ...real.projectsApi, ...api } };
});

const project = { id: "p1", title: "Website", columns: [], people: [], can: { edit: true } } as unknown as ObjectDetail;

const swipe = (el: Element, from: { x: number; y: number }, to: { x: number; y: number }) => {
  fireEvent.touchStart(el, { touches: [{ clientX: from.x, clientY: from.y }] });
  fireEvent.touchMove(el, { touches: [{ clientX: (from.x + to.x) / 2, clientY: (from.y + to.y) / 2 }] });
  fireEvent.touchMove(el, { touches: [{ clientX: to.x, clientY: to.y }] });
  fireEvent.touchEnd(el, { touches: [] });
};

// Fix 09.11.2026: closing a task and a dialog on the phone with a gesture.
describe("gestures on the phone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.task.mockReturnValue(new Promise(() => undefined));
    api.tasks.mockReturnValue(new Promise(() => undefined));
  });

  it("closes the task with a swipe to the right from the left edge, not from the middle", () => {
    const onClose = vi.fn();
    render(<TaskPanel project={project} taskId="t1" onClose={onClose} onChanged={() => undefined} />);
    const panel = screen.getByRole("dialog");
    swipe(panel, { x: 200, y: 300 }, { x: 380, y: 305 });
    expect(onClose).not.toHaveBeenCalled();
    swipe(panel, { x: 10, y: 300 }, { x: 60, y: 305 });
    expect(onClose).not.toHaveBeenCalled();
    swipe(panel, { x: 10, y: 300 }, { x: 200, y: 305 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes a sheet pulled down by its top bar, not after a short pull", () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Add column" onClose={onClose}>
        <p>body</p>
      </Modal>,
    );
    const bar = screen.getByText("Add column").parentElement as HTMLElement;
    swipe(bar, { x: 150, y: 400 }, { x: 150, y: 440 });
    expect(onClose).not.toHaveBeenCalled();
    swipe(bar, { x: 150, y: 400 }, { x: 150, y: 520 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
