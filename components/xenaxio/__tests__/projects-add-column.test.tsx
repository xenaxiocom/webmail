import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AddColumnDialog } from "../projects/project-view";

vi.mock("next-intl", async (orig) => ({ ...(await orig<typeof import("next-intl")>()), useLocale: () => "en" }));

// A new board column gets its name, colour and "done" in one dialog.
describe("add column dialog", () => {
  it("sends the name, the chosen colour and whether its tasks count as done", () => {
    const onAdd = vi.fn();
    render(<AddColumnDialog open onClose={() => undefined} onAdd={onAdd} />);
    const submit = screen.getAllByRole("button").find((b) => b.getAttribute("type") === "submit")!;
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  Backlog " } });
    fireEvent.click(screen.getByRole("radio", { name: "Teal" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(submit);
    expect(onAdd).toHaveBeenCalledWith({ name: "Backlog", color: "teal", done: true });
  });

  it("without a colour or the box ticked the column is plain and open", () => {
    const onAdd = vi.fn();
    render(<AddColumnDialog open onClose={() => undefined} onAdd={onAdd} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Review" } });
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    expect(onAdd).toHaveBeenCalledWith({ name: "Review", color: null, done: false });
  });
});
