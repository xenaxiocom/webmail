// Step 67: XenRooms — the team chat on its own address (xenrooms.app), one app
// for all of a person's companies. The accounts of the browser are on the
// left; the others' unread counts come from the platform every half minute,
// so a message from another company is never missed (also on the app icon).
import { useCallback, useEffect } from "react";
import { create } from "zustand";
import { type AccountUnread, type BrowserAccount, xenaxio } from "@/lib/xenaxio/api";

/** How often the other companies' counts are asked for while the page is visible. */
export const UNREAD_POLL_MS = 30_000;

interface RoomsState {
  accounts: BrowserAccount[];
  max: number;
  unread: Record<string, AccountUnread>;
  setAccounts: (accounts: BrowserAccount[], max: number) => void;
  setUnread: (list: AccountUnread[]) => void;
}

export const useRoomsStore = create<RoomsState>((set) => ({
  accounts: [],
  max: 5,
  unread: {},
  setAccounts: (accounts, max) => set({ accounts, max }),
  setUnread: (list) => set({ unread: Object.fromEntries(list.map((u) => [u.userId, u])) }),
}));

/** Mentions and direct messages in the other companies (for the app icon). */
export function useOtherCompaniesBadge(): number {
  return useRoomsStore((s) => Object.values(s.unread).reduce((n, u) => n + u.important, 0));
}

/** Two letters for a company without a logo: "Acme GmbH" → "AG", "botkontor" → "BO". */
export function companyInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
  return (words[0] ?? "?").slice(0, 2).toUpperCase();
}

/** A readable count for a small badge. */
export function badgeText(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/** Loads the accounts once and the others' counts now, every half minute and when the window comes back. */
export function useRoomsAccounts(enabled: boolean): () => Promise<void> {
  const setAccounts = useRoomsStore((s) => s.setAccounts);
  const setUnread = useRoomsStore((s) => s.setUnread);

  const refresh = useCallback(async () => {
    const list = await xenaxio.accountsUnread().catch(() => null);
    if (list) setUnread(list.accounts);
  }, [setUnread]);

  useEffect(() => {
    if (!enabled) return;
    void xenaxio
      .accounts()
      .then((r) => setAccounts(r.accounts, r.max))
      .catch(() => undefined);
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, UNREAD_POLL_MS);
    const onShow = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
    };
  }, [enabled, refresh, setAccounts]);

  return refresh;
}
