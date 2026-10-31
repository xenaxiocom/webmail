"use client";

// Step 106: the channel list folds away as in Slack — an icon in its header,
// and while it is folded an icon at the start of the conversation's header
// brings it back (Ctrl/Cmd+Shift+D does both). A phone shows one pane at a
// time, so there is nothing to fold there.
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from "@tabler/icons-react";
import { useIsMobile } from "@/hooks/use-media-query";
import { useChatLayout } from "@/lib/xenaxio/chat/layout";
import { useXT } from "@/lib/xenaxio/i18n";
import { cn } from "@/lib/utils";
import { CompanyButton, useCompanyButtonShown } from "./rooms-rail";

const ICON = "shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground";

/** In the channel list's header: folds the list away. */
export function SidebarCollapseButton() {
  const t = useXT();
  const isMobile = useIsMobile();
  const setHidden = useChatLayout((s) => s.setSidebarHidden);
  if (isMobile) return null;
  return (
    <button type="button" onClick={() => setHidden(true)} className={ICON} title={`${t("chat.sidebar_hide")} (Ctrl Shift D)`} aria-label={t("chat.sidebar_hide")} data-testid="chat-sidebar-hide">
      <IconLayoutSidebarLeftCollapse size={18} />
    </button>
  );
}

/**
 * At the start of a header in the middle while the list is folded: brings it
 * back; on XenRooms with the companies' column hidden too, the company button
 * stays reachable here.
 */
export function SidebarExpandButton({ className }: { className?: string }) {
  const t = useXT();
  const isMobile = useIsMobile();
  const hidden = useChatLayout((s) => s.sidebarHidden);
  const setHidden = useChatLayout((s) => s.setSidebarHidden);
  const companies = useCompanyButtonShown();
  if (isMobile || !hidden) return null;
  return (
    <span className={cn("flex shrink-0 items-center gap-1.5", className)}>
      <button type="button" onClick={() => setHidden(false)} className={ICON} title={`${t("chat.sidebar_show")} (Ctrl Shift D)`} aria-label={t("chat.sidebar_show")} data-testid="chat-sidebar-show">
        <IconLayoutSidebarLeftExpand size={18} />
      </button>
      {companies && <CompanyButton />}
    </span>
  );
}
