// xenaxio step 129 G: industry packages (e.g. Xenaxio Maritime) — the company admin installs and
// removes them, hands out the rights a package declares and chooses the AI model it uses.
import { apiFetch } from "@/lib/browser-navigation";
import { XenaxioApiError } from "@/lib/xenaxio/api";

export type Text = { de: string; en: string };
export interface Grant {
  all?: boolean;
  groups?: string[];
  users?: string[];
}
export interface PackageView {
  key: string;
  version: string;
  name: Text;
  description: Text;
  rights: { key: string; name: Text; description?: Text }[];
  types: string[];
  web: boolean;
  tools: boolean;
  models: boolean;
  installed: boolean;
  installedAt: string | null;
  grants: Record<string, Grant>;
  model: { mode: "company" | "own"; baseUrl?: string; model?: string; hasKey?: boolean };
}

async function call<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method,
    credentials: "same-origin",
    headers: { Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(method !== "GET" ? { "x-xenaxio-csrf": "1" } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 204) return {} as T;
  const data = (await res.json().catch(() => ({}))) as { error?: string; details?: Record<string, unknown> };
  if (!res.ok) throw new XenaxioApiError(res.status, data.error ?? "unknown", data.details);
  return data as T;
}

const seg = encodeURIComponent;
export const packagesApi = {
  list: () => call<{ packages: PackageView[] }>("GET", "/api/admin/packages"),
  install: (key: string) => call<PackageView>("POST", `/api/admin/packages/${seg(key)}/install`),
  remove: (key: string) => call<Record<string, never>>("DELETE", `/api/admin/packages/${seg(key)}`),
  setGrants: (key: string, grants: Record<string, Grant>) => call<PackageView>("PUT", `/api/admin/packages/${seg(key)}/grants`, { grants }),
  setModel: (key: string, body: { mode: "company" } | { mode: "own"; baseUrl: string; model: string; key?: string }) => call<PackageView>("PUT", `/api/admin/packages/${seg(key)}/model`, body),
};
