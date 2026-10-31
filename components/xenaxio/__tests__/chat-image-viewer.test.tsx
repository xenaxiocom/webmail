import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImageViewer } from "../chat/image-viewer";

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

  it("zooms with the buttons and the keys, and fits back to the window", () => {
    open();
    const img = screen.getByAltText("pic.png") as HTMLImageElement;
    const fit = screen.getByRole("button", { name: "Fit to window" });
    expect(fit.textContent).toBe("100%");
    expect((screen.getByRole("button", { name: "Zoom out" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(fit.textContent).toBe("150%");
    expect(img.style.transform).toContain("scale(1.5)");
    fireEvent.keyDown(document, { key: "+" });
    expect(fit.textContent).toBe("225%");
    fireEvent.keyDown(document, { key: "-" });
    expect(fit.textContent).toBe("150%");
    fireEvent.click(fit);
    expect(fit.textContent).toBe("100%");
    expect(img.style.transform).toContain("scale(1)");
  });

  it("zooms with the wheel and a double click; a drag does not close it", () => {
    const onClose = open();
    const img = screen.getByAltText("pic.png");
    const area = img.parentElement as HTMLElement;
    const fit = screen.getByRole("button", { name: "Fit to window" });
    fireEvent.wheel(area, { deltaY: -200 });
    expect(Number.parseInt(fit.textContent as string, 10)).toBeGreaterThan(100);
    fireEvent.doubleClick(img);
    expect(fit.textContent).toBe("100%");
    fireEvent.doubleClick(img);
    expect(fit.textContent).toBe("250%");
    fireEvent.pointerDown(area, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(area, { pointerId: 1, clientX: 60, clientY: 40 });
    fireEvent.pointerUp(area, { pointerId: 1, clientX: 60, clientY: 40 });
    fireEvent.click(area);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(area);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("offers the download", () => {
    open();
    expect(screen.getByRole("link", { name: "Download" }).getAttribute("download")).toBe("pic.png");
  });
});
