import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskTransfer } from "@/lib/xenaxio/projects";
import { useToastStore } from "@/stores/toast-store";
import { MoveTaskDialog, taskHref } from "../projects/move-task";

vi.mock("next-intl", async (orig) => ({ ...(await orig<typeof import("next-intl")>()), useLocale: () => "en" }));
vi.mock("@/lib/xenaxio/me-store", () => ({ useXenaxioMe: () => ({ user: { role: "user" } }) }));

const api = vi.hoisted(() => ({
  types: vi.fn(),
  query: vi.fn(),
  tasks: vi.fn(),
  transferPreview: vi.fn(),
  transfer: vi.fn(),
}));
vi.mock("@/lib/xenaxio/projects", async (orig) => {
  const real = await orig<typeof import("@/lib/xenaxio/projects")>();
  return { ...real, projectsApi: { ...real.projectsApi, ...api } };
});

const plan = (extra: Partial<TaskTransfer> = {}): TaskTransfer => ({
  target: { id: "p2", ref: "P-2", title: "Website", typeKey: "project" },
  column: { id: "c1", name: "To do" },
  tasks: 3,
  subtasks: 2,
  joining: [{ id: "u1", name: "Max", email: "max@acme.de" }],
  leaving: [{ id: "u2", name: "Eva", email: "eva@acme.de" }],
  detached: false,
  ...extra,
});

// Step 142: a task with its subtasks to another project.
describe("move a task to another project", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useToastStore.setState({ toasts: [] });
    api.types.mockResolvedValue({ types: [{ key: "project", hasTasks: true, plural: { de: "Projekte", en: "Projects" } }] });
    api.query.mockResolvedValue({
      objects: [
        { id: "p1", ref: "P-1", title: "Messe", archivedAt: null },
        { id: "p2", ref: "P-2", title: "Website", archivedAt: null },
      ],
    });
    api.tasks.mockResolvedValue({
      columns: [
        { id: "c1", name: "To do", done: false, color: null },
        { id: "c3", name: "Done", done: true, color: null },
      ],
      tasks: [],
    });
    api.transferPreview.mockImplementation(async (_id: string, _task: string, to: { columnId?: string }) => plan(to.columnId === "c3" ? { column: { id: "c3", name: "Done" } } : {}));
    api.transfer.mockResolvedValue({ ...plan(), task: { id: "t1", ref: "P-2-1" } });
  });

  it("lists the person's records without the current one, warns before and moves into the chosen column", async () => {
    const onMoved = vi.fn();
    const onOpen = vi.fn();
    render(<MoveTaskDialog objectId="p1" typeKey="project" task={{ id: "t1", ref: "P-1-2", title: "Stand" }} onClose={() => undefined} onMoved={onMoved} onOpen={onOpen} />);
    await waitFor(() => expect(screen.getByText("Website")).toBeTruthy());
    expect(api.query).toHaveBeenCalledWith(expect.objectContaining({ type: "project", mine: true }));
    expect(screen.queryByText("Messe")).toBeNull();
    // Nothing to move before a project is chosen.
    expect((screen.getByRole("button", { name: "Move" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByText("Website"));
    await waitFor(() => expect(screen.getByText("With 2 subtasks")).toBeTruthy());
    expect(screen.getByText("Max becomes a member of P-2.")).toBeTruthy();
    expect(screen.getByText("Eva doesn't see P-2 and stops watching the task.")).toBeTruthy();
    expect(api.transferPreview).toHaveBeenCalledWith("p1", "t1", { targetId: "p2" });
    // The platform's default column is preselected; another one asks again.
    const column = screen.getByRole("combobox") as HTMLSelectElement;
    await waitFor(() => expect(column.value).toBe("c1"));
    fireEvent.change(column, { target: { value: "c3" } });
    await waitFor(() => expect(api.transferPreview).toHaveBeenLastCalledWith("p1", "t1", { targetId: "p2", columnId: "c3" }));

    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    await waitFor(() => expect(onMoved).toHaveBeenCalled());
    expect(api.transfer).toHaveBeenCalledWith("p1", "t1", { targetId: "p2", columnId: "c3" });
    const shown = useToastStore.getState().toasts[0]!;
    expect(shown.title).toBe("Moved to P-2 · Website: P-2-1");
    shown.action!.onClick();
    expect(onOpen).toHaveBeenCalledWith("/projects?id=p2&task=t1");
  });

  it("says when a subtask leaves its parent and nothing else happens", async () => {
    api.transferPreview.mockResolvedValue(plan({ subtasks: 0, tasks: 1, joining: [], leaving: [], detached: true }));
    render(<MoveTaskDialog objectId="p1" typeKey="project" task={{ id: "t1", ref: "P-1-2", title: "Stand" }} onClose={() => undefined} onMoved={() => undefined} onOpen={() => undefined} />);
    await waitFor(() => expect(screen.getByText("Website")).toBeTruthy());
    fireEvent.click(screen.getByText("Website"));
    await waitFor(() => expect(screen.getByText("It is a subtask; in the new project it becomes a task of its own.")).toBeTruthy());
    expect(screen.queryByText(/subtasks$/)).toBeNull();
    expect(screen.queryByText(/becomes a member/)).toBeNull();
  });

  it("links a task on the board of another type with the task in the query", () => {
    expect(taskHref("project", "p2", "t1")).toBe("/projects?id=p2&task=t1");
    expect(taskHref("deal", "d1", "t1")).toBe("/objects?type=deal&id=d1&task=t1");
  });
});
