"use client";

// Step 105: a colleague's card outside the chat — in mail (sender and
// recipients, mentions, invitations), in the contacts' directory and among a
// meeting's participants. The same look as the profile in Rooms: banner,
// picture in its frame, name, pronouns, job title · department, "about me",
// contacts as tiles, and "Message in Rooms". One profile for Xenaxio and XenRooms.
import { IconMessageCircle } from "@tabler/icons-react";
import { useLocale } from "next-intl";
import { ProfileBanner, ProfileDetails, ProfileFrame, ProfileRole, useReducedMotion } from "@/components/xenaxio/chat/profile";
import { generateAvatarColor, getInitials } from "@/lib/account-utils";
import { withBasePath } from "@/lib/browser-navigation";
import { useXT } from "@/lib/xenaxio/i18n";
import { objectPosition } from "@/lib/xenaxio/media";
import { useXenaxioMe } from "@/lib/xenaxio/me-store";
import type { CompanyPerson } from "@/lib/xenaxio/people";
import { cn } from "@/lib/utils";

/** The picture in its frame, moving unless the system asks for less motion. */
function Picture({ person, size }: { person: CompanyPerson; size: "md" | "lg" }) {
  const reduced = useReducedMotion();
  const animation = person.avatarAnimation;
  const src = !reduced && animation ? animation.url : person.avatarUrl;
  const box = size === "lg" ? "h-24 w-24 text-3xl" : "h-16 w-16 text-xl";
  return (
    <ProfileFrame profile={person.profile}>
      <span
        className={cn("flex items-center justify-center overflow-hidden rounded-full border-4 border-background font-semibold text-white", box)}
        style={{ backgroundColor: src ? "var(--muted)" : generateAvatarColor(person.email || person.displayName) }}
        data-testid="colleague-card-picture"
      >
        {src ? (
          <img src={withBasePath(src)} alt="" className="h-full w-full object-cover" style={{ objectPosition: src === animation?.url ? objectPosition(animation) : undefined }} />
        ) : (
          getInitials(person.displayName, person.email)
        )}
      </span>
    </ProfileFrame>
  );
}

/** Banner, picture, name, pronouns and job title: the top of the card. */
export function ColleagueCardHeader({ person, email, size = "md", className }: { person: CompanyPerson; email?: string; size?: "md" | "lg"; className?: string }) {
  return (
    <div className={className} data-testid="colleague-card">
      <ProfileBanner profile={person.profile} />
      <div className={cn("px-4", size === "lg" ? "-mt-12" : "-mt-8")}>
        <Picture person={person} size={size} />
        <div className="mt-1 min-w-0">
          <div className={cn("flex flex-wrap items-baseline gap-x-2 font-semibold", size === "lg" ? "text-lg" : "text-sm")}>
            <span className="min-w-0 break-words">{person.displayName}</span>
            {person.profile.pronouns && <span className="text-xs font-normal text-muted-foreground">{person.profile.pronouns}</span>}
          </div>
          {email && <div className="truncate text-xs text-muted-foreground">{email}</div>}
          <div className="text-muted-foreground [&>div]:text-xs">
            <ProfileRole profile={person.profile} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** "About me" and the contacts as tiles (the address is in the card already). */
export function ColleagueCardDetails({ person }: { person: CompanyPerson }) {
  const p = person.profile;
  if (!p.about && !p.phone && p.contacts.length === 0) return null;
  return <ProfileDetails profile={p} />;
}

/** "Message in Rooms": the direct conversation, when the company's chat knows the person (not oneself). */
export function RoomsMessageLink({ person, className }: { person: CompanyPerson; className?: string }) {
  const t = useXT();
  const locale = useLocale();
  const me = useXenaxioMe();
  if (!person.chatAddress || me?.user.id === person.id) return null;
  return (
    <a href={withBasePath(`/${locale}/chat/?dm=${encodeURIComponent(person.chatAddress)}`)} className={className} title={t("colleague_card.message_title", { name: person.displayName })} data-testid="colleague-card-message">
      <IconMessageCircle size={14} className="shrink-0" />
      {t("colleague_card.message")}
    </a>
  );
}
