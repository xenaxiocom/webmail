"use client";

// Step 107: the same settings in Xenaxio and XenRooms. On XenRooms
// (xenrooms.app) the page has the companies' column instead of the mail
// navigation and no calendar, contacts or files pages (XenRooms has none);
// mail is set up right here. A person without a mailbox (XenRooms company)
// has no mail session: Account (name, picture, sign-in address, password,
// profile), General and Appearance.
import { SettingItem, SettingsSection } from "@/components/settings/settings-section";
import { XenaxioNameSetting } from "@/components/xenaxio/name-setting";
import { ProfilePictureSetting } from "@/components/xenaxio/profile-picture-setting";
import { XenaxioPasswordSetting, XenaxioProfileSetting } from "@/components/xenaxio/profile-setting";
import { XENAXIO_BFF } from "@/lib/xenaxio/bff";
import { useXT } from "@/lib/xenaxio/i18n";
import { useXenaxioMe } from "@/lib/xenaxio/me-store";
import { usePortal } from "@/lib/xenaxio/portal";

export interface SettingsScope {
  /** On the XenRooms address: the companies' column, back to the chat. */
  rooms: boolean;
  /** A person without a mailbox: no mail session, only the pages that need none. */
  chatOnly: boolean;
}

/** Pages a person without a mailbox has (no mail session behind them). */
export const CHAT_ONLY_TABS: readonly string[] = ["account", "general", "appearance"];
/** Groups of pages XenRooms leaves out: calendar, contacts, files and add-ons are not part of it. */
export const ROOMS_HIDDEN_GROUPS: readonly string[] = ["apps"];

export function useXenaxioSettingsScope(): SettingsScope {
  const portal = usePortal();
  const me = useXenaxioMe();
  if (!XENAXIO_BFF) return { rooms: false, chatOnly: false };
  return { rooms: portal?.kind === "rooms", chatOnly: me?.user.kind === "chat" };
}

/** The settings' tabs for this person and address (the upstream list otherwise). */
export function scopeTabs<T extends { id: string; group: string }>(tabs: T[], scope: SettingsScope): T[] {
  if (scope.chatOnly) return tabs.filter((tab) => CHAT_ONLY_TABS.includes(tab.id));
  if (scope.rooms) return tabs.filter((tab) => !ROOMS_HIDDEN_GROUPS.includes(tab.group));
  return tabs;
}

/** Settings → Account of a person without a mailbox. */
export function ChatOnlyAccountSettings() {
  const t = useXT();
  const me = useXenaxioMe();
  if (!me) return null;
  return (
    <div className="space-y-8">
      <SettingsSection id="profile" title={t("profile_settings.account_title")} description={t("profile_settings.account_intro")}>
        <XenaxioNameSetting />
        <ProfilePictureSetting />
        <SettingItem label={t("profile_settings.sign_in_email")}>
          <span className="text-sm text-foreground">{me.user.email}</span>
        </SettingItem>
        <XenaxioPasswordSetting />
      </SettingsSection>
      <XenaxioProfileSetting />
    </div>
  );
}
