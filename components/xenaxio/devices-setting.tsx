"use client";

// Step 151 A: Settings → Account, the phones signed in to the Xenaxio app. Each one has its
// own sign-in and its own access to the mail; "Abmelden" ends that phone's only, the browsers
// and the other phones stay signed in. Shown once there is a phone.
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { SettingItem } from "@/components/settings/settings-section";
import { XENAXIO_BFF } from "@/lib/xenaxio/bff";
import { type MobileDevice, xenaxio } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";
import { toast } from "@/stores/toast-store";

export function XenaxioDevicesSetting() {
  return XENAXIO_BFF ? <Devices /> : null;
}

function Devices() {
  const t = useXT();
  const locale = useLocale();
  const [devices, setDevices] = useState<MobileDevice[] | null>(null);
  const [leaving, setLeaving] = useState<MobileDevice | null>(null);

  const load = useCallback(() => {
    xenaxio.mobileDevices().then((r) => setDevices(r.devices), () => setDevices([]));
  }, []);
  useEffect(load, [load]);

  if (!devices || devices.length === 0) return null;
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });

  const signOut = async (device: MobileDevice) => {
    setLeaving(null);
    try {
      await xenaxio.signOutMobileDevice(device.id);
      setDevices((list) => list?.filter((d) => d.id !== device.id) ?? null);
      toast.success(t("devices.signed_out", { name: device.name }));
    } catch {
      toast.error(t("devices.sign_out_failed"));
      load();
    }
  };

  return (
    <SettingItem label={t("devices.title")} description={t("devices.intro")}>
      <ul className="w-full space-y-2" data-testid="settings-devices">
        {devices.map((device) => (
          <li key={device.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{device.name || t(device.platform === "ios" ? "devices.iphone" : "devices.android")}</p>
              <p className="text-xs text-muted-foreground">
                {t(device.platform === "ios" ? "devices.iphone" : "devices.android")} · {t("devices.last_used", { date: date(device.lastSeenAt) })}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setLeaving(device)}>
              {t("devices.sign_out")}
            </Button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        isOpen={leaving !== null}
        onClose={() => setLeaving(null)}
        onConfirm={() => leaving && void signOut(leaving)}
        title={t("devices.sign_out")}
        message={t("devices.sign_out_text", { name: leaving?.name ?? "" })}
        confirmText={t("devices.sign_out")}
        variant="destructive"
      />
    </SettingItem>
  );
}
