import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Board } from "../projects/board";
import { ColorPicker, StatusChip, tone } from "../projects/bits";
import { STATUS_COLORS } from "@/lib/xenaxio/projects";

vi.mock("next-intl", async (orig) => ({ ...(await orig<typeof import("next-intl")>()), useLocale: () => "en" }));

// Step 132: colours of columns and stages, drawn with the theme's colours (rule 11).
describe("projects colours", () => {
  it("has a theme colour for every colour the platform accepts", () => {
    for (const c of STATUS_COLORS) {
      const t = tone(c)!;
      expect(t, c).toBeTruthy();
      for (const cls of [t.chip, t.dot, t.tint]) expect(cls).not.toMatch(/-(red|green|blue|amber|yellow|violet|teal|pink|gray|slate)-\d/);
    }
    expect(tone(null)).toBeNull();
    expect(tone("orange")).toBeNull();
  });

  it("chips use theme tokens; an unknown colour is grey", () => {
    render(
      <>
        <StatusChip text="Aktiv" color="blue" />
        <StatusChip text="Lila" color="violet" />
        <StatusChip text="Alt" color="orange" />
      </>,
    );
    expect(screen.getByText("Aktiv").className).toContain("text-info");
    expect(screen.getByText("Lila").className).toContain("text-tag-violet");
    expect(screen.getByText("Alt").className).toContain("text-muted-foreground");
  });

  it("a coloured lane has a stripe, a dot and a tint; one without colour stays plain", () => {
    render(
      <Board
        label="Board"
        lanes={[
          { id: "backlog", title: "Backlog", color: "violet" },
          { id: "todo", title: "To do" },
          { id: "done", title: "Done", done: true, color: "green" },
        ]}
        items={[]}
        render={(id) => <span>{id}</span>}
        onMove={() => undefined}
        emptyText="No tasks"
      />,
    );
    const backlog = screen.getByRole("region", { name: "Backlog" });
    expect(backlog.className).toContain("from-tag-violet/10");
    expect(backlog.querySelector("[data-lane-stripe]")!.className).toContain("bg-tag-violet");
    expect(backlog.querySelectorAll(".bg-tag-violet")).toHaveLength(2);
    expect(screen.getByRole("region", { name: "Done" }).querySelector("[data-lane-stripe]")!.className).toContain("bg-success");
    const todo = screen.getByRole("region", { name: "To do" });
    expect(todo.querySelector("[data-lane-stripe]")).toBeNull();
    expect(todo.getAttribute("data-color")).toBeNull();
  });

  it("the picker offers no colour and the eight colours", () => {
    const onChange = vi.fn();
    render(<ColorPicker value="blue" onChange={onChange} />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(9);
    expect(screen.getByRole("radio", { name: "Blue" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Teal" }));
    expect(onChange).toHaveBeenLastCalledWith("teal");
    fireEvent.click(screen.getByRole("radio", { name: "No colour" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("the Projects section has no Tailwind palette colours left", () => {
    const dir = join(process.cwd(), "components/xenaxio/projects");
    for (const file of ["bits.tsx", "board.tsx", "project-view.tsx", "add-to-project.tsx"]) {
      const src = readFileSync(join(dir, file), "utf8");
      expect(src, file).not.toMatch(/\b(bg|text|border|fill|stroke)-(red|green|blue|amber|yellow|orange|violet|purple|teal|pink|emerald|sky|indigo|rose|lime|cyan)-\d/);
    }
  });
});
