import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { loadOwnBackground, saveOwnBackground } from "@/lib/xenaxio/meet-background-store";

// Step 93: one's own background lives in IndexedDB; step 92's picture in
// localStorage moves there the first time.
afterEach(async () => {
  await saveOwnBackground(null);
  localStorage.clear();
});

describe("own meeting background in this browser", () => {
  it("keeps a file and its kind, and forgets it", async () => {
    expect(await loadOwnBackground()).toBeNull();
    const blob = new Blob(["gif"], { type: "image/gif" });
    expect(await saveOwnBackground({ blob, kind: "animation" })).toBe(true);
    const stored = await loadOwnBackground();
    expect(stored?.kind).toBe("animation");
    expect(stored?.blob.size).toBe(3);
    await saveOwnBackground(null);
    expect(await loadOwnBackground()).toBeNull();
  });

  it("moves step 92's picture from localStorage", async () => {
    localStorage.setItem("xenaxio-meet-background-own", "data:image/png;base64,iVBORw0KGgo=");
    const stored = await loadOwnBackground();
    expect(stored?.kind).toBe("image");
    expect(localStorage.getItem("xenaxio-meet-background-own")).toBeNull();
    expect((await loadOwnBackground())?.kind).toBe("image");
  });
});
