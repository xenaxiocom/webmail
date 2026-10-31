// Step 99, part G: a colleague's profile in Rooms — job title, department,
// phone, "about me", pronouns, other contacts (links built here from handles)
// and the look of the card (banner and frame, as in Discord).
import { apiFetch } from "@/lib/browser-navigation";

export const CONTACT_KINDS = ["telegram", "whatsapp", "signal", "linkedin", "x", "github", "website", "phone"] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];
export const BANNERS = ["none", "sky", "sunset", "forest", "ocean", "berry", "graphite", "gold"] as const;
export const FRAMES = ["none", "ring", "gold", "rainbow", "leaf", "neon"] as const;

export interface UserProfile {
  title: string | null;
  department: string | null;
  phone: string | null;
  about: string | null;
  pronouns: string | null;
  contacts: { kind: ContactKind; value: string }[];
  banner: (typeof BANNERS)[number];
  frame: (typeof FRAMES)[number];
}

export const EMPTY_PROFILE: UserProfile = { title: null, department: null, phone: null, about: null, pronouns: null, contacts: [], banner: "none", frame: "none" };

/** Banners: our own gradients only. */
export const BANNER_STYLE: Record<UserProfile["banner"], string> = {
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

export async function saveProfile(p: UserProfile): Promise<UserProfile> {
  const res = await apiFetch("/api/profile", { method: "PUT", credentials: "same-origin", headers: { Accept: "application/json", "Content-Type": "application/json", "x-xenaxio-csrf": "1" }, body: JSON.stringify(p) });
  if (!res.ok) throw new Error(`profile ${res.status}`);
  return (await res.json()) as UserProfile;
}
