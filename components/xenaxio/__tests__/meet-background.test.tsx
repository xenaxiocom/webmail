import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Step 92: the background behind one's own camera. LiveKit's processor is a
// stand-in that records what the meeting asks of it; MediaPipe is never loaded.
const made = vi.hoisted(() => [] as { options: Record<string, unknown>; name: string; switches: unknown[] }[]);
vi.mock("@livekit/track-processors", () => ({
  BackgroundProcessor: (options: Record<string, unknown>, name: string) => {
    const p = { options, name, switches: [] as unknown[], switchTo: async (o: unknown) => void p.switches.push(o) };
    made.push(p);
    return p;
  },
}));

import type { LocalVideoTrack } from "livekit-client";
import { BackgroundPicker, backgroundsSupported, useBackgroundEffect } from "../meet/background";
import { MeetLangProvider } from "../meet/lang";
import type { BackgroundChoice } from "@/lib/xenaxio/meet-background";

class FakeTrack {
  processor: { name: string } | undefined;
  setProcessor = vi.fn(async (p: { name: string }) => {
    if (this.fail) throw new Error("no webgl");
    this.processor = p;
  });
  stopProcessor = vi.fn(async () => {
    this.processor = undefined;
  });
  getProcessor = () => this.processor;
  constructor(private readonly fail = false) {}
}

/** What a browser that can do it has (jsdom has none of it). */
function canDoIt() {
  vi.stubGlobal("OffscreenCanvas", class {});
  vi.stubGlobal("VideoFrame", class {});
  vi.stubGlobal("createImageBitmap", async () => ({}));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(((kind: string) => (kind === "webgl2" ? {} : null)) as never);
  Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", { value: () => ({}), configurable: true });
}

beforeEach(() => {
  made.length = 0;
  localStorage.setItem("locale-storage", JSON.stringify({ state: { locale: "de" } }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (HTMLCanvasElement.prototype as { captureStream?: unknown }).captureStream;
  localStorage.clear();
});

describe("step 92: background effect on the camera", () => {
  it("is offered only where the browser can do it", () => {
    expect(backgroundsSupported()).toBe(false);
    canDoIt();
    expect(backgroundsSupported()).toBe(true);
  });

  it("puts one processor on the track, switches it in place, and takes it off for none", async () => {
    canDoIt();
    const track = new FakeTrack();
    const { result, rerender } = renderHook(({ choice, url }: { choice: BackgroundChoice; url: string | null }) => useBackgroundEffect(track as unknown as LocalVideoTrack, choice, url), {
      initialProps: { choice: { kind: "none" }, url: null },
    });
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(track.setProcessor).not.toHaveBeenCalled();

    rerender({ choice: { kind: "blur", strength: "strong" }, url: null });
    await waitFor(() => expect(track.setProcessor).toHaveBeenCalledTimes(1));
    expect(made[0]).toMatchObject({
      name: "xenaxio-background",
      options: { mode: "background-blur", blurRadius: 14, assetPaths: { tasksVisionFileSet: `${location.origin}/xenaxio/meet/vision`, modelAssetPath: `${location.origin}/xenaxio/meet/selfie_segmenter.tflite` } },
    });

    rerender({ choice: { kind: "image", id: "img-sea" }, url: "https://x/sea.webp" });
    await waitFor(() => expect(made[0]?.switches).toEqual([{ mode: "virtual-background", imagePath: "https://x/sea.webp" }]));
    expect(track.setProcessor).toHaveBeenCalledTimes(1);

    rerender({ choice: { kind: "none" }, url: null });
    await waitFor(() => expect(track.stopProcessor).toHaveBeenCalledTimes(1));
    expect(result.current.failed).toBe(false);
  });

  it("says so when the browser cannot, and leaves the plain camera", async () => {
    canDoIt();
    const track = new FakeTrack(true);
    const { result } = renderHook(() => useBackgroundEffect(track as unknown as LocalVideoTrack, { kind: "blur", strength: "light" }, null));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(track.stopProcessor).toHaveBeenCalled();
  });
});

describe("step 92: choosing the background", () => {
  const props = { onOwnPicture: () => true, failed: false, busy: false, own: null };

  it("offers blur, our pictures, the company's only when there is one, and one's own", () => {
    const onChoose = vi.fn();
    const { rerender } = render(
      <MeetLangProvider>
        <BackgroundPicker choice={{ kind: "none" }} onChoose={onChoose} company={null} {...props} />
      </MeetLangProvider>,
    );
    expect(screen.getByRole("button", { name: "Kein Effekt" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Hintergrund der Firma" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stark weichzeichnen" }));
    expect(onChoose).toHaveBeenLastCalledWith({ kind: "blur", strength: "strong" });
    fireEvent.click(screen.getByRole("button", { name: "Meer" }));
    expect(onChoose).toHaveBeenLastCalledWith({ kind: "image", id: "img-sea" });
    expect(screen.getByRole("button", { name: "Eigenes Bild hochladen" })).toBeInTheDocument();

    rerender(
      <MeetLangProvider>
        <BackgroundPicker choice={{ kind: "image", id: "company" }} onChoose={onChoose} company={{ url: "/api/meet/background?v=1", default: true }} {...props} own="data:image/jpeg;base64,AA" />
      </MeetLangProvider>,
    );
    expect(screen.getByRole("button", { name: "Hintergrund der Firma" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Eigenes Bild entfernen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anderes eigenes Bild" })).toBeInTheDocument();
  });

  it("shows when it could not", () => {
    render(
      <MeetLangProvider>
        <BackgroundPicker choice={{ kind: "blur", strength: "light" }} onChoose={() => undefined} company={null} {...props} failed />
      </MeetLangProvider>,
    );
    expect(screen.getByText(/kann den Hintergrund gerade nicht ändern/)).toBeInTheDocument();
  });
});
