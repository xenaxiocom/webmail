import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Step 90, part D: the admin opens an employee's folders, opens a file and deletes.
const api = vi.hoisted(() => ({ people: vi.fn(), folder: vi.fn(), remove: vi.fn(), downloadUrl: (u: string, id: string) => `/api/admin/files/download?user=${u}&id=${id}` }));

vi.mock("next-intl", () => ({ useLocale: () => "de" }));
vi.mock("@/components/xenaxio/workspace-shell", () => ({ WorkspaceShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/xenaxio/admin-files", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/admin-files")>()), adminFiles: api }));

const { default: EmployeeFilesPage } = await import("../page");

const top = {
  person: { id: "u1", name: "Anna Schmidt", email: "anna@acme.de" },
  path: [],
  totalBytes: 3 * 1024 * 1024,
  truncated: false,
  items: [
    { id: "f1", name: "Projekte", parentId: null, folder: true, size: 0, type: null, modified: null },
    { id: "f3", name: "notiz.txt", parentId: null, folder: false, size: 2048, type: "text/plain", modified: "2026-10-30T10:00:00Z" },
  ],
};

beforeEach(() => {
  api.people.mockReset();
  api.folder.mockReset();
  api.remove.mockReset();
});

describe("step 90, part D: employees' files", () => {
  it("lists people, opens folders and files, deletes what is selected", async () => {
    api.people.mockResolvedValue([{ id: "u1", name: "Anna Schmidt", email: "anna@acme.de", usedBytes: 12 * 1024 * 1024 }]);
    api.folder.mockResolvedValueOnce(top).mockResolvedValueOnce({ ...top, path: [{ id: "f1", name: "Projekte" }], items: [] });
    api.remove.mockResolvedValue({ deleted: ["f3"] });
    render(<EmployeeFilesPage />);
    expect(await screen.findByText(/12 MB belegt/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Anna Schmidt"));
    expect(await screen.findByText("notiz.txt")).toHaveAttribute("href", "/api/admin/files/download?user=u1&id=f3");
    expect(screen.getByText("Dateien: 3 MB insgesamt")).toBeInTheDocument();
    expect(api.folder).toHaveBeenCalledWith("u1", null);
    fireEvent.click(screen.getByText("Projekte"));
    expect(await screen.findByText("Dieser Ordner ist leer.")).toBeInTheDocument();
    expect(api.folder).toHaveBeenLastCalledWith("u1", "f1");

    api.folder.mockResolvedValueOnce(top).mockResolvedValueOnce({ ...top, items: [top.items[0]] });
    fireEvent.click(screen.getAllByText("Anna Schmidt")[0]!);
    fireEvent.click(await screen.findByRole("checkbox", { name: "notiz.txt auswählen" }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: /Ausgewählte löschen \(1\)/ }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith("u1", ["f3"]));
    expect(await screen.findByText("1 gelöscht.")).toBeInTheDocument();
  });
});
