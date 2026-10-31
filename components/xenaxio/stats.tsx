"use client";

// Step 103: visitor statistics of the apps (lib/xenaxio/stats.ts). Loads
// Umami's script when this address has statistics and tells it, once known,
// what the visit is counted under: the company and product, never the person.
import { useEffect } from "react";
import { useXenaxioMeStore } from "@/lib/xenaxio/me-store";
import { usePortal } from "@/lib/xenaxio/portal";
import { appKind, sessionData, startStats, statsSession } from "@/lib/xenaxio/stats";

export function AppStats() {
  const portal = usePortal();
  const me = useXenaxioMeStore((s) => s.me);
  const loadedAt = useXenaxioMeStore((s) => s.loadedAt);
  const load = useXenaxioMeStore((s) => s.load);
  const config = portal && "stats" in portal ? portal.stats : undefined;

  useEffect(() => {
    if (!config) return;
    startStats(portal);
    // Signed in or a guest: /api/me says (the shared store, loaded once).
    void load();
  }, [config, portal, load]);

  useEffect(() => {
    if (!config || !loadedAt) return;
    statsSession(sessionData(config, me, appKind(window)));
  }, [config, me, loadedAt]);

  return null;
}
