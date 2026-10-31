"use client";

// Step 67: the left column of XenRooms — the companies this browser is signed
// in to, the open one marked, the others with a red count for mentions and
// direct messages (a dot for anything else unread). A click switches without a
// password; "+" adds a company. Our own design: rounded tiles with the
// company's logo or initials on its colour.
// Step 106, as in Slack: the order stays as the person left it (switching only
// marks another company, dragging moves them); the column can be hidden, and
// then — and always on a phone — the company button in the channel list opens
// the companies (a sheet from below on a phone, a menu on a computer).
import { closestCenter, DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IconGripVertical, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconLogout, IconPlus, IconSettings, IconSparkles } from "@tabler/icons-react";
import { useLocale } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useIsEmbedded } from "@/hooks/use-is-embedded";
import { useIsMobile } from "@/hooks/use-media-query";
import { withBasePath } from "@/lib/browser-navigation";
import { openAccount } from "@/lib/xenaxio/accounts";
import { type BrowserAccount, xenaxio } from "@/lib/xenaxio/api";
import { moveInOrder, orderAccounts, useChatLayout } from "@/lib/xenaxio/chat/layout";
import { useChatBadge } from "@/lib/xenaxio/chat/nav";
import { badgeText, companyInitials, useOtherCompaniesBadge, useRoomsStore } from "@/lib/xenaxio/chat/rooms";
import { useXT } from "@/lib/xenaxio/i18n";
import { useXenaxioMe } from "@/lib/xenaxio/me-store";
import { ROOMS_LOGO, ROOMS_NAME, roomsStart, usePortal } from "@/lib/xenaxio/portal";
import { cn } from "@/lib/utils";

const HEX = /^#[0-9a-f]{6}$/i;

type TileSize = "lg" | "md" | "sm";
const BOX: Record<TileSize, string> = { lg: "h-10 w-10 text-sm", md: "h-9 w-9 text-xs", sm: "h-7 w-7 text-[11px]" };

/** The company's logo or initials on its colour. */
function CompanyMark({ account, size }: { account: BrowserAccount; size: TileSize }) {
  const [broken, setBroken] = useState(false);
  const color = account.color && HEX.test(account.color) ? account.color : null;
  return (
    <span
      className={cn("flex flex-shrink-0 items-center justify-center overflow-hidden rounded-xl font-semibold", BOX[size], !color && "bg-muted text-foreground")}
      style={color ? { background: color, color: "#fff" } : undefined}
    >
      {account.logoUrl && !broken ? (
        <img src={withBasePath(account.logoUrl)} alt="" className="h-full w-full bg-white object-contain p-0.5" onError={() => setBroken(true)} />
      ) : (
        companyInitials(account.company)
      )}
    </span>
  );
}

/** A red count, or a dot for anything else unread. */
function Badge({ important, unread, ring = "ring-secondary", small = false }: { important: number; unread: boolean; ring?: string; small?: boolean }) {
  if (important > 0)
    return (
      <span
        className={cn(
          "absolute flex items-center justify-center rounded-full bg-red-600 font-bold leading-none text-white ring-2",
          small ? "-right-2 -top-2 h-4 min-w-4 px-0.5 text-[9px]" : "-right-1.5 -top-1.5 h-[18px] min-w-[18px] px-1 text-[10px]",
          ring,
        )}
      >
        {badgeText(important)}
      </span>
    );
  if (unread) return <span className={cn("absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-foreground ring-2", ring)} />;
  return null;
}

/** The companies of this browser in the person's order; the order is kept when companies come or go. */
export function useOrderedCompanies(): BrowserAccount[] {
  const accounts = useRoomsStore((s) => s.accounts);
  const order = useChatLayout((s) => s.companyOrder);
  const setOrder = useChatLayout((s) => s.setCompanyOrder);
  const ordered = useMemo(() => orderAccounts(accounts, order), [accounts, order]);
  useEffect(() => {
    if (accounts.length === 0) return;
    const ids = ordered.map((a) => a.userId);
    if (ids.join() !== order.join()) setOrder(ids);
  }, [accounts.length, ordered, order, setOrder]);
  return ordered;
}

