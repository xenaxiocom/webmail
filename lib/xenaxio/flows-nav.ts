// xenaxio step F1.1: the "Flows" entry of the navigation (rail, Mountain View
// top bar, phone bar): shown when the operator turned flows on for the company.
// Asked once per page load; the Flows page tells it again when it reads the status.
import { useEffect } from "react";
import { create } from "zustand";
import { XENAXIO_BFF } from "@/lib/xenaxio/bff";
import { useXT } from "@/lib/xenaxio/i18n";
import { xenaxio } from "@/lib/xenaxio/api";

const useFlowsNavStore = create<{ enabled: boolean; asked: boolean; ask: () => void }>((set, get) => ({
  enabled: false,
  asked: false,
  ask: () => {
    if (get().asked) return;
    set({ asked: true });
    void xenaxio.flows
      .status()
      .then((s) => set({ enabled: s.enabled }))
      .catch(() => undefined);
  },
}));

/** The Flows page read the status: the menu follows. */
export function setFlowsNavEnabled(enabled: boolean): void {
  useFlowsNavStore.setState({ enabled, asked: true });
}

export function useFlowsNavItem(): { visible: boolean; label: string } {
  const t = useXT();
  const enabled = useFlowsNavStore((s) => s.enabled);
  const ask = useFlowsNavStore((s) => s.ask);
  useEffect(() => {
    if (XENAXIO_BFF) ask();
  }, [ask]);
  return { visible: XENAXIO_BFF && enabled, label: t("flows.nav") };
}
