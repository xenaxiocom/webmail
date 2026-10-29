// xenaxio step 78: the "Meetings" entry of the navigation (rail, Mountain View
// top bar, phone bar): shown when the company has meetings on. Asked once per
// page load; the admin's switch and the Meetings page tell it again at once.
import { useEffect } from "react";
import { create } from "zustand";
import { XENAXIO_BFF } from "@/lib/xenaxio/bff";
import { useXT } from "@/lib/xenaxio/i18n";
import { meet } from "@/lib/xenaxio/meet";

const useMeetNavStore = create<{ enabled: boolean; webinars: boolean; asked: boolean; ask: () => void }>((set, get) => ({
  enabled: false,
  // Step 79, part D: whether the operator allows webinars (the calendar offers one then).
  webinars: false,
  asked: false,
  ask: () => {
    if (get().asked) return;
    set({ asked: true });
    void meet
      .status()
      .then((s) => set({ enabled: s.enabled, webinars: !!s.webinars }))
      .catch(() => undefined);
  },
}));

/** Meetings were turned on or off (the admin's switch, or the Meetings page read the status): the menu follows. */
export function setMeetNavEnabled(enabled: boolean, webinars?: boolean): void {
  useMeetNavStore.setState({ enabled, asked: true, ...(webinars === undefined ? {} : { webinars }) });
}

export function useMeetNavItem(): { visible: boolean; label: string; webinars: boolean } {
  const t = useXT();
  const enabled = useMeetNavStore((s) => s.enabled);
  const webinars = useMeetNavStore((s) => s.webinars);
  const ask = useMeetNavStore((s) => s.ask);
  useEffect(() => {
    if (XENAXIO_BFF) ask();
  }, [ask]);
  return { visible: XENAXIO_BFF && enabled, label: t("meet.nav"), webinars: XENAXIO_BFF && enabled && webinars };
}
