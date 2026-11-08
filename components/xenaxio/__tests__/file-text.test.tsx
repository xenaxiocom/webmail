import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Step 132: pictures pasted into a comment become the task's files; the comment shows them.
const upload = vi.hoisted(() => vi.fn());
vi.mock("@/lib/xenaxio/projects", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/projects")>()), uploadObjectFile: upload }));
vi.mock("next-intl", async (orig) => ({ ...(await orig<typeof import("next-intl")>()), useLocale: () => "en" }));

import { FileText } from "../projects/file-text";
import { MentionInput } from "../projects/task-extras";

const ID = "0f8a3c2e-1b2c-4d5e-8f90-123456789abc";

describe("files in comments", () => {
  it("uploads a pasted screenshot to the task and puts it into the comment", async () => {
    upload.mockResolvedValue({ id: ID, name: "image-x.png", type: "image/png" });
    const onSend = vi.fn().mockResolvedValue(true);
    const onUploaded = vi.fn();
    render(<MentionInput people={[]} onSend={onSend} files={{ objectId: "o1", taskId: "t1", onUploaded }} />);
    const box = screen.getByRole("combobox");
    fireEvent.change(box, { target: { value: "Fehler:" } });
    const shot = new File(["png"], "image.png", { type: "image/png" });
    fireEvent.paste(box, { clipboardData: { files: [shot], types: ["Files"], getData: () => "" } });
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(upload).toHaveBeenCalledWith("o1", expect.any(File), "t1");
    expect((upload.mock.calls[0]![1] as File).name).toMatch(/^image-\d{4}-\d{2}-\d{2}-\d{6}\.png$/);
    expect((box as HTMLTextAreaElement).value).toBe(`Fehler:\n![image-x.png](file:${ID})`);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith(`Fehler:\n![image-x.png](file:${ID})`, []));
  });

  it("offers no paper clip without files, and leaves pasted text alone", () => {
    render(<MentionInput people={[]} onSend={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /attach/i })).toBeNull();
  });

  it("shows pictures and file chips of a comment", () => {
    render(<FileText objectId="o1" body={`Siehe\n![Skizze.png](file:${ID})\n[Plan.pdf](file:${ID})`} />);
    expect(screen.getByRole("img", { name: "Skizze.png" }).getAttribute("src")).toBe(`/api/objects/o1/files/${ID}?inline=1`);
    const chip = screen.getByRole("link", { name: "Plan.pdf" });
    expect(chip.getAttribute("href")).toBe(`/api/objects/o1/files/${ID}`);
    expect(chip.getAttribute("download")).toBe("Plan.pdf");
  });
});
