import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImageViewer } from "../chat/message";

describe("ImageViewer (chat picture over the whole window)", () => {
  const open = () => {
    const onClose = vi.fn();
    render(<ImageViewer src="/pic.png" name="pic.png" download="/pic.png" onClose={onClose} />);
    return onClose;
  };

  it("closes with the cross", () => {
    const onClose = open();
    expect(screen.getByRole("dialog", { name: "pic.png" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes with Escape and a click beside the picture, not on it", () => {
    const onClose = open();
    fireEvent.click(screen.getByAltText("pic.png"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByAltText("pic.png").parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("offers the download", () => {
    open();
    expect(screen.getByRole("link", { name: "Download" }).getAttribute("download")).toBe("pic.png");
  });
});
