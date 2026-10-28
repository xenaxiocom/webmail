// xenaxio (step 64): Bulwark's settings sync, against the platform's
// /api/settings. The platform stores the settings document as it is, so the
// merge Bulwark's own server does on save (templates and calendar
// subscriptions added or deleted on another device survive a push from a tab
// that has not seen them) happens here, right before the save.
import { apiFetch } from "@/lib/browser-navigation";
import { mergeStoredSubscriptions } from "@/lib/calendar-subscription-sync";
import { mergeStoredTemplates } from "@/lib/template-merge";

/** How long a tab may stay in the background before it reads the settings again. */
export const SETTINGS_RELOAD_MS = 60_000;

export interface SettingsPush {
  username: string;
  serverUrl: string;
  settings: Record<string, unknown>;
}

/**
 * Saves the settings for the signed-in person. Answers like Bulwark's
 * endpoint: 404 without the endpoint, 403 when the person signed in has
 * changed meanwhile (the save is dropped instead of landing on the other
 * account).
 */
export async function pushSettingsToPlatform(job: SettingsPush): Promise<Response> {
  const current = await apiFetch("/api/settings", {
    credentials: "same-origin",
    headers: { Accept: "application/json", "x-settings-username": job.username, "x-settings-server": job.serverUrl },
  });
  if (!current.ok) return current;
  const body = (await current.json().catch(() => ({}))) as { settings?: unknown };
  const stored =
    body.settings && typeof body.settings === "object" && !Array.isArray(body.settings)
      ? (body.settings as Record<string, unknown>)
      : null;
  const settings = mergeStoredSubscriptions(stored, mergeStoredTemplates(stored, job.settings));
  return apiFetch("/api/settings", {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json", "x-xenaxio-csrf": "1" },
    body: JSON.stringify({ ...job, settings }),
  });
}

let lastLoad = 0;
let watching = false;

/**
 * Saves the last edit right away when the tab goes to the background (rather
 * than after the usual short wait, which a closed tab never reaches), and
 * reads the settings again when it comes back after a while, so a change made
 * on another device shows here without a reload (and an old tab does not push
 * its stale copy back over it).
 */
export function reloadSettingsOnReturn(reload: () => Promise<unknown>, flush: () => Promise<unknown>): void {
  lastLoad = Date.now();
  if (watching || typeof document === "undefined") return;
  watching = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void flush().catch(() => {});
      return;
    }
    if (Date.now() - lastLoad < SETTINGS_RELOAD_MS) return;
    lastLoad = Date.now();
    void reload().catch(() => {});
  });
}
