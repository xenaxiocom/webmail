// xenaxio step 90, part D: the company admin and the employees' files — who
// uses how much space, their folders, opening and saving a file, deleting.
// Every look, download and delete is in the company's audit log; the employee
// is told about a delete by e-mail.
import { apiFetch, withBasePath } from "@/lib/browser-navigation";
import { XenaxioApiError } from "@/lib/xenaxio/api";

export interface AdminPerson {
  id: string;
  name: string;
  email: string;
  /** Mail and files together; null when the mail server cannot tell. */
  usedBytes: number | null;
}

export interface AdminFileNode {
  id: string;
  name: string;
  parentId: string | null;
  folder: boolean;
  size: number;
  type: string | null;
  modified: string | null;
}

export interface AdminFolder {
  person: { id: string; name: string; email: string };
  path: { id: string; name: string }[];
  items: AdminFileNode[];
  totalBytes: number;
  truncated: boolean;
}

const FILES = "/api/admin/files";

async function call<T>(method: "GET" | "DELETE", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(path, {
      method,
      credentials: "same-origin",
      headers: { Accept: "application/json", "x-xenaxio-csrf": "1", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new XenaxioApiError(0, "network");
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new XenaxioApiError(res.status, typeof data.error === "string" ? data.error : "internal", data.details as Record<string, unknown> | undefined);
  return data as T;
}

export const adminFiles = {
  people: () => call<{ people: AdminPerson[] }>("GET", `${FILES}/people`).then((r) => r.people),
  folder: (user: string, parent: string | null) =>
    call<AdminFolder>("GET", `${FILES}?user=${encodeURIComponent(user)}${parent ? `&parent=${encodeURIComponent(parent)}` : ""}`),
  /** Opens in the browser (pictures, PDF, text, sound, video) or saves the file. */
  downloadUrl: (user: string, id: string) => withBasePath(`${FILES}/download?user=${encodeURIComponent(user)}&id=${encodeURIComponent(id)}`),
  remove: (user: string, ids: string[]) => call<{ deleted: string[] }>("DELETE", FILES, { user, ids }),
};

const MB = 1024 * 1024;
/** "850 KB", "12 MB", "1.4 GB". */
export function formatSize(bytes: number, locale: string): string {
  if (bytes >= 1024 * MB) return `${(bytes / (1024 * MB)).toLocaleString(locale, { maximumFractionDigits: 1 })} GB`;
  if (bytes >= MB) return `${(bytes / MB).toLocaleString(locale, { maximumFractionDigits: bytes < 10 * MB ? 1 : 0 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString(locale)} KB`;
}
