// Step 106: the chat's side columns, as in Slack. The channel list folds away
// with an icon in its header (Ctrl/Cmd+Shift+D); XenRooms' column of companies
// can be hidden too, and on a phone the companies open in a sheet. The order of
// the companies stays as the person left it: switching only marks another one,
// dragging moves them. The folded columns are how this device shows the chat,
// kept in this browser. Step 152 R1d: the order of the companies is kept on the
// platform too (lib/xenaxio/company-order.ts), so the XenRooms phone app shows the
// same; this browser's copy carries when it changed, the newer one wins.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface ChatLayoutState {
  /** The channel list is folded away (computer and tablet; a phone shows one pane at a time). */
  sidebarHidden: boolean;
  /** XenRooms: the column of companies is hidden; the company button in the channel list opens them. */
  railHidden: boolean;
  /** XenRooms: the companies' user ids in the person's order. */
  companyOrder: string[];
  /** When the person last changed the order (ms); 0 for the order made from the platform's list. */
  companyOrderAt: number;
  toggleSidebar: () => void;
  setSidebarHidden: (hidden: boolean) => void;
  setRailHidden: (hidden: boolean) => void;
  /** `at`: when the person chose it (dragging: now); omitted for a merely completed list. */
  setCompanyOrder: (order: string[], at?: number) => void;
}

export const useChatLayout = create<ChatLayoutState>()(
  persist(
    (set) => ({
      sidebarHidden: false,
      railHidden: false,
      companyOrder: [],
      companyOrderAt: 0,
      toggleSidebar: () => set((s) => ({ sidebarHidden: !s.sidebarHidden })),
      setSidebarHidden: (sidebarHidden) => set({ sidebarHidden }),
      setRailHidden: (railHidden) => set({ railHidden }),
      setCompanyOrder: (companyOrder, at) => set((s) => ({ companyOrder, companyOrderAt: at ?? s.companyOrderAt })),
    }),
    {
      name: "xenaxio-chat-layout",
      version: 1,
      // Private mode or blocked storage: zustand keeps the defaults, nothing is remembered.
      storage: createJSONStorage(() => window.localStorage),
      partialize: (s) => ({ sidebarHidden: s.sidebarHidden, railHidden: s.railHidden, companyOrder: s.companyOrder, companyOrderAt: s.companyOrderAt }),
    },
  ),
);

/**
 * The accounts in the person's order: the known ones where they were put, new
 * ones (just added, or from before step 106) after them in the platform's
 * order. Which account is active never moves it.
 */
export function orderAccounts<T extends { userId: string }>(accounts: T[], order: string[]): T[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  const known = accounts.filter((a) => rank.has(a.userId)).sort((a, b) => rank.get(a.userId)! - rank.get(b.userId)!);
  return [...known, ...accounts.filter((a) => !rank.has(a.userId))];
}

/** The order after dragging `dragId` onto `overId`'s place; null when nothing moves. */
export function moveInOrder(order: string[], dragId: string, overId: string): string[] | null {
  if (dragId === overId) return null;
  const from = order.indexOf(dragId);
  const to = order.indexOf(overId);
  if (from < 0 || to < 0) return null;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, dragId);
  return next;
}

/** Ctrl/Cmd+Shift+D, as in Slack: shows or hides the channel list. */
export function isSidebarShortcut(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">): boolean {
  return (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === "d";
}
