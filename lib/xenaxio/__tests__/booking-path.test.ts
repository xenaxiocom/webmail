import { afterEach, describe, expect, it } from "vitest";
import { getPathPrefix, withBasePath } from "@/lib/browser-navigation";

// Step 56: a booking address whose employee or type looks like a locale ("es",
// "de") must not turn /book into a mount prefix (the API would then be asked at
// /book/api/…, which serves the page instead).
afterEach(() => window.history.replaceState(null, "", "/"));

describe("booking pages and the mount prefix", () => {
  it("finds no prefix on /book/<locale-like>/…", () => {
    for (const path of ["/book/es/first-call", "/book/de/demo", "/book/eugen/en", "/book/manage/"]) {
      window.history.replaceState(null, "", path);
      expect(getPathPrefix()).toBe("");
      expect(withBasePath("/api/portal")).toBe("/api/portal");
    }
  });

  it("still finds a real mount prefix elsewhere", () => {
    window.history.replaceState(null, "", "/webmail/de/mail/");
    expect(getPathPrefix()).toBe("/webmail");
  });
});
