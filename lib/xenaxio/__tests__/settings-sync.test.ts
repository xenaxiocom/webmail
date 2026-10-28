import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Step 64: the settings are kept on the platform. It stores them as they are,
// so templates and calendar subscriptions another device added are merged in
// here before a save, as Bulwark's own server does.

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/browser-navigation", () => ({ apiFetch: fetchMock }));

const { pushSettingsToPlatform, reloadSettingsOnReturn, SETTINGS_RELOAD_MS } = await import("@/lib/xenaxio/settings-sync");

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const job = (settings: Record<string, unknown>) => ({ username: "anna@acme.de", serverUrl: "https://acme.test/api/jmap", settings });
const template = (id: string, updatedAt: string) => ({ id, name: id, subject: "", body: "", updatedAt });

describe("pushSettingsToPlatform", () => {
  beforeEach(() => fetchMock.mockReset());

  it("keeps a template another device added and sends the CSRF header", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { settings: { theme: "dark", templates: [template("from-phone", "2026-10-28T09:00:00Z")], deletedTemplateIds: {} } }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    const res = await pushSettingsToPlatform(job({ theme: "light", templates: [template("here", "2026-10-28T10:00:00Z")], deletedTemplateIds: {} }));
    expect(res.status).toBe(200);

    const [getUrl, getInit] = fetchMock.mock.calls[0];
    expect(getUrl).toBe("/api/settings");
    expect(getInit.headers["x-settings-username"]).toBe("anna@acme.de");
    const [postUrl, postInit] = fetchMock.mock.calls[1];
    expect(postUrl).toBe("/api/settings");
    expect(postInit.method).toBe("POST");
    expect(postInit.headers["x-xenaxio-csrf"]).toBe("1");
    const sent = JSON.parse(postInit.body);
    expect(sent.username).toBe("anna@acme.de");
    expect(sent.settings.theme).toBe("light");
    expect(sent.settings.templates.map((t: { id: string }) => t.id).sort()).toEqual(["from-phone", "here"]);
  });

  it("saves as it is when nothing is stored yet", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { settings: null })).mockResolvedValueOnce(json(200, { ok: true }));
    await pushSettingsToPlatform(job({ interfaceLayout: "mountain-view" }));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).settings).toEqual({ interfaceLayout: "mountain-view" });
  });

  it("does not save when the browser is signed in as someone else now", async () => {
    fetchMock.mockResolvedValueOnce(json(403, { error: "identity_mismatch" }));
    const res = await pushSettingsToPlatform(job({ theme: "dark" }));
    expect(res.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("reloadSettingsOnReturn", () => {
  afterEach(() => vi.useRealTimers());

  it("saves when the tab goes away and reads again when it comes back after a while", async () => {
    vi.useFakeTimers();
    const reload = vi.fn().mockResolvedValue(undefined);
    const flush = vi.fn().mockResolvedValue(undefined);
    reloadSettingsOnReturn(reload, flush);
    const show = (state: "visible" | "hidden") => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    show("hidden");
    expect(flush).toHaveBeenCalledTimes(1);
    show("visible");
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SETTINGS_RELOAD_MS + 1);
    show("visible");
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
