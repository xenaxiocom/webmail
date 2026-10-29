"use client";

// xenaxio step 78, part C: video meetings in the calendar. In the event form a
// button makes a Xenaxio Meeting link for the event; in the event's card a
// "Join" button shows from 10 minutes before the start until its end.
// Step 79, part D: next to it a "Webinar" button, where webinars are allowed.
import { useEffect, useState } from "react";
import { Presentation, Video } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { XenaxioApiError } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";
import { meet, meetingCodeOfLink, meetingLink, type MeetingKind } from "@/lib/xenaxio/meet";
import { useMeetNavItem } from "@/lib/xenaxio/meet-nav";

const EARLY_MS = 10 * 60_000;

/** Step 79, part D: how the calendar names a webinar's link (the assistant names it so too). */
export const WEBINAR_LINK_NAME = "Xenaxio Webinar";
/** Webinar links made in this page, until the event is saved with them. */
const madeWebinars = new Set<string>();

const valid = (d: Date | null): d is Date => !!d && !Number.isNaN(d.getTime());

/**
 * The name to save with the event's video link: "Xenaxio Webinar" for a webinar
 * made here, otherwise the name the link already had (null for a new one).
 */
export function eventLinkName(uri: string, event?: { virtualLocations?: Record<string, { uri?: string | null; name?: string | null }> | null } | null): string | null {
  if (madeWebinars.has(uri)) return WEBINAR_LINK_NAME;
  return Object.values(event?.virtualLocations ?? {}).find((v) => v.uri === uri)?.name ?? null;
}

/**
 * The event of a webinar was saved: the webinar follows its title and time, so
 * people who registered get the new time. Not the host's webinar: nothing changes.
 */
export async function followWebinar(uri: string, name: string | null, change: { title: string; start: Date; end: Date }): Promise<void> {
  const code = meetingCodeOfLink(uri);
  if (!code || name !== WEBINAR_LINK_NAME || !valid(change.start) || !valid(change.end)) return;
  const minutes = Math.round((change.end.getTime() - change.start.getTime()) / 60_000);
  await meet
    .updateWebinar(code, { title: change.title, startsAt: change.start, durationMinutes: Math.min(720, Math.max(5, minutes)) })
    .then(() => madeWebinars.delete(uri))
    .catch(() => undefined);
}

/**
 * "Xenaxio Meeting": a link for this event, put into the meeting-link field.
 * "Webinar" (step 79, part D): a webinar at the event's time instead; `start` is
 * null for an all-day event, which cannot be a webinar.
 */
export function EventMeetingButton({
  title,
  until,
  link,
  onLink,
  start = null,
  description = "",
}: {
  title: string;
  until: Date | null;
  link: string;
  onLink: (url: string) => void;
  start?: Date | null;
  description?: string;
}) {
  const t = useXT();
  const { visible, webinars } = useMeetNavItem();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!visible || meetingCodeOfLink(link)) return null;
  const create = async (kind: MeetingKind) => {
    setBusy(true);
    setError(null);
    try {
      const end = valid(until) ? until : undefined;
      if (kind === "webinar" && valid(start)) {
        const minutes = end ? Math.round((end.getTime() - start.getTime()) / 60_000) : 60;
        const m = await meet.create(title.trim() || t("meet.event_webinar_default"), undefined, "webinar", {
          startsAt: start,
          durationMinutes: Math.min(720, Math.max(5, minutes)),
          description: description.trim().slice(0, 4000),
          registration: true,
        });
        const url = meetingLink(m.code);
        madeWebinars.add(url);
        onLink(url);
        return;
      }
      const m = await meet.create(title.trim() || t("meet.event_title_default"), end);
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
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void create("meeting")}>
        <Video className="mr-1 h-4 w-4" />
        {t("meet.event_create")}
      </Button>
      {webinars && valid(start) && (
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void create("webinar")}>
          <Presentation className="mr-1 h-4 w-4" />
          {t("meet.event_webinar")}
        </Button>
      )}
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