/** What the column, the menu and the sheet share: the companies and what can be done with them. */
function useCompanies() {
  const t = useXT();
  const locale = useLocale();
  const me = useXenaxioMe();
  const accounts = useOrderedCompanies();
  const max = useRoomsStore((s) => s.max);
  const unread = useRoomsStore((s) => s.unread);
  const ownBadge = useChatBadge();
  const order = useChatLayout((s) => s.companyOrder);
  const setOrder = useChatLayout((s) => s.setCompanyOrder);
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
  const move = (dragId: string, overId: string) => {
    const next = moveInOrder(order, dragId, overId);
    if (next) setOrder(next);
  };
  const company = me?.tenant.name ?? "";
  // Administration stays in Xenaxio (the company's portal), in a new tab.
  // Step 96: a company without email is managed right here; others in their Xenaxio portal.
  const roomsOnly = me?.tenant.product === "rooms";
  const adminUrl = me?.user.role !== "admin" ? null : roomsOnly ? withBasePath(`/${locale}/workspace/rooms/people/`) : me.portal?.url ? `${me.portal.url}/${locale}/workspace/` : null;
  const adminTarget = roomsOnly ? {} : { target: "_blank", rel: "noopener" };
  const adminLabel = t(roomsOnly ? "rooms.admin_here" : "rooms.admin");
  // Step 96: someone without a mailbox connects AI chats (Claude …) here too; others in Xenaxio.
  const aiUrl = me?.user.kind === "chat" ? withBasePath(`/${locale}/workspace/mcp/`) : null;

  const countsOf = (account: BrowserAccount) => {
    const counts = unread[account.userId];
    return { important: account.active ? ownBadge : (counts?.important ?? 0), unread: !account.active && !!counts?.unread };
  };
  const labelOf = (account: BrowserAccount) => {
    if (account.active) return t("rooms.current", { company: account.company, email: account.email });
    const { important, unread: any } = countsOf(account);
    return `${t("rooms.switch_to", { company: account.company, email: account.email })}${important > 0 ? ` – ${t("rooms.unread_important", { count: important })}` : any ? ` – ${t("rooms.unread_any")}` : ""}`;
  };
  return { t, accounts, max, canAdd: accounts.length < max, switchTo, add, signOut, move, company, adminUrl, adminTarget, adminLabel, aiUrl, countsOf, labelOf };
}

/** A few pixels before a drag starts, so a click still switches; `keyboard` for the handles (a tile's Enter switches). */
function useDragSensors(keyboard: boolean) {
  const pointer = useSensor(PointerSensor, { activationConstraint: { distance: 4 } });
  const keys = useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates });
  return useSensors(pointer, ...(keyboard ? [keys] : []));
}

/** A tile of the column: click switches, dragging moves it. */
function RailTile({ account, important, unread, label, onClick }: { account: BrowserAccount; important: number; unread: boolean; label: string; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: account.userId });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-current={account.active ? "true" : undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid="rooms-tile"
      className={cn(
        "relative flex-shrink-0 touch-none rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        account.active ? "ring-2 ring-primary ring-offset-2 ring-offset-secondary" : "opacity-80 hover:opacity-100",
        isDragging && "z-10 opacity-100 shadow-lg",
      )}
    >
      <CompanyMark account={account} size="lg" />
      <Badge important={important} unread={unread} />
    </button>
  );
}

