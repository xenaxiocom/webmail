"use client";

// xenaxio step 78, part C: video meetings in the calendar. In the event form a
// button makes a Xenaxio Meeting link for the event; in the event's card a
// "Join" button shows from 10 minutes before the start until its end.
import { useEffect, useState } from "react";
import { Video } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { XenaxioApiError } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";
import { meet, meetingCodeOfLink, meetingLink } from "@/lib/xenaxio/meet";
import { useMeetNavItem } from "@/lib/xenaxio/meet-nav";

const EARLY_MS = 10 * 60_000;

/** "Xenaxio Meeting": a link for this event, put into the meeting-link field. */
export function EventMeetingButton({ title, until, link, onLink }: { title: string; until: Date | null; link: string; onLink: (url: string) => void }) {
  const t = useXT();
  const { visible } = useMeetNavItem();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!visible || meetingCodeOfLink(link)) return null;
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const m = await meet.create(title.trim() || t("meet.event_title_default"), until && !Number.isNaN(until.getTime()) ? until : undefined);
      onLink(meetingLink(m.code));
    } catch (err) {
      const code = err instanceof XenaxioApiError ? err.code : "internal";
      const text = t(`meet.errors.${code}`);
      setError(text === `meet.errors.${code}` ? t("meet.errors.internal") : text);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void create()}>
        <Video className="mr-1 h-4 w-4" />
        {t("meet.event_create")}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

/** "Join" for a Xenaxio Meeting, from 10 minutes before the start until the end. */
export function MeetingJoinButton({ uri, start, end }: { uri: string | null; start: Date; end: Date }) {
  const t = useXT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  if (!uri || !meetingCodeOfLink(uri)) return null;
  if (now < start.getTime() - EARLY_MS || now > end.getTime()) return null;
  return (
    <a href={uri} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">
      <Video className="h-4 w-4" />
      {t("meet.event_join")}
    </a>
  );
}
