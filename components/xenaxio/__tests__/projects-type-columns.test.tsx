import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ObjectType } from "@/lib/xenaxio/projects";
import { ColumnsEditor } from "../projects/type-editor";

vi.mock("next-intl", async (orig) => ({ ...(await orig<typeof import("next-intl")>()), useLocale: () => "en" }));
const setColumns = vi.fn();
vi.mock("@/lib/xenaxio/projects", async (orig) => {
  const real = await orig<typeof import("@/lib/xenaxio/projects")>();
  return { ...real, projectsApi: { ...real.projectsApi, setColumns: (...a: unknown[]) => setColumns(...a) } };
});

const type = (columns: ObjectType["columns"]) => ({ key: "project", hasTasks: true, columns }) as unknown as ObjectType;

// Step 133: the admin sets the columns a new project starts with.
describe("columns of new projects", () => {
  it("starts from the built-in set and saves the admin's columns", async () => {
    setColumns.mockReset().mockImplementation(async (_k: string, columns: unknown) => ({ ...type(columns as ObjectType["columns"]) }));
    const onSaved = vi.fn();
    render(<ColumnsEditor type={type([])} onSaved={onSaved} />);
    const names = () => screen.getAllByRole("textbox").map((i) => (i as HTMLInputElement).value);
    expect(names()).toEqual(["To do", "In progress", "Done"]);
    expect(screen.getByText("Default")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Restore default" })).toBeNull();
    fireEvent.change(screen.getAllByRole("textbox")[0]!, { target: { value: " Backlog " } });
    fireEvent.click(screen.getAllByRole("radio", { name: "Gray" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(setColumns).toHaveBeenCalledWith("project", [
      { name: "Backlog", done: false, color: "gray" },
      { name: "In progress", done: false, color: "blue" },
      { name: "Done", done: true, color: "green" },
    ]);
  });

  it("shows the admin's columns; an empty name blocks saving; restore sends an empty list", async () => {
    setColumns.mockReset().mockResolvedValue(type([]));
    render(<ColumnsEditor type={type([{ name: "Backlog", done: false, color: "gray" }])} onSaved={() => undefined} />);
    expect(screen.queryByText("Default")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add column" }));
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Restore default" }));
    await waitFor(() => expect(setColumns).toHaveBeenCalledWith("project", []));
  });
});
