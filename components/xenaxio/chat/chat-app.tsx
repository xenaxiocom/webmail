"use client";

// Step 43, part B: the "Chat" section of the web client, next to mail,
// calendar and files. The frame (navigation rail, Mountain View top bar, the
// phone's bottom bar) is the same as in the other sections; inside it the
// chat looks like Slack: channels on the left, the conversation in the middle,
// threads, members and profiles on the right.
import { IconArrowLeft } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { InlineAppView } from "@/components/layout/inline-app-view";
import { MvTopBar } from "@/components/layout/mv-top-bar";
import { NavigationRail } from "@/components/layout/navigation-rail";
import { SidebarAppsModal } from "@/components/layout/sidebar-apps-modal";
import { AppTopBannerSlot } from "@/components/plugins/app-top-banner-slot";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useIsEmbedded } from "@/hooks/use-is-embedded";
import { useIsMobile } from "@/hooks/use-media-query";
import { useMountainViewShell } from "@/hooks/use-mountain-view-shell";
import { useSidebarApps } from "@/hooks/use-sidebar-apps";
import { useChatBadge } from "@/lib/xenaxio/chat/nav";
import { usePortal } from "@/lib/xenaxio/portal";
import { useChatStore } from "@/lib/xenaxio/chat/store";
import { useXT } from "@/lib/xenaxio/i18n";
import { useXenaxioMe } from "@/lib/xenaxio/me-store";
import { xenaxio, XenaxioApiError } from "@/lib/xenaxio/api";
import { redirectToLogin, saveRedirectAfterLogin, useAuthStore } from "@/stores/auth-store";
import { useEmailStore } from "@/stores/email-store";
import { toast } from "@/stores/toast-store";
import { cn } from "@/lib/utils";
import { ChatDialogsProvider, CreateChannelDialog, PeoplePicker, QuickSwitcher } from "./dialogs";
import { NotifySettingsDialog, PushBanner, useChatNotifyLoader } from "./notifications";
import { RoomView } from "./room-view";
import { ChatSidePanel } from "./side-panels";
import { RoomsRail } from "./rooms-rail";
import { ChatOffNotice, Notice } from "./notice";
import { tellChatWorker } from "@/lib/xenaxio/chat/push";
import { openAccount } from "@/lib/xenaxio/accounts";
import { ChatSidebar } from "./sidebar";
import { BrowseView, DraftsView, HomeView, MentionsView, SavedView, SearchView, ThreadsView } from "./views";
import { LaterView, useLaterLoader } from "./later";
import { CatchUpView } from "./channel-extras";
import { useExtrasLoader } from "@/lib/xenaxio/chat/extras";
import { isSidebarShortcut, useChatLayout } from "@/lib/xenaxio/chat/layout";
import { useRoomsAccounts } from "@/lib/xenaxio/chat/rooms";
// Step 99: colours of highlighted code in messages and snippets.
import "./code.css";
// Step 109: a channel's background (room-view.tsx).
import "./room-background.css";

const STATUS_POLL_MS = 5000;

/** Step 67: opens a message of another account of this browser (XenRooms): switch, then the chat there. */
async function openAs(account: string, roomId: string, eventId?: string): Promise<void> {
  const q = new URLSearchParams({ room: roomId, ...(eventId ? { event: eventId } : {}) });
  try {
    const { url } = await xenaxio.switchAccount(account, `${window.location.pathname}?${q}`);
    openAccount(url);
  } catch {
    // Signed out there meanwhile: stay with the open company.
  }
}

