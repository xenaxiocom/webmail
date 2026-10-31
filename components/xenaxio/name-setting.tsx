"use client";

// Step 101: the person's own name — in Settings → Account and in the own
// profile in Rooms (XenRooms too). The platform changes it everywhere: the
// portal, the colleagues' directory, the chat and the sender name of emails.
import { type FormEvent, useEffect, useState } from "react";
import { SettingItem } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorText, xenaxio } from "@/lib/xenaxio/api";
import { XENAXIO_BFF } from "@/lib/xenaxio/bff";
import { useChatStore } from "@/lib/xenaxio/chat/store";
import { useXT } from "@/lib/xenaxio/i18n";
import { useXenaxioMe, useXenaxioMeStore } from "@/lib/xenaxio/me-store";
import { useAccountStore } from "@/stores/account-store";
import { useAuthStore } from "@/stores/auth-store";

/** The longest name the platform takes. */
export const NAME_MAX = 100;

/** After a change: the menus, the account switcher, the sender name and the chat show it at once. */
function applyName(displayName: string): void {
  useXenaxioMeStore.setState((s) => (s.me ? { me: { ...s.me, user: { ...s.me.user, displayName } } } : s));
  const accounts = useAccountStore.getState();
  const account = accounts.activeAccountId ? accounts.getAccountById(accounts.activeAccountId) : undefined;
  if (account && account.displayName !== displayName) {
    accounts.updateAccount(account.id, { displayName, ...(!account.label || account.label === account.displayName ? { label: displayName } : {}) });
  }
  void useAuthStore.getState().refreshIdentities().catch(() => undefined);
  void useChatStore.getState().reloadColleagues();
}

/** A name field with its own save button; errors and the confirmation show next to it. */
export function NameForm({ initial, save, onSaved, id, compact = false }: { initial: string; save: (name: string) => Promise<string>; onSaved?: (name: string) => void; id?: string; compact?: boolean }) {
  const t = useXT();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  useEffect(() => setValue(initial), [initial]);
  const changed = value.replace(/\s+/g, " ").trim() !== initial && value.trim() !== "";
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!changed || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const name = await save(value);
      setValue(name);
      setNotice({ kind: "success", text: t("name.saved") });
      onSaved?.(name);
    } catch (err) {
      setNotice({ kind: "error", text: errorText(t, err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)} className={compact ? "space-y-1" : "space-y-1.5"}>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setNotice(null);
          }}
          maxLength={NAME_MAX}
          autoComplete="name"
          aria-label={t("name.label")}
          aria-invalid={notice?.kind === "error" ? true : undefined}
          className={compact ? "h-9" : undefined}
        />
        <Button type="submit" size="sm" variant={compact ? "default" : "outline"} disabled={!changed || busy} className={compact ? "h-9" : undefined} aria-label={t("name.save_aria")}>
          {t("name.save")}
        </Button>
      </div>
      {notice && <p className={notice.kind === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</p>}
    </form>
  );
}

/** Saves the own name and shows it everywhere at once. */
export async function saveMyName(name: string): Promise<string> {
  const { displayName } = await xenaxio.setMyName(name);
  applyName(displayName);
  return displayName;
}

function NameSetting() {
  const t = useXT();
  const me = useXenaxioMe();
  if (!me) return null;
  return (
    <SettingItem label={t("name.label")} description={t("name.intro")}>
      <NameForm initial={me.user.displayName} save={saveMyName} />
    </SettingItem>
  );
}

/** Settings → Account in the Xenaxio build; elsewhere the upstream field stays. */
export function XenaxioNameSetting() {
  return XENAXIO_BFF ? <NameSetting /> : null;
}