/** The column of companies on a computer. */
export function RoomsRail() {
  const c = useCompanies();
  const setRailHidden = useChatLayout((s) => s.setRailHidden);
  const sensors = useDragSensors(false);
  const onDragEnd = (e: DragEndEvent) => e.over && c.move(String(e.active.id), String(e.over.id));
  const icon = "rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground";

  return (
    <nav aria-label={c.t("rooms.companies")} className="flex h-full w-[68px] flex-shrink-0 flex-col items-center gap-3 bg-secondary py-3" style={{ borderRight: "1px solid rgba(128, 128, 128, 0.3)" }}>
      <img src={withBasePath(ROOMS_LOGO)} alt={ROOMS_NAME} title={ROOMS_NAME} className="h-8 w-8 rounded-lg" />
      <div className="h-px w-8 bg-border" />
      <div className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto px-2 pt-1.5">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={c.accounts.map((a) => a.userId)} strategy={verticalListSortingStrategy}>
            {c.accounts.map((account) => (
              <RailTile key={account.userId} account={account} {...c.countsOf(account)} label={c.labelOf(account)} onClick={() => void c.switchTo(account)} />
            ))}
          </SortableContext>
        </DndContext>
        <button
          type="button"
          onClick={c.add}
          disabled={!c.canAdd}
          title={c.canAdd ? c.t("rooms.add_company") : c.t("rooms.too_many", { max: c.max })}
          aria-label={c.t("rooms.add_company")}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-dashed border-muted-foreground/50 text-muted-foreground transition hover:border-foreground hover:text-foreground disabled:opacity-40"
        >
          <IconPlus size={18} />
        </button>
      </div>
      {c.aiUrl && (
        <a href={c.aiUrl} title={c.t("workspace.mcp")} aria-label={c.t("workspace.mcp")} className={icon}>
          <IconSparkles size={20} />
        </a>
      )}
      {c.adminUrl && (
        <a href={c.adminUrl} {...c.adminTarget} title={c.adminLabel} aria-label={c.adminLabel} className={icon}>
          <IconSettings size={20} />
        </a>
      )}
      <button type="button" onClick={() => void c.signOut()} title={c.t("rooms.sign_out", { company: c.company })} aria-label={c.t("rooms.sign_out", { company: c.company })} className={icon}>
        <IconLogout size={20} />
      </button>
      <button type="button" onClick={() => setRailHidden(true)} title={c.t("rooms.hide_companies")} aria-label={c.t("rooms.hide_companies")} className={icon} data-testid="rooms-hide">
        <IconLayoutSidebarLeftCollapse size={20} />
      </button>
    </nav>
  );
}

/** A company in the menu or the sheet: the handle moves it, the rest switches. */
function CompanyRow({ account, important, unread, label, index, onClick }: { account: BrowserAccount; important: number; unread: boolean; label: string; index: number; onClick: () => void }) {
  const t = useXT();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: account.userId });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("rounded-lg", isDragging && "relative z-10 bg-popover shadow-lg ring-1 ring-border")} data-testid="rooms-company">
      <div className={cn("flex items-center gap-1 rounded-lg", account.active && "bg-primary/10")}>
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t("rooms.move_company", { company: account.company, n: index + 1 })}
          className="flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <IconGripVertical size={16} />
        </button>
        <button type="button" onClick={onClick} aria-label={label} aria-current={account.active ? "true" : undefined} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1.5 pr-2 text-left hover:bg-accent">
          <span className={cn("relative rounded-xl", account.active && "ring-2 ring-primary ring-offset-2 ring-offset-popover")}>
            <CompanyMark account={account} size="md" />
            <Badge important={important} unread={unread} ring="ring-popover" />
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-sm", account.active || important > 0 || unread ? "font-semibold" : "font-medium")}>{account.company}</span>
            <span className="block truncate text-xs text-muted-foreground">{account.email}</span>
          </span>
        </button>
      </div>
    </li>
  );
}

