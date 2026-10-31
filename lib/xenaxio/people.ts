// Step 105: the company's people with their profile, for the card outside the
// chat (mail, contacts, calendar). One request, kept five minutes; the own
// profile updates it at once. Only the Xenaxio build asks the platform.
import { useEffect } from "react";
import { create } from "zustand";
import { apiFetch } from "@/lib/browser-navigation";
import type { AvatarAnimation } from "@/lib/xenaxio/api";
import { XENAXIO_BFF } from "@/lib/xenaxio/bff";
import type { UserProfile } from "@/lib/xenaxio/chat/profile";

export interface CompanyPerson {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  avatarAnimation: AvatarAnimation | null;
  profile: UserProfile;
  /** The address in Rooms, when the company's chat knows the person. */
  chatAddress: string | null;
}

const TTL_MS = 5 * 60_000;
let loadedAt = 0;
let pending: Promise<void> | null = null;

interface PeopleState {
  /** By e-mail address in lower case. */
  people: Map<string, CompanyPerson>;
  load: (force?: boolean) => Promise<void>;
  /** The own profile or picture changed: the cards show it at once. */
  changed: (email: string | undefined, change: Partial<CompanyPerson>) => void;
}

export const usePeopleStore = create<PeopleState>((set) => ({
  people: new Map(),
  load: (force = false) => {
    if (!XENAXIO_BFF) return Promise.resolve();
    if (pending) return pending;
    if (!force && loadedAt && Date.now() - loadedAt < TTL_MS) return Promise.resolve();
    pending = (async () => {
      try {
        const res = await apiFetch("/api/people", { credentials: "same-origin", headers: { Accept: "application/json" } });
        if (!res.ok) return;
        const data = (await res.json()) as { people?: CompanyPerson[] };
        set({ people: new Map((data.people ?? []).map((p) => [p.email.toLowerCase(), p])) });
        loadedAt = Date.now();
      } catch {
        // Offline or signed out: the card stays as it was.
      } finally {
        pending = null;
      }
    })();
    return pending;
  },
  changed: (email, change) =>
    set((state) => {
      const key = email?.toLowerCase();
      const person = key ? state.people.get(key) : undefined;
      if (!key || !person) return {};
      const next = new Map(state.people);
      next.set(key, { ...person, ...change });
      return { people: next };
    }),
}));

/** A colleague of the own company by e-mail address (null: not one, or not known yet). */
export function useColleague(email: string | null | undefined): CompanyPerson | null {
  const key = email?.trim().toLowerCase() ?? "";
  const person = usePeopleStore((s) => (key ? (s.people.get(key) ?? null) : null));
  const load = usePeopleStore((s) => s.load);
  useEffect(() => {
    if (key) void load();
  }, [key, load]);
  return person;
}

/** Tests start from nothing. */
export function resetPeopleForTests(): void {
  loadedAt = 0;
  pending = null;
  usePeopleStore.setState({ people: new Map() });
}
