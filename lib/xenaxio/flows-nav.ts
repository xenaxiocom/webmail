// xenaxio step F1.1: the "Flows" entry of the navigation (rail, Mountain View
// top bar, phone bar): shown when the operator turned flows on for the company.
// Asked once per page load; the Flows page tells it again when it reads the status.
// Stage E2, part C: the entry counts the decisions waiting for me, asked again every two minutes.
import { useEffect } from "react";
import { create } from "zustand";
import { XENAXIO_BFF } from "@/lib/xenaxio/bff";
import { useXT } from "@/lib/xenaxio/i18n";
import { xenaxio } from "@/lib/xenaxio/api";

const WAITING_EVERY_MS = 120_000;

const useFlowsNavStore = create<{ enabled: boolean; asked: boolean; waiting: number; ask: () => void; countWaiting: () => void }>((set, get) => ({
  enabled: false,
  asked: false,
  waiting: 0,
  ask: () => {
    if (get().asked) return;
    set({ asked: true });
    void xenaxio.flows
      .status()
      .then((s) => {
        set({ enabled: s.enabled });
        if (s.enabled) get().countWaiting();
      })
      .catch(() => undefined);
  },
  countWaiting: () => {
    if (!get().enabled) return;
    void xenaxio.flows
      .tasks()
      .then((r) => set({ waiting: r.count }))
      .catch(() => undefined);
  },
}));

/** The Flows page read the status: the menu follows. */
export function setFlowsNavEnabled(enabled: boolean): void {
  useFlowsNavStore.setState({ enabled, asked: true });
}

/** The Flows page read the decisions waiting for me: the menu's number follows. */
export function setFlowsWaiting(waiting: number): void {
  useFlowsNavStore.setState({ waiting });
}

export function useFlowsNavItem(): { visible: boolean; label: string; badge: number } {
  const t = useXT();
  const enabled = useFlowsNavStore((s) => s.enabled);
  const waiting = useFlowsNavStore((s) => s.waiting);
  const ask = useFlowsNavStore((s) => s.ask);
  const countWaiting = useFlowsNavStore((s) => s.countWaiting);
  useEffect(() => {
    if (XENAXIO_BFF) ask();
  }, [ask]);
  useEffect(() => {
    if (!XENAXIO_BFF || !enabled) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") countWaiting();
    }, WAITING_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [enabled, countWaiting]);
  return { visible: XENAXIO_BFF && enabled, label: t("flows.nav"), badge: waiting };
}
