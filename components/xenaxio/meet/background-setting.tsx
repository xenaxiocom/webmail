"use client";

// xenaxio step 117: the background behind one's own camera, in Settings →
// Account too (not only before entering and in the meeting). The same choice
// as there: kept in this browser; the camera starts only on "preview".
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { SettingsSection } from "@/components/settings/settings-section";
import { useXT } from "@/lib/xenaxio/i18n";
import { meet, type MeetBackground } from "@/lib/xenaxio/meet";
import { useMeetNavItem } from "@/lib/xenaxio/meet-nav";
import { backgroundsSupported } from "./background";
import { MeetLangProvider } from "./lang";

const Preview = dynamic(() => import("./background-preview").then((m) => m.Preview), { ssr: false });

/** Settings → Account: shown when the company has meetings on. */
export function MeetBackgroundSetting() {
  const t = useXT();
  const { visible } = useMeetNavItem();
  const supported = useMemo(backgroundsSupported, []);
  const [company, setCompany] = useState<MeetBackground | null | undefined>(undefined);
  useEffect(() => {
    if (!visible || !supported) return;
    let stop = false;
    meet
      .status()
      .then((s) => !stop && setCompany(s.background ?? null))
      .catch(() => !stop && setCompany(null));
    return () => {
      stop = true;
    };
  }, [visible, supported]);
  if (!visible) return null;
  return (
    <SettingsSection id="meeting-background" title={t("profile_settings.meeting_background_title")} description={t("profile_settings.meeting_background_intro")}>
      {!supported ? (
        <p className="text-sm text-muted-foreground">{t("profile_settings.meeting_background_unsupported")}</p>
      ) : company === undefined ? null : (
        <MeetLangProvider>
          <Preview company={company} />
        </MeetLangProvider>
      )}
    </SettingsSection>
  );
}
