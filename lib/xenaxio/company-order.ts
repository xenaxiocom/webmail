// Step 152 R1d: the order of the companies in XenRooms is kept on the platform (rule 10;
// owner 24.11.2026), in the settings document (step 64) under `xenroomsCompanyOrder`:
// `{ order: [user ids], at: <ms> }`. The XenRooms phone app writes it into every account's
// document, the browser into the active account's; whoever reads takes the newest.
import { apiFetch } from "@/lib/browser-navigation";

export const ORDER_KEY = "xenroomsCompanyOrder";

export interface StoredOrder {
  order: string[];
  at: number;
}

/** The stored value, or null; a bare list (older writers) counts as oldest. */
export function parseOrder(value: unknown): StoredOrder | null {
  if (Array.isArray(value)) return value.every((x) => typeof x === "string") ? { order: value as string[], at: 0 } : null;
  if (!value || typeof value !== "object") return null;
  const v = value as { order?: unknown; at?: unknown };
  if (!Array.isArray(v.order) || !v.order.every((x) => typeof x === "string")) return null;
  return { order: (v.order as string[]).slice(0, 100), at: typeof v.at === "number" && Number.isFinite(v.at) ? v.at : 0 };
}

/**
 * The document to save: the browser's own settings, keeping the stored order when the
 * browser's copy has none or an older one (Bulwark's settings save replaces the whole
 * document, and the phone may have written the order meanwhile).
 */
export function keepOrder(stored: Record<string, unknown> | null, next: Record<string, unknown>): Record<string, unknown> {
  const kept = parseOrder(stored?.[ORDER_KEY]);
  const mine = parseOrder(next[ORDER_KEY]);
  if (!kept || (mine && mine.at >= kept.at)) return next;
  return { ...next, [ORDER_KEY]: kept };
}

async function readDocument(): Promise<Record<string, unknown> | null | undefined> {
  const res = await apiFetch("/api/settings", { credentials: "same-origin", headers: { Accept: "application/json" } }).catch(() => null);
  if (!res?.ok) return undefined;
  const body = (await res.json().catch(() => ({}))) as { settings?: unknown };
  return body.settings && typeof body.settings === "object" && !Array.isArray(body.settings) ? (body.settings as Record<string, unknown>) : null;
}

/** The order stored for the active account; null when there is none or it can't be read. */
export async function readServerOrder(): Promise<StoredOrder | null> {
  const doc = await readDocument();
  return doc ? parseOrder(doc[ORDER_KEY]) : null;
}

/** Stores the order in the active account's document; the rest of it stays as it is. */
export async function writeServerOrder(email: string, value: StoredOrder): Promise<void> {
  const doc = await readDocument();
  if (doc === undefined) return;
  await apiFetch("/api/settings", {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json", "x-xenaxio-csrf": "1" },
    body: JSON.stringify({ username: email, serverUrl: window.location.origin, settings: { ...(doc ?? {}), [ORDER_KEY]: value } }),
  }).catch(() => undefined);
}