/** The companies as a sheet from below (phone) or a menu under the company button (computer). */
function CompaniesMenu({ sheet, onClose }: { sheet: boolean; onClose: () => void }) {
  const c = useCompanies();
  const setRailHidden = useChatLayout((s) => s.setRailHidden);
  const sensors = useDragSensors(true);
  const onDragEnd = (e: DragEndEvent) => e.over && c.move(String(e.active.id), String(e.over.id));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const item = "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-accent disabled:opacity-40";
  return (
    <div className={cn("fixed inset-0 z-50 flex", sheet ? "items-end bg-black/40" : "items-start")} onClick={(e) => e.target === e.currentTarget && onClose()} data-testid="rooms-menu-backdrop">
      <div
        role="dialog"
        aria-label={c.t("rooms.companies")}
        className={cn(
          "flex max-h-[85dvh] flex-col bg-popover text-popover-foreground shadow-lg",
          sheet ? "w-full rounded-t-xl border-t border-border pb-[max(0.5rem,env(safe-area-inset-bottom))]" : "ml-2 mt-14 w-80 rounded-xl border border-border",
        )}
      >
        {sheet && <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden />}
        <div className="flex shrink-0 items-center gap-2 px-4 pb-1 pt-3">
          <h2 className="flex-1 text-base font-bold">{c.t("rooms.companies")}</h2>
          {c.accounts.length > 1 && <span className="text-xs text-muted-foreground">{c.t("rooms.order_hint")}</span>}
        </div>
        <div className="min-h-0 overflow-y-auto px-2 py-1">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={c.accounts.map((a) => a.userId)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-0.5">
                {c.accounts.map((account, i) => (
                  <CompanyRow
                    key={account.userId}
                    account={account}
                    {...c.countsOf(account)}
                    label={c.labelOf(account)}
                    index={i}
                    onClick={() => {
                      if (account.active) onClose();
                      else void c.switchTo(account);
                    }}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          <button type="button" onClick={c.add} disabled={!c.canAdd} title={c.canAdd ? undefined : c.t("rooms.too_many", { max: c.max })} className={cn(item, "mt-0.5 pl-11")}>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-dashed border-muted-foreground/50 text-muted-foreground">
              <IconPlus size={16} />
            </span>
            {c.t("rooms.add_company")}
          </button>
        </div>
        <div className="shrink-0 border-t border-border px-2 py-1">
          {c.aiUrl && (
            <a href={c.aiUrl} className={item}>
              <IconSparkles size={18} className="text-muted-foreground" />
              {c.t("workspace.mcp")}
            </a>
          )}
          {c.adminUrl && (
            <a href={c.adminUrl} {...c.adminTarget} className={item}>
              <IconSettings size={18} className="text-muted-foreground" />
              {c.adminLabel}
            </a>
          )}
          {!sheet && (
            <button
              type="button"
              onClick={() => {
                setRailHidden(false);
                onClose();
              }}
              className={item}
            >
              <IconLayoutSidebarLeftExpand size={18} className="text-muted-foreground" />
              {c.t("rooms.show_companies")}
            </button>
          )}
          <button type="button" onClick={() => void c.signOut()} className={item}>
            <IconLogout size={18} className="text-muted-foreground" />
            {c.t("rooms.sign_out", { company: c.company })}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The open company's mark with the others' count; opens the companies. Shown
 * in the channel list on a phone and when the column is hidden; with `name`
 * the company's name is part of the button, as in Slack.
 */
export function CompanyButton({ name }: { name?: string }) {
  const t = useXT();
  const isMobile = useIsMobile();
  const accounts = useRoomsStore((s) => s.accounts);
  const others = useOtherCompaniesBadge();
  const anyUnread = useRoomsStore((s) => Object.values(s.unread).some((u) => u.unread > 0));
  const [open, setOpen] = useState(false);
  const active = accounts.find((a) => a.active);
  if (!active) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t("rooms.companies")}
        aria-label={`${t("rooms.companies")}${others > 0 ? ` – ${t("rooms.unread_important", { count: others })}` : anyUnread ? ` – ${t("rooms.unread_any")}` : ""}`}
        aria-haspopup="dialog"
        className={cn("flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", name ? "min-w-0 flex-1 py-1 pr-1 text-left hover:bg-accent" : "shrink-0")}
        data-testid="rooms-company-button"
      >
        <span className="relative shrink-0">
          <CompanyMark account={active} size="sm" />
          <Badge important={others} unread={anyUnread} small />
        </span>
        {name && (
          <span className="min-w-0 flex-1 truncate text-base font-bold" title={name}>
            {name}
          </span>
        )}
      </button>
      {open && <CompaniesMenu sheet={isMobile} onClose={() => setOpen(false)} />}
    </>
  );
}

/** XenRooms without its column (a phone, or hidden): the companies open from the company button. */
export function useCompanyButtonShown(): boolean {
  const portal = usePortal();
  const isMobile = useIsMobile();
  const isEmbedded = useIsEmbedded();
  const railHidden = useChatLayout((s) => s.railHidden);
  return portal?.kind === "rooms" && !isEmbedded && (isMobile || railHidden);
}
