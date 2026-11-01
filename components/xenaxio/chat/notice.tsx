"use client";

// The chat's full-page notices (loading, setting up, off). Step 112: on
// XenRooms they keep the company button, and the admin turns Rooms on here.
import { useState } from "react";
import { xenaxio } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";
import { toast } from "@/stores/toast-store";
import { CompanyButton, useCompanyButtonShown } from "./rooms-rail";

export function Notice({ title, text, children }: { title: string; text?: string; children?: React.ReactNode }) {
  // Step 112: on XenRooms without the companies' column (a phone, or hidden) the
  // company button stays, so a company without Rooms is never a dead end.
  const companies = useCompanyButtonShown();
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {companies && (
        <div className="flex shrink-0 items-center px-3 pt-3">
          <CompanyButton />
        </div>
      )}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h1 className="text-lg font-semibold">{title}</h1>
          {text && <p className="mt-2 text-sm text-muted-foreground">{text}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

/** Step 112: Rooms is off (the admin turned it off, or its start failed); the admin turns it on right here. */
export function ChatOffNotice({ admin, onEnabled }: { admin: boolean; onEnabled: () => void }) {
  const t = useXT();
  const [busy, setBusy] = useState(false);
  const enable = async () => {
    setBusy(true);
    try {
      await xenaxio.setChatAdmin(true);
      onEnabled();
    } catch {
      toast.error(t("chat.enable_failed"));
    } finally {
      setBusy(false);
    }
  };
  if (!admin) return <Notice title={t("chat.unavailable_title")} text={t("chat.unavailable_text")} />;
  return (
    <Notice title={t("chat.unavailable_title")} text={t("chat.unavailable_admin")}>
      <button
        type="button"
        onClick={() => void enable()}
        disabled={busy}
        className="mt-4 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {busy ? t("chat.enabling") : t("chat.enable")}
      </button>
    </Notice>
  );
}
