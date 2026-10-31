"use client";

// Step 99, part G: a colleague's profile card in Rooms (banner, frame, job
// title, contacts) and the dialog to edit one's own.
import { IconPlus, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { BANNER_STYLE, BANNERS, CONTACT_KINDS, contactLink, type ContactKind, EMPTY_PROFILE, FRAME_STYLE, FRAMES, saveProfile, type UserProfile } from "@/lib/xenaxio/chat/profile";
import { useChatStore } from "@/lib/xenaxio/chat/store";
import { useXT } from "@/lib/xenaxio/i18n";
import { toast } from "@/stores/toast-store";
import { cn } from "@/lib/utils";
import { Modal } from "./dialogs";

/** The banner over the card; nothing when there is none. */
export function ProfileBanner({ profile }: { profile: UserProfile | undefined }) {
  const style = BANNER_STYLE[profile?.banner ?? "none"];
  if (!style) return null;
  return <div aria-hidden className="-mx-5 -mt-5 mb-[-28px] h-20" style={{ backgroundImage: style }} data-testid="profile-banner" />;
}

/** The frame around the picture. */
export function ProfileFrame({ profile, children }: { profile: UserProfile | undefined; children: React.ReactNode }) {
  const frame = profile?.frame ?? "none";
  return <span className={cn("relative inline-flex rounded-full", FRAME_STYLE[frame])} data-frame={frame}>{children}</span>;
}

/** Job title, pronouns, about, phone and contacts as links. */
export function ProfileDetails({ profile }: { profile: UserProfile | undefined }) {
  const t = useXT();
  if (!profile) return null;
  const role = [profile.title, profile.department].filter(Boolean).join(" · ");
  const links = profile.contacts.map((c) => ({ ...c, href: contactLink(c) })).filter((c) => c.href);
  return (
    <div className="mt-1 space-y-2 text-sm">
      {(role || profile.pronouns) && (
        <div>
          {role}
          {profile.pronouns && <span className="text-muted-foreground"> {role ? "· " : ""}{profile.pronouns}</span>}
        </div>
      )}
      {profile.about && <p className="whitespace-pre-wrap break-words text-muted-foreground">{profile.about}</p>}
      {(profile.phone || links.length > 0) && (
        <ul className="space-y-0.5">
          {profile.phone && (
            <li>
              <span className="text-xs text-muted-foreground">{t("chat.profile_phone")}: </span>
              <a href={contactLink({ kind: "phone", value: profile.phone }) ?? "#"} className="text-primary hover:underline">
                {profile.phone}
              </a>
            </li>
          )}
          {links.map((c, i) => (
            <li key={`${c.kind}-${i}`}>
              <span className="text-xs text-muted-foreground">{t(`chat.contact_${c.kind}`)}: </span>
              <a href={c.href as string} target="_blank" rel="noopener noreferrer nofollow" className="text-primary hover:underline">
                {c.value}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ProfileDialog({ address, initial, onClose }: { address: string; initial: UserProfile | undefined; onClose: () => void }) {
  const t = useXT();
  const setProfile = useChatStore((s) => s.setProfile);
  const [p, setP] = useState<UserProfile>({ ...EMPTY_PROFILE, ...initial });
  const [busy, setBusy] = useState(false);
  const field = "mt-1 h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring";
  const set = <K extends keyof UserProfile>(k: K, v: UserProfile[K]) => setP((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      const saved = await saveProfile({ ...p, contacts: p.contacts.filter((c) => c.value.trim()) });
      setProfile(address, saved);
      toast.success(t("chat.profile_saved"));
      onClose();
    } catch {
      toast.error(t("chat.profile_invalid"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={t("chat.profile_edit")} onClose={onClose} wide>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            {t("chat.profile_title")}
            <input value={p.title ?? ""} maxLength={100} onChange={(e) => set("title", e.target.value)} className={field} />
          </label>
          <label className="text-sm font-medium">
            {t("chat.profile_department")}
            <input value={p.department ?? ""} maxLength={100} onChange={(e) => set("department", e.target.value)} className={field} />
          </label>
          <label className="text-sm font-medium">
            {t("chat.profile_phone")}
            <input value={p.phone ?? ""} maxLength={40} inputMode="tel" onChange={(e) => set("phone", e.target.value)} className={field} />
          </label>
          <label className="text-sm font-medium">
            {t("chat.profile_pronouns")}
            <input value={p.pronouns ?? ""} maxLength={40} onChange={(e) => set("pronouns", e.target.value)} className={field} />
          </label>
        </div>
        <label className="block text-sm font-medium">
          {t("chat.profile_about")}
          <textarea value={p.about ?? ""} maxLength={300} rows={3} onChange={(e) => set("about", e.target.value)} className={cn(field, "h-auto py-1.5")} />
        </label>
        <div>
          <div className="text-sm font-medium">{t("chat.profile_contacts")}</div>
          <ul className="mt-1 space-y-1.5">
            {p.contacts.map((c, i) => (
              <li key={i} className="flex gap-1.5">
                <select
                  value={c.kind}
                  aria-label={t("chat.profile_contact_kind")}
                  onChange={(e) => set("contacts", p.contacts.map((x, j) => (j === i ? { ...x, kind: e.target.value as ContactKind } : x)))}
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  {CONTACT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(`chat.contact_${k}`)}
                    </option>
                  ))}
                </select>
                <input
                  value={c.value}
                  maxLength={200}
                  aria-label={t("chat.profile_contact_value")}
                  placeholder={t(`chat.contact_hint_${c.kind}`)}
                  onChange={(e) => set("contacts", p.contacts.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                  className="h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm"
                />
                <button type="button" onClick={() => set("contacts", p.contacts.filter((_, j) => j !== i))} className="rounded p-2 text-muted-foreground hover:bg-accent" aria-label={t("chat.profile_contact_remove")}>
                  <IconX size={14} />
                </button>
              </li>
            ))}
          </ul>
          {p.contacts.length < 10 && (
            <button type="button" onClick={() => set("contacts", [...p.contacts, { kind: "telegram", value: "" }])} className="mt-1.5 flex items-center gap-1 rounded px-2 py-1 text-sm text-primary hover:bg-accent">
              <IconPlus size={14} />
              {t("chat.profile_contact_add")}
            </button>
          )}
        </div>
        <div>
          <div className="text-sm font-medium">{t("chat.profile_banner")}</div>
          <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label={t("chat.profile_banner")}>
            {BANNERS.map((b) => (
              <button
                key={b}
                type="button"
                role="radio"
                aria-checked={p.banner === b}
                aria-label={t(`chat.banner_${b}`)}
                title={t(`chat.banner_${b}`)}
                onClick={() => set("banner", b)}
                className={cn("h-8 w-14 rounded-md border", p.banner === b ? "ring-2 ring-primary ring-offset-1" : "border-border")}
                style={BANNER_STYLE[b] ? { backgroundImage: BANNER_STYLE[b] } : undefined}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="text-sm font-medium">{t("chat.profile_frame")}</div>
          <div className="mt-1 flex flex-wrap gap-3" role="radiogroup" aria-label={t("chat.profile_frame")}>
            {FRAMES.map((f) => (
              <button key={f} type="button" role="radio" aria-checked={p.frame === f} aria-label={t(`chat.frame_${f}`)} title={t(`chat.frame_${f}`)} onClick={() => set("frame", f)} className={cn("rounded-full p-1", p.frame === f && "bg-accent")}>
                <span className={cn("inline-flex rounded-full", FRAME_STYLE[f])}>
                  <span className="block h-8 w-8 rounded-full bg-muted" />
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-9 rounded-md px-3 text-sm hover:bg-accent">
          {t("chat.cancel")}
        </button>
        <button type="button" disabled={busy} onClick={() => void save()} className="h-9 rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">
          {t("chat.save_edit")}
        </button>
      </div>
    </Modal>
  );
}
