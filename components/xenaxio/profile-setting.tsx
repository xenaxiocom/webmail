"use client";

// Step 105: one profile for Xenaxio and XenRooms. Settings → Account shows
// the same form as the chat's "Edit profile" (job title, contacts, banner,
// frame) and the way to the own password; saving updates the chat and the
// colleagues' cards at once.
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { SettingItem, SettingsSection } from "@/components/settings/settings-section";
import { ProfileForm } from "@/components/xenaxio/chat/profile";
import { XENAXIO_BFF } from "@/lib/xenaxio/bff";
import { loadProfile, type UserProfile } from "@/lib/xenaxio/chat/profile";
import { useChatStore } from "@/lib/xenaxio/chat/store";
import { useXT } from "@/lib/xenaxio/i18n";
import { useXenaxioMe } from "@/lib/xenaxio/me-store";
import { usePeopleStore } from "@/lib/xenaxio/people";

/** The chat's colleagues' list (when the chat was open) shows the own profile at once. */
function tellChat(email: string, profile: UserProfile): void {
  const chat = useChatStore.getState();
  for (const c of chat.colleagues.values()) if (c.email.toLowerCase() === email.toLowerCase()) chat.setProfile(c.address, profile);
}

function ProfileSection() {
  const t = useXT();
  const me = useXenaxioMe();
  const [initial, setInitial] = useState<UserProfile | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadProfile()
      .then((p) => !cancelled && setInitial(p))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);
  if (!me) return null;
  return (
    <SettingsSection id="xenaxio-profile" title={t("profile_settings.title")} description={t("profile_settings.intro")}>
      {failed ? (
        <p className="text-sm text-destructive" role="alert">
          {t("profile_settings.load_failed")}
        </p>
      ) : initial ? (
        <div className="max-w-2xl py-2" data-testid="settings-profile-form">
          <ProfileForm
            initial={initial}
            showPicture={false}
            onChange={(p) => {
              tellChat(me.user.email, p);
              usePeopleStore.getState().changed(me.user.email, { profile: p });
            }}
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("profile_settings.loading")}</p>
      )}
    </SettingsSection>
  );
}

/** Settings → Account: the profile (Xenaxio build only). */
export function XenaxioProfileSetting() {
  return XENAXIO_BFF ? <ProfileSection /> : null;
}

/** Settings → Account: the own password (Xenaxio build only; also people without a mailbox). */
export function XenaxioPasswordSetting() {
  const t = useXT();
  if (!XENAXIO_BFF) return null;
  return (
    <SettingItem label={t("password.setting_label")} description={t("password.setting_intro")}>
      <Link href="/workspace/password" className="text-sm font-medium text-primary hover:underline" data-testid="settings-password-link">
        {t("workspace.password")}
      </Link>
    </SettingItem>
  );
}