function ChatInside() {
  const t = useXT();
  const isMobile = useIsMobile();
  const me = useXenaxioMe();
  const status = useChatStore((s) => s.status);
  const statusError = useChatStore((s) => s.statusError);
  const client = useChatStore((s) => s.client);
  useChatStore((s) => s.version);
  const view = useChatStore((s) => s.view);
  const panel = useChatStore((s) => s.panel);
  const focus = useChatStore((s) => s.focus);
  const setView = useChatStore((s) => s.setView);
  const setPanel = useChatStore((s) => s.setPanel);
  const setFocus = useChatStore((s) => s.setFocus);
  const loadStatus = useChatStore((s) => s.loadStatus);
  const connect = useChatStore((s) => s.connect);
  const [dialog, setDialog] = useState<"jump" | "create" | "dm" | "notify" | null>(null);
  // Step 106: the channel list folds away (not on a phone: one pane at a time there).
  const sidebarHidden = useChatLayout((s) => s.sidebarHidden) && !isMobile;
  const toggleSidebar = useChatLayout((s) => s.toggleSidebar);
  useChatNotifyLoader(!!client?.ready);
  // Step 99, part E2: reminders and messages sent later.
  useLaterLoader(!!client?.ready);
  // Step 99, part H: calls going on in rooms, groups to mention, the company's emoji.
  useExtrasLoader(!!client?.ready, () => (client ? [...client.rooms.values()].filter((r) => r.membership === "join" && r.kind !== "space").map((r) => r.id) : []));

  useEffect(() => {
    void loadStatus(true).then(() => connect());
  }, [loadStatus, connect]);

  // While the server is being set up, ask again every few seconds.
  useEffect(() => {
    if (status?.enabled || (status && status.state !== "provisioning" && status.state !== "active")) return;
    const timer = setInterval(
      () =>
        void loadStatus(true).then((s) => {
          if (s?.enabled) void connect();
        }),
      STATUS_POLL_MS,
    );
    return () => clearInterval(timer);
  }, [status, loadStatus, connect]);

  // Step 67: the worker shows the other companies' notifications even while this one is open.
  useEffect(() => {
    if (me?.user.id) void tellChatWorker(me.user.id).catch(() => undefined);
  }, [me?.user.id, client?.ready]);

  // A link to a message (?room=…&event=…) opens it; step 67: `as` is the account it belongs to.
  useEffect(() => {
    if (!client?.ready) return;
    const q = new URLSearchParams(window.location.search);
    const room = q.get("room");
    const as = q.get("as");
    if (as && me && as !== me.user.id && room) {
      void openAs(as, room, q.get("event") ?? undefined);
      return;
    }
    // Step 107: "Message in Rooms" on a colleague's card (mail, contacts, calendar) opens the direct conversation.
    const dm = q.get("dm");
    if (!room && dm?.startsWith("@") && dm !== client.userId) {
      window.history.replaceState(null, "", window.location.pathname);
      void client
        .openDirect([dm])
        .then((roomId) => setView({ kind: "room", roomId }))
        .catch(() => toast.error(t("chat.error")));
      return;
    }
    if (!room) return;
    setView({ kind: "room", roomId: room });
    const event = q.get("event");
    if (event) setFocus({ roomId: room, eventId: event });
    window.history.replaceState(null, "", window.location.pathname);
  }, [client, client?.ready, setView, setFocus, me, t]);

  // A click on a chat notification while the chat is open: switch the channel, no reload.
  // Step 67: on XenRooms another company's notification switches to that company first.
  useEffect(() => {
    if (!client?.ready || !("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { kind?: string; roomId?: string; eventId?: string; account?: string } | null;
      if (data?.kind !== "xenaxio-chat-open" || !data.roomId) return;
      if (data.account && me && data.account !== me.user.id) {
        void openAs(data.account, data.roomId, data.eventId);
        return;
      }
      setView({ kind: "room", roomId: data.roomId });
      setPanel(null);
      if (data.eventId) setFocus({ roomId: data.roomId, eventId: data.eventId });
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    navigator.serviceWorker.startMessages();
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [client?.ready, setView, setPanel, setFocus, me]);

  // Focus is used once.
  useEffect(() => {
    if (!focus) return;
    const timer = setTimeout(() => setFocus(null), 4000);
    return () => clearTimeout(timer);
  }, [focus, setFocus]);

  const openRoom = useCallback(
    (roomId: string) => {
      setView({ kind: "room", roomId });
      setPanel(null);
    },
    [setView, setPanel],
  );

  // Shortcuts: Ctrl/Cmd+K jump, Alt+↑/↓ previous/next channel, Esc mark read.
  useEffect(() => {
    if (!client) return;
    const onKey = (e: KeyboardEvent) => {
      if (isSidebarShortcut(e) && !isMobile) {
        e.preventDefault();
        toggleSidebar();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setDialog("jump");
        return;
      }
      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const list = [...client.rooms.values()].filter((r) => r.membership === "join" && r.kind !== "space");
        const ordered = [...list.filter((r) => r.kind === "channel").sort((a, b) => client.roomName(a).localeCompare(client.roomName(b))), ...list.filter((r) => r.kind === "dm").sort((a, b) => b.lastTs - a.lastTs)];
        const current = view.kind === "room" ? ordered.findIndex((r) => r.id === view.roomId) : -1;
        const next = ordered[(current + (e.key === "ArrowDown" ? 1 : -1) + ordered.length) % ordered.length];
        if (next) openRoom(next.id);
        return;
      }
      if (e.key === "Escape" && view.kind === "room" && !document.querySelector("[role=dialog]")) void client.markRead(view.roomId);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [client, view, openRoom, isMobile, toggleSidebar]);

  if (!status && !statusError) return <Notice title={t("chat.loading")} />;
  if (statusError && !status) return <Notice title={t("chat.error")} />;
  if (status && !status.enabled) {
    if (status.state === "provisioning" || status.state === "active") return <Notice title={t("chat.starting_title")} text={t("chat.starting_text")} />;
    return <ChatOffNotice admin={me?.user.role === "admin"} onEnabled={() => void loadStatus(true)} />;
  }
  if (!client || !client.ready) {
    return <Notice title={client?.signedOut ? t("chat.signed_out") : t("chat.loading")} />;
  }
  if (client.signedOut) return <Notice title={t("chat.signed_out")} />;

  const room = view.kind === "room" ? client.rooms.get(view.roomId) : undefined;
  let main: React.ReactNode;
  if (view.kind === "room") main = room && room.membership === "join" ? <RoomView key={room.id} client={client} room={room} focusId={focus?.roomId === room.id ? focus.eventId : null} /> : <HomeView />;
  else if (view.kind === "threads") main = <ThreadsView client={client} />;
  else if (view.kind === "mentions") main = <MentionsView client={client} />;
  else if (view.kind === "saved") main = <SavedView client={client} />;
  else if (view.kind === "drafts") main = <DraftsView client={client} />;
  else if (view.kind === "later") main = <LaterView client={client} />;
  else if (view.kind === "catchup") main = <CatchUpView client={client} />;
  else if (view.kind === "browse") main = <BrowseView client={client} onCreate={() => setDialog("create")} />;
  else if (view.kind === "search") main = <SearchView client={client} query={view.query} />;
  else main = <HomeView />;

  const sidebar = (
    <ChatSidebar
      client={client}
      companyName={me?.tenant.name ?? t("chat.title")}
      onJump={() => setDialog("jump")}
      onCreateChannel={() => setDialog("create")}
      onNewMessage={() => setDialog("dm")}
      onNotify={() => setDialog("notify")}
    />
  );

  // On a phone one pane at a time: the list, a conversation, or the side panel.
  // Every pane is min-w-0: without it a long channel name, link or code line
  // widened the whole chat past the screen and pushed "Send" off it (Android).
  const back = (
    <button type="button" onClick={() => (panel ? setPanel(null) : setView({ kind: "home" }))} className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-3 text-sm text-primary">
      <IconArrowLeft size={16} />
      {panel ? client.roomName(client.rooms.get(view.kind === "room" ? view.roomId : "") ?? ({ name: t("chat.title") } as never)) || t("chat.title") : t("chat.channels")}
    </button>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PushBanner />
      <div className="relative flex min-h-0 flex-1">
      {isMobile ? (
        panel ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {back}
            <ChatSidePanel client={client} panel={panel} />
          </div>
        ) : view.kind === "home" ? (
          sidebar
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {back}
            {main}
          </div>
        )
      ) : (
        <>
          {!sidebarHidden && sidebar}
          <main className="flex min-h-0 min-w-0 flex-1 flex-col">{main}</main>
          {/* Step 104: below 1024 px (iPad upright) the panel lies over the chat instead of squeezing it to nothing. */}
          {panel && <button type="button" aria-label={t("chat.close")} tabIndex={-1} onClick={() => setPanel(null)} className="absolute inset-0 z-20 bg-black/30 lg:hidden" data-testid="chat-panel-backdrop" />}
          {panel && (
            <div className="absolute inset-y-0 right-0 z-30 flex max-w-full shadow-2xl lg:static lg:z-auto lg:shadow-none">
              <ChatSidePanel client={client} panel={panel} />
            </div>
          )}
        </>
      )}
      {client.syncError && <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-1.5 text-xs text-background shadow">{t("chat.reconnecting")}</div>}
      {dialog === "jump" && (
        <QuickSwitcher
          client={client}
          onClose={() => setDialog(null)}
          onOpenRoom={openRoom}
          onOpenPerson={(userId) => void client.openDirect([userId]).then(openRoom).catch(() => toast.error(t("chat.error")))}
        />
      )}
      {dialog === "notify" && <NotifySettingsDialog client={client} onClose={() => setDialog(null)} />}
      {dialog === "create" && <CreateChannelDialog client={client} onClose={() => setDialog(null)} onCreated={openRoom} />}
      {dialog === "dm" && <PeoplePicker title={t("chat.dm_title")} action={t("chat.dm_start")} client={client} allowExternal onClose={() => setDialog(null)} onDone={async (ids) => openRoom(await client.openDirect(ids))} />}
      </div>
    </div>
  );
}

export function ChatApp() {
  const t = useXT();
  const badge = useChatBadge();
  useDocumentTitle(badge > 0 ? `(${badge}) ${t("chat.title")}` : t("chat.title"));
  const { logout, checkAuth } = useAuthStore();
  const { quota, isPushConnected } = useEmailStore();
  const { showAppsModal, inlineApp, loadedApps, handleManageApps, handleInlineApp, closeInlineApp, closeAppsModal } = useSidebarApps();
  const [signedIn, setSignedIn] = useState(false);
  const isMobile = useIsMobile();
  const isEmbedded = useIsEmbedded();
  // Step 67: on XenRooms (xenrooms.app) the chat stands alone: the companies on
  // the left instead of mail, calendar and files.
  const portal = usePortal();
  const rooms = portal?.kind === "rooms";
  const mvShell = useMountainViewShell(isEmbedded) && !rooms;
  // Step 106: the companies' column can be hidden; on a phone they open in a sheet from the channel list.
  const railHidden = useChatLayout((s) => s.railHidden);
  // Step 67: the companies and the others' unread counts, wherever they are shown.
  useRoomsAccounts(rooms && !isEmbedded && signedIn);

  // The chat needs only the platform session, not the mail connection (so it
  // also works on its own later); the mail session loads in the background for
  // the navigation.
  useEffect(() => {
    if (!portal) return;
    let cancelled = false;
    xenaxio
      .me()
      .then(() => !cancelled && setSignedIn(true))
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof XenaxioApiError && err.status === 401) {
          saveRedirectAfterLogin();
          redirectToLogin();
        } else setSignedIn(true);
      });
    if (!rooms && !useAuthStore.getState().isAuthenticated) void checkAuth().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [checkAuth, portal, rooms]);

  if (!signedIn) return null;

  return (
    <div data-app-shell="" className={cn("flex flex-col overflow-hidden pt-[env(safe-area-inset-top)]", mvShell ? "bg-[var(--mv-canvas)]" : "bg-background", isEmbedded ? "h-full" : "h-dvh")}>
      <AppTopBannerSlot />
      {mvShell && <MvTopBar showMenuButton={false} onManageApps={handleManageApps} onInlineApp={handleInlineApp} onCloseInlineApp={closeInlineApp} activeAppId={inlineApp?.id ?? null} />}
      <div data-mv-card={mvShell ? "" : undefined} className={cn("flex min-h-0 flex-1 overflow-hidden", mvShell && "mx-4 mb-4 bg-background")}>
        {rooms && !isEmbedded && !isMobile && !railHidden && <RoomsRail />}
        {!rooms && !isMobile && !isEmbedded && !mvShell && (
          <div data-app-rail="" className="flex w-14 flex-shrink-0 flex-col bg-secondary" style={{ borderRight: "1px solid rgba(128, 128, 128, 0.3)" }}>
            <NavigationRail collapsed quota={quota} isPushConnected={isPushConnected} onLogout={logout} onManageApps={handleManageApps} onInlineApp={handleInlineApp} onCloseInlineApp={closeInlineApp} activeAppId={inlineApp?.id ?? null} />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          {inlineApp && <InlineAppView apps={loadedApps} activeAppId={inlineApp.id} onClose={closeInlineApp} />}
          <div className={cn("flex min-h-0 flex-1", inlineApp && "hidden")}>
            <ChatDialogsProvider>
              <ChatInside />
            </ChatDialogsProvider>
          </div>
          {isMobile && !isEmbedded && !rooms && <NavigationRail orientation="horizontal" onManageApps={handleManageApps} onInlineApp={handleInlineApp} onCloseInlineApp={closeInlineApp} activeAppId={inlineApp?.id ?? null} />}
        </div>
      </div>
      <SidebarAppsModal isOpen={showAppsModal} onClose={closeAppsModal} />
    </div>
  );
}
