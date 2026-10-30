"use client";

// Step 89: the screen for the assistant panel, from the stores of each page.
import { useMemo } from "react";
import { usePathname } from "@/i18n/navigation";
import { useCalendarStore } from "@/stores/calendar-store";
import { getContactDisplayName, useContactStore } from "@/stores/contact-store";
import { resolveSelectedEmails, useEmailStore } from "@/stores/email-store";
import { useFileStore } from "@/stores/file-store";
import { useChatStore } from "@/lib/xenaxio/chat/store";
import { type Screen, screenOf, useScreenItems } from "@/lib/xenaxio/assistant-screen";

export function useAssistantScreen(): Screen {
  const pathname = usePathname();
  const email = useEmailStore((s) => s.selectedEmail);
  const selectedKeys = useEmailStore((s) => s.selectedEmailKeys);
  const view = useCalendarStore((s) => s.viewMode);
  const date = useCalendarStore((s) => s.selectedDate);
  const items = useScreenItems((s) => s.items);
  const folder = useFileStore((s) => s.currentPath);
  const chatView = useChatStore((s) => s.view);
  const chatPanel = useChatStore((s) => s.panel);
  const chatClient = useChatStore((s) => s.client);
  const contactId = useContactStore((s) => s.selectedContactId);
  const contacts = useContactStore((s) => s.contacts);

  return useMemo(() => {
    const selected = selectedKeys.size >= 2 ? resolveSelectedEmails(useEmailStore.getState()) : [];
    const card = contactId ? contacts.find((c) => c.id === contactId) : undefined;
    const roomName = (id: string) => {
      const room = chatClient?.rooms.get(id);
      return room && chatClient ? chatClient.roomName(room) : undefined;
    };
    return screenOf({
      pathname,
      email,
      selected,
      calendar: { view, date },
      items,
      folder,
      chat: { view: chatView, panel: chatPanel, roomName },
      contact: card ? { address: Object.values(card.emails ?? {})[0]?.address, name: getContactDisplayName(card) } : null,
    });
  }, [pathname, email, selectedKeys, view, date, items, folder, chatView, chatPanel, chatClient, contactId, contacts]);
}
