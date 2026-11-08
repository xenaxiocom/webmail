import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { filterTasks, type TaskSummary } from "@/lib/xenaxio/projects";
import { parentChoices, Subtasks, TaskPath, treeRows } from "../projects/subtasks";

// Step 135: subtasks nested without a practical limit.
const task = (id: string, parentId: string | null, path: string[] = [], extra: Partial<TaskSummary> = {}): TaskSummary => ({
  id,
  objectId: "p",
  columnId: "c",
  number: 1,
  ref: `P-1-${id}`,
  title: `Task ${id}`,
  assignee: null,
  dueOn: null,
  priority: null,
  labels: [],
  done: false,
  doneAt: null,
  hasDescription: false,
  comments: 0,
  checklist: { done: 0, total: 0 },
  attachments: 0,
  updatedAt: "2026-11-08T10:00:00Z",
  parentId,
  path: path.map((p) => ({ id: p, ref: `P-1-${p}`, title: `Task ${p}` })),
  ...extra,
});

describe("subtask tree", () => {
  const list = [task("2", "1", ["1"]), task("3", "2", ["1", "2"]), task("4", "1", ["1"]), task("5", "3", ["1", "2", "3"])];

  it("lists the branch with depths, parents first; folded branches hide their rows", () => {
    expect(treeRows(list, "1").map((r) => [r.task.id, r.depth, r.hasChildren])).toEqual([
      ["2", 0, true],
      ["3", 1, true],
      ["5", 2, false],
      ["4", 0, false],
    ]);
    expect(treeRows(list, "1", new Set(["2"])).map((r) => r.task.id)).toEqual(["2", "4"]);
  });

  it("offers as parents only tasks outside the branch that keep it within ten levels", () => {
    const all = [task("1", null), ...list, task("9", null), task("deep", "x", ["a", "b", "c", "d", "e", "f", "g", "h"])];
    const two = all.find((x) => x.id === "2")!;
    const ids = parentChoices(all, two, [list[1]!, list[3]!]).map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(["1", "4", "9"]));
    expect(ids).not.toContain("2");
    expect(ids).not.toContain("3");
    expect(ids).not.toContain("5");
    // A branch of three levels does not fit under a task on level 9.
    expect(ids).not.toContain("deep");
  });

  it("hides subtasks on the board when asked", () => {
    expect(filterTasks([task("1", null), task("2", "1", ["1"])], { hideSubtasks: true }).map((t) => t.id)).toEqual(["1"]);
  });
});

describe("Subtasks", () => {
  it("shows the tree with progress, opens a subtask, ticks it and adds one below", async () => {
    const onOpen = vi.fn();
    const onToggle = vi.fn();
    const onAdd = vi.fn().mockResolvedValue(true);
    const root = { ...task("1", null), subtasks: { done: 1, total: 3 }, subtaskList: [task("2", "1", ["1"], { done: true }), task("3", "2", ["1", "2"]), task("4", "1", ["1"])] };
    render(<Subtasks task={root} canEdit locale="en" onOpen={onOpen} onToggle={onToggle} onAdd={onAdd} />);
    expect(screen.getByText("1/3")).toBeTruthy();
    expect(screen.getAllByRole("treeitem").map((li) => li.getAttribute("aria-level"))).toEqual(["1", "2", "1"]);
    fireEvent.click(screen.getByText("Task 3"));
    expect(onOpen).toHaveBeenCalledWith("3");
    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    expect(onToggle).toHaveBeenCalledWith("3", true);
    fireEvent.click(screen.getByRole("button", { name: "Add a subtask to P-1-3" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Subtask title" }), { target: { value: "Neu" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await vi.waitFor(() => expect(onAdd).toHaveBeenCalledWith("3", "Neu"));
  });

  it("shows the way down to a task; each step opens it", () => {
    const onOpen = vi.fn();
    render(<TaskPath task={task("3", "2", ["1", "2"])} onOpen={onOpen} />);
    fireEvent.click(screen.getByText("P-1-1 Task 1"));
    expect(onOpen).toHaveBeenCalledWith("1");
  });
});
