// Step 106: the chat's side columns, as in Slack. The channel list folds away
// with an icon in its header (Ctrl/Cmd+Shift+D); XenRooms' column of companies
// can be hidden too, and on a phone the companies open in a sheet. The order of
// the companies stays as the person left it: switching only marks another one,
// dragging moves them. All of it is how this device shows the chat, kept in
// this browser (like the set of accounts itself), not a setting.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface ChatLayoutState {
  /** The channel list is folded away (computer and tablet; a phone shows one pane at a time). */
  sidebarHidden: boolean;
  /** XenRooms: the column of companies is hidden; the company button in the channel list opens them. */
  railHidden: boolean;
  /** XenRooms: the companies' user ids in the person's order. */
  companyOrder: string[];
  toggleSidebar: () => void;
  setSidebarHidden: (hidden: boolean) => void;
  setRailHidden: (hidden: boolean) => void;
  setCompanyOrder: (order: string[]) => void;
}

export const useChatLayout = create<ChatLayoutState>()(
  persist(
    (set) => ({
      sidebarHidden: false,
      railHidden: false,
      companyOrder: [],
      toggleSidebar: () => set((s) => ({ sidebarHidden: !s.sidebarHidden })),
      setSidebarHidden: (sidebarHidden) => set({ sidebarHidden }),
      setRailHidden: (railHidden) => set({ railHidden }),
      setCompanyOrder: (companyOrder) => set({ companyOrder }),
    }),
    {
      name: "xenaxio-chat-layout",
      version: 1,
      // Private mode or blocked storage: zustand keeps the defaults, nothing is remembered.
      storage: createJSONStorage(() => window.localStorage),
      partialize: (s) => ({ sidebarHidden: s.sidebarHidden, railHidden: s.railHidden, companyOrder: s.companyOrder }),
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
