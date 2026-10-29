// xenaxio step 78: the "Meetings" entry of the navigation (rail, Mountain View
// top bar, phone bar): shown when the company has meetings on. Asked once per
// page load.
import { useEffect } from "react";
import { create } from "zustand";
import { XENAXIO_BFF } from "@/lib/xenaxio/bff";
import { useXT } from "@/lib/xenaxio/i18n";
import { meet } from "@/lib/xenaxio/meet";

const useMeetNavStore = create<{ enabled: boolean; asked: boolean; ask: () => void }>((set, get) => ({
  enabled: false,
  asked: false,
  ask: () => {
    if (get().asked) return;
    set({ asked: true });
    void meet
      .status()
      .then((s) => set({ enabled: s.enabled }))
      .catch(() => undefined);
  },
}));

export function useMeetNavItem(): { visible: boolean; label: string } {
  const t = useXT();
  const enabled = useMeetNavStore((s) => s.enabled);
  const ask = useMeetNavStore((s) => s.ask);
  useEffect(() => {
    if (XENAXIO_BFF) ask();
  }, [ask]);
  return { visible: XENAXIO_BFF && enabled, label: t("meet.nav") };
}
