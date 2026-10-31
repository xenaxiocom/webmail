// Step 99, part G: a colleague's profile in Rooms — job title, department,
// phone, "about me", pronouns, other contacts (links built here from handles)
// and the look of the card (banner and frame, as in Discord).
import { apiFetch } from "@/lib/browser-navigation";
import { type BannerImage, XenaxioApiError } from "@/lib/xenaxio/api";

export const CONTACT_KINDS = ["telegram", "whatsapp", "signal", "linkedin", "x", "github", "website", "phone"] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];
export const BANNERS = ["none", "sky", "sunset", "forest", "ocean", "berry", "graphite", "gold"] as const;
/** Step 104: `custom` — the person's own uploaded picture (`bannerImage`). */
export type BannerChoice = (typeof BANNERS)[number] | "custom";
export const FRAMES = ["none", "ring", "gold", "rainbow", "leaf", "neon"] as const;

export interface UserProfile {
  title: string | null;
  department: string | null;
  phone: string | null;
  about: string | null;
  pronouns: string | null;
  contacts: { kind: ContactKind; value: string }[];
  banner: BannerChoice;
  frame: (typeof FRAMES)[number];
  /** Step 104: the uploaded banner picture (read-only in the form; sent through /api/me/banner). */
  bannerImage?: BannerImage | null;
}

export const EMPTY_PROFILE: UserProfile = { title: null, department: null, phone: null, about: null, pronouns: null, contacts: [], banner: "none", frame: "none", bannerImage: null };

/** Banners: our own gradients (and, step 104, the own picture, drawn apart). */
export const BANNER_STYLE: Record<(typeof BANNERS)[number], string> = {
  none: "",
  sky: "linear-gradient(135deg, #38bdf8, #6366f1)",
  sunset: "linear-gradient(135deg, #f97316, #db2777)",
  forest: "linear-gradient(135deg, #16a34a, #065f46)",
  ocean: "linear-gradient(135deg, #0ea5e9, #0f766e)",
  berry: "linear-gradient(135deg, #a855f7, #be185d)",
  graphite: "linear-gradient(135deg, #475569, #0f172a)",
  gold: "linear-gradient(135deg, #facc15, #b45309)",
};

/** Frames around the picture. */
export const FRAME_STYLE: Record<UserProfile["frame"], string> = {
  none: "",
  ring: "ring-2 ring-primary ring-offset-2 ring-offset-background",
  gold: "ring-4 ring-amber-400 ring-offset-2 ring-offset-background",
  rainbow: "p-[3px] bg-[conic-gradient(#f43f5e,#f59e0b,#22c55e,#3b82f6,#a855f7,#f43f5e)]",
  leaf: "ring-4 ring-emerald-500 ring-offset-2 ring-offset-background",
  neon: "ring-2 ring-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.9)]",
};

const digits = (v: string) => v.replace(/[^\d+]/g, "");

/**
 * Step 104: the platform's rules for a contact (services/profiles.ts,
 * `validContact`), so the form marks the wrong field before saving.
 */
export function validContact(c: { kind: ContactKind; value: string }): boolean {
  const v = c.value.trim();
  switch (c.kind) {
    case "telegram":
      return /^@?[A-Za-z0-9_]{4,32}$/.test(v) || /^https:\/\/t\.me\/[A-Za-z0-9_]{4,32}$/.test(v);
    case "whatsapp":
    case "signal":
    case "phone":
      return /^[+()\d\s/.-]{5,40}$/.test(v);
    case "x":
      return /^@?[A-Za-z0-9_]{1,15}$/.test(v) || /^https:\/\/\S+$/.test(v);
    case "github":
      return /^@?[A-Za-z0-9-]{1,39}$/.test(v) || /^https:\/\/\S+$/.test(v);
    case "linkedin":
    case "website":
      return /^https:\/\/[^\s<>"']+$/.test(v) || (c.kind === "linkedin" && /^[A-Za-z0-9-]{3,100}$/.test(v));
  }
}

/** The phone field: digits, spaces, + ( ) / . - (as the platform checks it). */
export function validPhone(v: string | null): boolean {
  return !v?.trim() || /^[+()\d\s/.-]{3,40}$/.test(v.trim());
}

/** A contact as a link (null when it is not a safe one). */
export function contactLink(c: { kind: ContactKind; value: string }): string | null {
  const v = c.value.trim();
  const handle = v.replace(/^@/, "");
  switch (c.kind) {
    case "telegram":
      return /^https:\/\/t\.me\/[A-Za-z0-9_]{4,32}$/.test(v) ? v : /^[A-Za-z0-9_]{4,32}$/.test(handle) ? `https://t.me/${handle}` : null;
    case "whatsapp": {
      const n = digits(v).replace(/^\+/, "");
      return /^\d{5,20}$/.test(n) ? `https://wa.me/${n}` : null;
    }
    case "signal": {
      const n = digits(v);
      return /^\+?\d{5,20}$/.test(n) ? `https://signal.me/#p/${n.startsWith("+") ? n : `+${n}`}` : null;
    }
    case "phone": {
      const n = digits(v);
      return /^\+?\d{3,20}$/.test(n) ? `tel:${n}` : null;
    }
    case "x":
      return /^https:\/\/\S+$/.test(v) ? v : /^[A-Za-z0-9_]{1,15}$/.test(handle) ? `https://x.com/${handle}` : null;
    case "github":
      return /^https:\/\/\S+$/.test(v) ? v : /^[A-Za-z0-9-]{1,39}$/.test(handle) ? `https://github.com/${handle}` : null;
    case "linkedin":
      return /^https:\/\/\S+$/.test(v) ? v : /^[A-Za-z0-9-]{3,100}$/.test(v) ? `https://www.linkedin.com/in/${v}` : null;
    case "website":
      return /^https:\/\/[^\s<>"']+$/.test(v) ? v : null;
  }
}

/**
 * Saves the profile (without the read-only picture). A refusal comes back as
 * XenaxioApiError with `issues` naming the fields (`contacts.1.value`).
 */
export async function saveProfile(p: UserProfile): Promise<UserProfile> {
  const { bannerImage: _picture, ...body } = p;
  let res: Response;
  try {
    res = await apiFetch("/api/profile", { method: "PUT", credentials: "same-origin", headers: { Accept: "application/json", "Content-Type": "application/json", "x-xenaxio-csrf": "1" }, body: JSON.stringify(body) });
  } catch {
    throw new XenaxioApiError(0, "network");
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new XenaxioApiError(res.status, typeof data.error === "string" ? data.error : "internal", undefined, data.issues as { path: string; message: string }[] | undefined);
  return data as unknown as UserProfile;
}
