'use client';

import { PluginSlot } from '@/components/plugins/plugin-slot';
import { OrgAnnouncement } from '@/components/org/org-announcement';
import { OfflineBanner } from '@/components/offline/offline-banner';
import { ImpersonationReturnBar } from '@/components/impersonation/impersonation-return-bar';
import { useIsEmbedded } from '@/hooks/use-is-embedded';
import { useImpersonationReturn } from '@/hooks/use-impersonation-return';
import { useAccountStore } from '@/stores/account-store';
import { useAuthStore } from '@/stores/auth-store';
import { XenaxioDomainBanner } from '@/components/xenaxio/domain-banner';
import { XenaxioDemoStrip } from '@/components/xenaxio/demo-strip';
import { XENAXIO_BFF } from '@/lib/xenaxio/bff';

/**
 * Mounts the `app-top-banner` plugin slot with the current session's
 * username, serverUrl and whether an admin opened it through an
 * impersonation handoff (`impersonated`). Drop this at the top of every
 * authenticated page so plugins like impersonation-notice render
 * everywhere, not just on the mail page. The organisation's announcement
 * (Organisation > Notices) shows here too, above the plugins' banners,
 * except inside the Pro shell, which shows it once across all its panes.
 * The same goes for the way back from an impersonation (#1538), which a
 * plugin may draw in its own banner instead (`canReturn`).
 */
export function AppTopBannerSlot() {
  const username = useAuthStore((s) => s.username);
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const embedded = useIsEmbedded();
  const impersonated = useAccountStore(
    (s) => s.accounts.find((a) => a.id === s.activeAccountId)?.impersonated === true,
  );
  // Whether the server holds the session the impersonation started from:
  // a plugin with auth:impersonation-return draws "Return to my account"
  // and calls api.user.returnToOwnAccount().
  const canReturn = useImpersonationReturn().available;
  return (
    <>
      {/* xenaxio: "domain not connected" notice on every app page. */}
      {XENAXIO_BFF && <XenaxioDomainBanner />}
      {/* xenaxio step 73: a live-demo guest's time and the ways on. */}
      {XENAXIO_BFF && <XenaxioDemoStrip />}
      {!embedded && <OrgAnnouncement />}
      {!embedded && <OfflineBanner />}
      {!embedded && <ImpersonationReturnBar />}
      <PluginSlot name="app-top-banner" extraProps={{ username, serverUrl, impersonated, canReturn }} />
    </>
  );
}
