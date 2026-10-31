"use client";

// Step 67: the left column of XenRooms — the companies this browser is signed
// in to, the open one marked, the others with a red count for mentions and
// direct messages (a dot for anything else unread). A click switches without a
// password; "+" adds a company. Our own design: rounded tiles with the
// company's logo or initials on its colour.
import { IconLogout, IconPlus, IconSettings } from "@tabler/icons-react";
import { useLocale } from "next-intl";
import { useState } from "react";
import { withBasePath } from "@/lib/browser-navigation";
import { openAccount } from "@/lib/xenaxio/accounts";
import { type BrowserAccount, xenaxio } from "@/lib/xenaxio/api";
import { useChatBadge } from "@/lib/xenaxio/chat/nav";
import { badgeText, companyInitials, useRoomsAccounts, useRoomsStore } from "@/lib/xenaxio/chat/rooms";
import { useXT } from "@/lib/xenaxio/i18n";
import { useXenaxioMe } from "@/lib/xenaxio/me-store";
import { ROOMS_LOGO, ROOMS_NAME, roomsStart } from "@/lib/xenaxio/portal";
import { cn } from "@/lib/utils";

const HEX = /^#[0-9a-f]{6}$/i;

function Tile({ account, important, unread, size, onClick, label }: { account: BrowserAccount; important: number; unread: boolean; size: "lg" | "sm"; onClick?: () => void; label: string }) {
  const [broken, setBroken] = useState(false);
  const color = account.color && HEX.test(account.color) ? account.color : null;
  const box = size === "lg" ? "h-10 w-10 text-sm" : "h-8 w-8 text-xs";
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-current={account.active ? "true" : undefined}
      className={cn(
        "relative flex-shrink-0 rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        account.active ? "ring-2 ring-primary ring-offset-2 ring-offset-secondary" : "opacity-80 hover:opacity-100",
      )}
    >
      <span
        className={cn("flex items-center justify-center overflow-hidden rounded-xl font-semibold", box, !color && "bg-muted text-foreground")}
        style={color ? { background: color, color: "#fff" } : undefined}
      >
        {account.logoUrl && !broken ? (
          <img src={withBasePath(account.logoUrl)} alt="" className="h-full w-full bg-white object-contain p-0.5" onError={() => setBroken(true)} />
        ) : (
          companyInitials(account.company)
        )}
      </span>
      {important > 0 ? (
        <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-secondary">
          {badgeText(important)}
        </span>
      ) : unread ? (
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-foreground ring-2 ring-secondary" />
      ) : null}
    </button>
  );
}

/** The companies of this browser; `horizontal` for the phone (a row above the chat). */
export function RoomsRail({ horizontal = false }: { horizontal?: boolean }) {
  const t = useXT();
  const locale = useLocale();
  const me = useXenaxioMe();
  const accounts = useRoomsStore((s) => s.accounts);
  const max = useRoomsStore((s) => s.max);
  const unread = useRoomsStore((s) => s.unread);
  const ownBadge = useChatBadge();
  useRoomsAccounts(true);
  const start = roomsStart(locale);

  const switchTo = async (account: BrowserAccount) => {
    if (account.active) return;
    try {
      openAccount((await xenaxio.switchAccount(account.userId, start)).url);
    } catch {
      window.location.reload();
    }
  };
  const add = () => window.location.assign(withBasePath(`/${locale}/login/?mode=add-account&next=${encodeURIComponent(start)}`));
  const signOut = async () => {
    const res = await xenaxio.logout({ next: start }).catch(() => null);
    if (res?.url) openAccount(res.url);
    else window.location.assign(withBasePath(`/${locale}/login/`));
  };
  const company = me?.tenant.name ?? "";
  // Administration stays in Xenaxio (the company's portal), in a new tab.
  const adminUrl = me?.user.role === "admin" && me.portal?.url ? `${me.portal.url}/${locale}/workspace/` : null;

  const tiles = accounts.map((account) => {
    const counts = unread[account.userId];
    const important = account.active ? ownBadge : (counts?.important ?? 0);
    const label = account.active
      ? t("rooms.current", { company: account.company, email: account.email })
      : `${t("rooms.switch_to", { company: account.company, email: account.email })}${important > 0 ? ` – ${t("rooms.unread_important", { count: important })}` : counts?.unread ? ` – ${t("rooms.unread_any")}` : ""}`;
    return (
      <Tile
        key={account.userId}
        account={account}
        important={important}
        unread={!account.active && !!counts?.unread}
        size={horizontal ? "sm" : "lg"}
        onClick={() => void switchTo(account)}
        label={label}
      />
    );
  });
  const canAdd = accounts.length < max;
  const addButton = (
    <button
      type="button"
      onClick={add}
      disabled={!canAdd}
      title={canAdd ? t("rooms.add_company") : t("rooms.too_many", { max })}
      aria-label={t("rooms.add_company")}
      className={cn(
        "flex flex-shrink-0 items-center justify-center rounded-xl border border-dashed border-muted-foreground/50 text-muted-foreground transition hover:border-foreground hover:text-foreground disabled:opacity-40",
        horizontal ? "h-8 w-8" : "h-10 w-10",
      )}
    >
      <IconPlus size={horizontal ? 16 : 18} />
    </button>
  );

  if (horizontal) {
    return (
      <nav aria-label={t("rooms.companies")} className="flex items-center gap-3 overflow-x-auto border-b border-border bg-secondary px-3 py-2">
        {tiles}
        {addButton}
        <div className="ml-auto flex items-center gap-1">
          {adminUrl && (
            <a href={adminUrl} target="_blank" rel="noopener" title={t("rooms.admin")} aria-label={t("rooms.admin")} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <IconSettings size={18} />
            </a>
          )}
          <button type="button" onClick={() => void signOut()} title={t("rooms.sign_out", { company })} aria-label={t("rooms.sign_out", { company })} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <IconLogout size={18} />
          </button>
        </div>
      </nav>
    );
  }

  return (
    <nav aria-label={t("rooms.companies")} className="flex h-full w-[68px] flex-shrink-0 flex-col items-center gap-3 bg-secondary py-3" style={{ borderRight: "1px solid rgba(128, 128, 128, 0.3)" }}>
      <img src={withBasePath(ROOMS_LOGO)} alt={ROOMS_NAME} title={ROOMS_NAME} className="h-8 w-8 rounded-lg" />
      <div className="h-px w-8 bg-border" />
      <div className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto px-2 pt-1.5">
        {tiles}
        {addButton}
      </div>
      {adminUrl && (
        <a href={adminUrl} target="_blank" rel="noopener" title={t("rooms.admin")} aria-label={t("rooms.admin")} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
          <IconSettings size={20} />
        </a>
      )}
      <button type="button" onClick={() => void signOut()} title={t("rooms.sign_out", { company })} aria-label={t("rooms.sign_out", { company })} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
        <IconLogout size={20} />
      </button>
    </nav>
  );
}
