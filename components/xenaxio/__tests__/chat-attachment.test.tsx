import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Attachment } from "../chat/message";

describe("Attachment (files in a chat message)", () => {
  const video = { msgtype: "m.video", body: "20261031_180311.mp4", url: "mxc://superronin.com/abc", info: { mimetype: "video/mp4", size: 3 * 1024 * 1024 } };

  it("plays a video from the address without the file name (Safari behind Cloudflare)", () => {
    const { container } = render(<Attachment content={video} />);
    const src = container.querySelector("video")?.getAttribute("src") ?? "";
    expect(src).toMatch(/\/_matrix\/client\/v1\/media\/download\/superronin\.com\/abc$/);
    expect(container.querySelector("video")?.hasAttribute("playsinline")).toBe(true);
  });

  it("offers the video for download", () => {
    render(<Attachment content={video} />);
    const link = screen.getByRole("link", { name: /20261031_180311\.mp4/ });
    expect(link.getAttribute("download")).toBe("20261031_180311.mp4");
    expect(link.getAttribute("href")).toMatch(/\/media\/download\/superronin\.com\/abc\/20261031_180311\.mp4$/);
    expect(link.textContent).toContain("3.0 MB");
  });

  it("offers a voice message for download too", () => {
    const { container } = render(<Attachment content={{ msgtype: "m.audio", body: "memo.ogg", url: "mxc://x.de/v1", info: { mimetype: "audio/ogg" } }} />);
    expect(container.querySelector("audio")?.getAttribute("src")).toMatch(/\/media\/download\/x\.de\/v1$/);
    expect(screen.getByRole("link", { name: /memo\.ogg/ }).getAttribute("download")).toBe("memo.ogg");
  });
});
