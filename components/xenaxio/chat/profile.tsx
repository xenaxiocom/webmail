"use client";

// Step 99, part G: a colleague's profile in Rooms (banner, frame, job title,
// contacts) and the dialog to edit one's own. Step 104 (owner 31.10.2026):
// a card as in Slack and Discord — banner across, large picture over it,
// actions, contacts as tiles with the service's icon; one's own banner
// picture and moving pictures; contacts in any order (a handle, mouse,
// finger or keys); a wrong field is marked where it is.
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  IconArrowUpRight,
  IconBrandGithub,
  IconBrandLinkedin,
  IconBrandSignal,
  IconBrandTelegram,
  IconBrandWhatsapp,
  IconBrandX,
  IconCopy,
  IconGripVertical,
  IconMail,
  IconPhone,
  IconPhoto,
  IconPlus,
  IconTrash,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import { type ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { withBasePath } from "@/lib/browser-navigation";
import { generateAvatarColor, getInitials } from "@/lib/account-utils";
import { type AvatarAnimation, errorText, XenaxioApiError, xenaxio } from "@/lib/xenaxio/api";
import { useXenaxioAvatarStore } from "@/lib/xenaxio/avatars";
import { CENTER, type Focus, objectPosition } from "@/lib/xenaxio/media";
import { BANNER_ASPECT, sendAvatar, sendBanner } from "@/lib/xenaxio/profile-media";
import {
  BANNER_STYLE,
  BANNERS,
  CONTACT_KINDS,
  type ContactKind,
  contactLink,
  EMPTY_PROFILE,
  FRAME_STYLE,
  FRAMES,
  saveProfile,
  type UserProfile,
  validContact,
  validPhone,
} from "@/lib/xenaxio/chat/profile";
import { type Colleague, useChatStore } from "@/lib/xenaxio/chat/store";
import { useXT } from "@/lib/xenaxio/i18n";
import { usePeopleStore } from "@/lib/xenaxio/people";
import { toast } from "@/stores/toast-store";
import { cn } from "@/lib/utils";
import { Modal } from "./dialogs";

/** "Reduce motion" in the system: moving pictures stay still everywhere. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    if (!m) return;
    setReduced(m.matches);
    const change = () => setReduced(m.matches);
    m.addEventListener?.("change", change);
    return () => m.removeEventListener?.("change", change);
  }, []);
  return reduced;
}

/** The banner across the card: the own picture, a preset, or a soft gradient in the company's colour. */
export function ProfileBanner({ profile, className }: { profile: UserProfile | undefined; className?: string }) {
  const reduced = useReducedMotion();
  const picture = profile?.banner === "custom" ? profile.bannerImage : null;
  const preset = profile && profile.banner !== "custom" ? BANNER_STYLE[profile.banner] : "";
  return (
    <div
      aria-hidden
      data-testid="profile-banner"
      className={cn("relative aspect-[3/1] w-full overflow-hidden", !picture && !preset && "bg-gradient-to-br from-primary/45 via-primary/15 to-muted", className)}
      style={preset ? { backgroundImage: preset } : undefined}
    >
      {picture && (
        <img
          src={withBasePath(!reduced && picture.animatedUrl ? picture.animatedUrl : picture.url)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: objectPosition(picture) }}
        />
      )}
    </div>
  );
}

/** The frame around the picture. */
export function ProfileFrame({ profile, children }: { profile: UserProfile | undefined; children: ReactNode }) {
  const frame = profile?.frame ?? "none";
  return (
    <span className={cn("relative inline-flex rounded-full", FRAME_STYLE[frame])} data-frame={frame}>
      {children}
    </span>
  );
}

/** A person's picture, large: moving on the card (unless motion is reduced), initials without one. */
export function LargeAvatar({
  colleague,
  name,
  email,
  presence,
  framed = false,
  className,
}: {
  colleague: Colleague | undefined;
  name: string;
  email?: string;
  presence?: "online" | "unavailable" | "offline";
  /** Inside a frame: the frame touches the photo, without the edge of background that sets it off the banner. */
  framed?: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const animation = colleague?.avatarAnimation;
  const still = colleague?.avatarUrl;
  const src = !reduced && animation ? animation.url : still;
  return (
    <span className={cn("relative inline-flex", className)}>
      <span
        className={cn("flex h-24 w-24 items-center justify-center overflow-hidden rounded-full text-3xl font-semibold text-white", !framed && "border-4 border-background")}
        style={{ backgroundColor: src ? "var(--muted)" : generateAvatarColor(email ?? name) }}
        data-testid="profile-avatar"
      >
        {src ? (
          <img src={withBasePath(src)} alt="" className="h-full w-full object-cover" style={{ objectPosition: src === animation?.url ? objectPosition(animation) : undefined }} />
        ) : (
          getInitials(name, email ?? "")
        )}
      </span>
      {presence && (
        <span
          className={cn(
            "absolute bottom-1 right-1 h-5 w-5 rounded-full border-4 border-background",
            presence === "online" ? "bg-green-500" : presence === "unavailable" ? "bg-amber-400" : "bg-muted-foreground/50",
          )}
        />
      )}
    </span>
  );
}

/** Each service: its icon and colour (the tile shows it is a link). */
const CONTACT_LOOK: Record<ContactKind, { icon: typeof IconWorld; tint: string }> = {
  telegram: { icon: IconBrandTelegram, tint: "bg-[#26A5E4]/15 text-[#1d8bc4] dark:text-[#4cb7ee]" },
  whatsapp: { icon: IconBrandWhatsapp, tint: "bg-[#25D366]/15 text-[#1a9e4b] dark:text-[#3ddc79]" },
  signal: { icon: IconBrandSignal, tint: "bg-[#3A76F0]/15 text-[#2f63cf] dark:text-[#6d98f5]" },
  linkedin: { icon: IconBrandLinkedin, tint: "bg-[#0A66C2]/15 text-[#0a66c2] dark:text-[#4c94dd]" },
  x: { icon: IconBrandX, tint: "bg-foreground/10 text-foreground" },
  github: { icon: IconBrandGithub, tint: "bg-foreground/10 text-foreground" },
  website: { icon: IconWorld, tint: "bg-primary/15 text-primary" },
  phone: { icon: IconPhone, tint: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
};

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    // Without clipboard rights the text stays visible to select.
  }
}

/** One contact as a tile: icon, service, value, ↗ — the whole tile is the link. */
function ContactTile({ kind, label, value, href, copyable }: { kind: ContactKind | "email"; label: string; value: string; href: string; copyable?: boolean }) {
  const t = useXT();
  const look = kind === "email" ? { icon: IconMail, tint: "bg-primary/15 text-primary" } : CONTACT_LOOK[kind];
  const Icon = look.icon;
  const external = href.startsWith("https://");
  return (
    <li className="flex min-w-0 items-stretch gap-1">
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`${label}: ${value}`}
        data-contact={kind}
      >
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", look.tint)}>
          <Icon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted-foreground">{label}</span>
          <span className="block truncate text-sm font-medium">{value}</span>
        </span>
        <IconArrowUpRight size={16} className="shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
      </a>
      {copyable && (
        <button type="button" onClick={() => void copy(value, t("chat.profile_copied"))} className="shrink-0 rounded-lg border border-border px-2.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={t("chat.profile_copy", { value })} title={t("chat.profile_copy", { value })}>
          <IconCopy size={16} />
        </button>
      )}
    </li>
  );
}

/** Job title, pronouns, about and the contacts as tiles (e-mail last). */
export function ProfileDetails({ profile, email }: { profile: UserProfile | undefined; email?: string | null }) {
  const t = useXT();
  const links = (profile?.contacts ?? []).map((c) => ({ ...c, href: contactLink(c) })).filter((c): c is { kind: ContactKind; value: string; href: string } => !!c.href);
  const phone = profile?.phone ? contactLink({ kind: "phone", value: profile.phone }) : null;
  const any = links.length > 0 || phone || email;
  return (
    <div className="space-y-4">
      {profile?.about && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("chat.profile_about")}</h4>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm">{profile.about}</p>
        </section>
      )}
      {any && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("chat.profile_contact_section")}</h4>
          <ul className="mt-1.5 space-y-1.5" data-testid="profile-contacts">
            {email && <ContactTile kind="email" label={t("chat.profile_email")} value={email} href={`mailto:${email}`} copyable />}
            {phone && profile?.phone && <ContactTile kind="phone" label={t("chat.profile_phone")} value={profile.phone} href={phone} copyable />}
            {links.map((c, i) => (
              <ContactTile key={`${c.kind}-${i}`} kind={c.kind} label={t(`chat.contact_${c.kind}`)} value={c.value} href={c.href} copyable={c.kind === "phone"} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** "Job title · department" and pronouns under the name. */
export function ProfileRole({ profile }: { profile: UserProfile | undefined }) {
  const role = [profile?.title, profile?.department].filter(Boolean).join(" · ");
  if (!role) return null;
  return <div className="text-sm">{role}</div>;
}

/**
 * Move the picture inside the circle or the 3:1 strip: drag with mouse or
 * finger, or the arrow keys. `focus` is where it sits (0–100).
 */
export function PictureFramer({ src, aspect, round, focus, onChange, label }: { src: string; aspect: number; round?: boolean; focus: Focus; onChange: (f: Focus) => void; label: string }) {
  const t = useXT();
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const drag = useRef<{ x: number; y: number; from: Focus } | null>(null);
  const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v)));
  const move = (dx: number, dy: number, from: Focus) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || !size || !r.width || !r.height) return;
    const scale = Math.max(r.width / size.w, r.height / size.h);
    const overX = size.w * scale - r.width;
    const overY = size.h * scale - r.height;
    onChange({ x: overX > 0.5 ? clamp(from.x - (dx / overX) * 100) : 50, y: overY > 0.5 ? clamp(from.y - (dy / overY) * 100) : 50 });
  };
  return (
    <div
      ref={box}
      role="group"
      tabIndex={0}
      aria-label={`${label}. ${t("chat.profile_framer_hint")}`}
      className={cn("relative cursor-grab touch-none select-none overflow-hidden bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing", round ? "mx-auto w-44 rounded-full" : "w-full rounded-lg")}
      style={{ aspectRatio: String(aspect) }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, from: focus };
      }}
      onPointerMove={(e) => {
        if (drag.current) move(e.clientX - drag.current.x, e.clientY - drag.current.y, drag.current.from);
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 10 : 3;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (!d) return;
        e.preventDefault();
        onChange({ x: clamp(focus.x + (d[0] ?? 0)), y: clamp(focus.y + (d[1] ?? 0)) });
      }}
      data-testid="picture-framer"
    >
      <img
        src={src}
        alt=""
        draggable={false}
        onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        className="pointer-events-none h-full w-full object-cover"
        style={{ objectPosition: objectPosition(focus) }}
      />
      <span className="pointer-events-none absolute inset-x-0 bottom-1.5 text-center text-[11px] font-medium text-white drop-shadow">{t("chat.profile_framer_drag")}</span>
    </div>
  );
}

/** A chosen file in the framer, then "Use" sends it. */
function PickedPicture({ file, aspect, round, label, send, onDone }: { file: File; aspect: number; round?: boolean; label: string; send: (file: File, focus: Focus) => Promise<void>; onDone: () => void }) {
  const t = useXT();
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const [focus, setFocus] = useState<Focus>(CENTER);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border p-3">
      <PictureFramer src={url} aspect={aspect} round={round} focus={focus} onChange={setFocus} label={label} />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="h-8 rounded-md px-3 text-sm hover:bg-accent">
          {t("chat.cancel")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await send(file, focus);
              onDone();
            } catch (err) {
              setError(err instanceof XenaxioApiError ? errorText(t, err) : t("chat.profile_picture_unreadable"));
            } finally {
              setBusy(false);
            }
          }}
          className="h-8 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50"
        >
          {busy ? t("chat.profile_picture_saving") : t("chat.profile_picture_use")}
        </button>
      </div>
    </div>
  );
}

/** A file button that hands the chosen picture over. */
function ChooseFile({ label, onFile, icon }: { label: string; onFile: (f: File) => void; icon?: ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        aria-label={label}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
      <button type="button" onClick={() => input.current?.click()} className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-accent">
        {icon ?? <IconPhoto size={15} />}
        {label}
      </button>
    </>
  );
}

type Row = { id: number; kind: ContactKind; value: string };

/** One contact in the form: handle, kind, value (marked when wrong), remove. */
function ContactRow({ row, index, error, onChange, onRemove, onBlur }: { row: Row; index: number; error: string | null; onChange: (r: Row) => void; onRemove: () => void; onBlur: () => void }) {
  const t = useXT();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const errorId = `profile-contact-${row.id}-error`;
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("rounded-md", isDragging && "relative z-10 bg-background shadow-lg ring-1 ring-border")} data-testid="profile-contact-row">
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t("chat.profile_contact_move", { n: index + 1 })}
          className="flex h-9 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing"
        >
          <IconGripVertical size={16} />
        </button>
        <select
          value={row.kind}
          aria-label={t("chat.profile_contact_kind")}
          onChange={(e) => onChange({ ...row, kind: e.target.value as ContactKind })}
          className="h-9 w-[6.5rem] shrink-0 rounded-md border border-input bg-transparent px-1.5 text-sm sm:w-[7.5rem] sm:px-2"
        >
          {CONTACT_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`chat.contact_${k}`)}
            </option>
          ))}
        </select>
        <div className="min-w-0 flex-1">
          <input
            id={`profile-contact-${index}`}
            value={row.value}
            maxLength={200}
            aria-label={t("chat.profile_contact_value")}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            placeholder={t(`chat.contact_hint_${row.kind}`)}
            onChange={(e) => onChange({ ...row, value: e.target.value })}
            onBlur={onBlur}
            className={cn("h-9 w-full rounded-md border bg-transparent px-2 text-sm focus:outline-none focus:ring-2", error ? "border-destructive ring-1 ring-destructive/60 focus:ring-destructive/60" : "border-input focus:ring-ring")}
          />
        </div>
        <button type="button" onClick={onRemove} className="rounded p-2 text-muted-foreground hover:bg-accent" aria-label={t("chat.profile_contact_remove")}>
          <IconX size={14} />
        </button>
      </div>
      {error && (
        <p id={errorId} className="ml-8 mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}

let rowIds = 0;

/** What the form needs to know about the person: the own picture (the name comes in `nameField`). */
export type ProfilePerson = Pick<Colleague, "displayName" | "email" | "avatarUrl" | "avatarAnimation">;

/**
 * Step 105: the own profile as a form — picture, name, details, contacts in
 * any order, banner (also one's own), frame; a wrong field is marked where it
 * is. The same form in the chat's "Edit profile" and in Settings → Account
 * (Xenaxio and XenRooms): one profile for both.
 */
export function ProfileForm({
  initial,
  person,
  nameField,
  showPicture = true,
  onChange,
  onPicture,
  onSaved,
  onCancel,
  scroll,
}: {
  initial: UserProfile | undefined;
  person?: ProfilePerson;
  /** The own name (saved on its own, step 101). */
  nameField?: ReactNode;
  /** The picture section (Settings → Account has its own picture row). */
  showPicture?: boolean;
  /** The profile changed on the platform (saved, or the own banner picture sent or removed). */
  onChange?: (p: UserProfile) => void;
  /** The own picture changed. */
  onPicture?: (change: Pick<Colleague, "avatarUrl" | "avatarAnimation">) => void;
  /** After "Save" went through (the dialog closes). */
  onSaved?: (p: UserProfile) => void;
  onCancel?: () => void;
  /** The fields scroll inside a dialog. */
  scroll?: boolean;
}) {
  const t = useXT();
  const refreshAvatars = useXenaxioAvatarStore((s) => s.load);
  const [p, setP] = useState<UserProfile>({ ...EMPTY_PROFILE, ...initial });
  const [rows, setRows] = useState<Row[]>(() => (initial?.contacts ?? []).map((c) => ({ id: ++rowIds, ...c })));
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverIssues, setServerIssues] = useState<Record<string, string>>({});
  const [picking, setPicking] = useState<{ what: "avatar" | "banner"; file: File } | null>(null);
  // The last state the platform has (for the banner picture before "Save").
  const stored = useRef<UserProfile>({ ...EMPTY_PROFILE, ...initial });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const field = "mt-1 h-9 w-full rounded-md border bg-transparent px-2 text-sm font-normal focus:outline-none focus:ring-2";
  const set = <K extends keyof UserProfile>(k: K, v: UserProfile[K]) => setP((x) => ({ ...x, [k]: v }));
  const touch = (path: string) => setTouched((s) => (s.has(path) ? s : new Set(s).add(path)));
  const clearIssue = (prefix: string) => setServerIssues((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !k.startsWith(prefix))));
  const changed = (next: UserProfile) => {
    stored.current = next;
    onChange?.(next);
  };
  // The form's own check (the platform's rules); shown once a field was left or "Save" pressed.
  const localErrors = useMemo(() => {
    const out: Record<string, string> = {};
    if (!validPhone(p.phone)) out.phone = t("chat.profile_phone_rule");
    rows.forEach((r, i) => {
      if (r.value.trim() && !validContact(r)) out[`contacts.${i}.value`] = t(`chat.contact_rule_${r.kind}`);
    });
    return out;
  }, [p.phone, rows, t]);
  const errorFor = (path: string): string | null => {
    if (serverIssues[path]) return serverIssues[path];
    return (submitted || touched.has(path)) && localErrors[path] ? localErrors[path] : null;
  };

  const save = async () => {
    // Empty rows are dropped, as before.
    const kept = rows.filter((r) => r.value.trim());
    if (Object.keys(localErrors).length > 0) {
      setSubmitted(true);
      const first = Object.keys(localErrors)[0] ?? "";
      const index = /^contacts\.(\d+)\.value$/.exec(first)?.[1];
      document.getElementById(index !== undefined ? `profile-contact-${index}` : "profile-phone")?.focus();
      return;
    }
    setBusy(true);
    try {
      const saved = await saveProfile({ ...p, contacts: kept.map(({ kind, value }) => ({ kind, value: value.trim() })) });
      const next = { ...saved, bannerImage: saved.bannerImage ?? p.bannerImage ?? null };
      changed(next);
      setSubmitted(false);
      setTouched(new Set());
      toast.success(t("chat.profile_saved"));
      onSaved?.(next);
    } catch (err) {
      const issues = err instanceof XenaxioApiError ? err.issues : undefined;
      if (issues?.length) {
        // The platform names the field: mark it there (rows were saved without the empty ones).
        const byIndex = new Map(kept.map((r, i) => [i, rows.indexOf(r)]));
        const next: Record<string, string> = {};
        for (const issue of issues) {
          const m = /^contacts\.(\d+)\.value$/.exec(issue.path);
          if (m) {
            const row = rows[byIndex.get(Number(m[1])) ?? -1];
            if (row) next[`contacts.${rows.indexOf(row)}.value`] = t(`chat.contact_rule_${row.kind}`);
          } else if (issue.path === "phone") next.phone = t("chat.profile_phone_rule");
          else next[issue.path] = t("chat.profile_invalid");
        }
        setServerIssues(next);
        setSubmitted(true);
      } else {
        toast.error(err instanceof XenaxioApiError && err.code !== "internal" && err.code !== "network" ? errorText(t, err) : t("chat.error"));
      }
    } finally {
      setBusy(false);
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = rows.findIndex((r) => r.id === e.active.id);
    const to = rows.findIndex((r) => r.id === e.over?.id);
    if (from < 0 || to < 0) return;
    setRows(arrayMove(rows, from, to));
    // Errors from the platform name places in the old order.
    clearIssue("contacts.");
  };

  const picture = p.bannerImage;
  const sendOwnAvatar = async (file: File, focus: Focus) => {
    const { avatarUrl, animation } = await sendAvatar(null, file, focus);
    onPicture?.({ avatarUrl, avatarAnimation: animation });
    void refreshAvatars(true);
  };
  const removeOwnAvatar = async () => {
    try {
      await xenaxio.removeAvatar(null);
      onPicture?.({ avatarUrl: null, avatarAnimation: null });
      void refreshAvatars(true);
    } catch (err) {
      toast.error(errorText(t, err));
    }
  };
  const sendOwnBanner = async (file: File, focus: Focus) => {
    const bannerImage = await sendBanner(file, focus);
    setP((x) => ({ ...x, banner: "custom", bannerImage }));
    changed({ ...stored.current, banner: "custom", bannerImage });
  };
  const removeOwnBanner = async () => {
    try {
      await xenaxio.removeBanner();
      setP((x) => ({ ...x, banner: x.banner === "custom" ? "none" : x.banner, bannerImage: null }));
      changed({ ...stored.current, banner: stored.current.banner === "custom" ? "none" : stored.current.banner, bannerImage: null });
    } catch (err) {
      toast.error(errorText(t, err));
    }
  };

  const phoneError = errorFor("phone");
  return (
    <>
      <div className={cn("space-y-5", scroll && "max-h-[70vh] overflow-y-auto pr-1")}>
        {showPicture && (
          <section>
            <h3 className="text-sm font-medium">{t("chat.profile_picture")}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <LargeAvatar colleague={person as Colleague | undefined} name={person?.displayName ?? ""} email={person?.email} className="scale-75 -m-3" />
              <ChooseFile label={person?.avatarUrl ? t("chat.profile_picture_replace") : t("chat.profile_picture_choose")} onFile={(file) => setPicking({ what: "avatar", file })} />
              {person?.avatarUrl && (
                <button type="button" onClick={() => void removeOwnAvatar()} className="flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground hover:bg-accent">
                  <IconTrash size={15} />
                  {t("chat.profile_picture_remove")}
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("chat.profile_picture_hint")}</p>
            {picking?.what === "avatar" && <PickedPicture file={picking.file} aspect={1} round label={t("chat.profile_picture")} send={sendOwnAvatar} onDone={() => setPicking(null)} />}
          </section>
        )}

        {nameField}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            {t("chat.profile_title")}
            <input value={p.title ?? ""} maxLength={100} onChange={(e) => set("title", e.target.value)} className={cn(field, "border-input focus:ring-ring")} />
          </label>
          <label className="text-sm font-medium">
            {t("chat.profile_department")}
            <input value={p.department ?? ""} maxLength={100} onChange={(e) => set("department", e.target.value)} className={cn(field, "border-input focus:ring-ring")} />
          </label>
          <div className="text-sm font-medium">
            <label htmlFor="profile-phone">{t("chat.profile_phone")}</label>
            <input
              id="profile-phone"
              value={p.phone ?? ""}
              maxLength={40}
              inputMode="tel"
              aria-invalid={!!phoneError}
              aria-describedby={phoneError ? "profile-phone-error" : undefined}
              onChange={(e) => (set("phone", e.target.value), clearIssue("phone"))}
              onBlur={() => touch("phone")}
              className={cn(field, phoneError ? "border-destructive ring-1 ring-destructive/60 focus:ring-destructive/60" : "border-input focus:ring-ring")}
            />
            {phoneError && (
              <p id="profile-phone-error" className="mt-1 text-xs font-normal text-destructive">
                {phoneError}
              </p>
            )}
          </div>
          <label className="text-sm font-medium">
            {t("chat.profile_pronouns")}
            <input value={p.pronouns ?? ""} maxLength={40} onChange={(e) => set("pronouns", e.target.value)} className={cn(field, "border-input focus:ring-ring")} />
          </label>
        </div>
        <label className="block text-sm font-medium">
          {t("chat.profile_about")}
          <textarea value={p.about ?? ""} maxLength={300} rows={3} onChange={(e) => set("about", e.target.value)} className={cn(field, "h-auto border-input py-1.5 focus:ring-ring")} />
        </label>

        <section>
          <h3 className="text-sm font-medium">{t("chat.profile_contacts")}</h3>
          {rows.length > 1 && <p className="text-xs text-muted-foreground">{t("chat.profile_contact_order_hint")}</p>}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <ul className="mt-1.5 space-y-1.5">
                {rows.map((r, i) => (
                  <ContactRow
                    key={r.id}
                    row={r}
                    index={i}
                    error={errorFor(`contacts.${i}.value`)}
                    onChange={(next) => {
                      setRows((all) => all.map((x) => (x.id === r.id ? next : x)));
                      clearIssue(`contacts.${i}.`);
                    }}
                    onBlur={() => touch(`contacts.${i}.value`)}
                    onRemove={() => {
                      setRows((all) => all.filter((x) => x.id !== r.id));
                      clearIssue("contacts.");
                    }}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          {rows.length < 10 && (
            <button type="button" onClick={() => setRows((all) => [...all, { id: ++rowIds, kind: "telegram", value: "" }])} className="mt-1.5 flex items-center gap-1 rounded px-2 py-1 text-sm text-primary hover:bg-accent">
              <IconPlus size={14} />
              {t("chat.profile_contact_add")}
            </button>
          )}
        </section>

        <section>
          <h3 className="text-sm font-medium">{t("chat.profile_banner")}</h3>
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
                className={cn("h-8 w-14 rounded-md border", p.banner === b ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : "border-border")}
                style={BANNER_STYLE[b] ? { backgroundImage: BANNER_STYLE[b] } : undefined}
              />
            ))}
            {picture && (
              <button
                type="button"
                role="radio"
                aria-checked={p.banner === "custom"}
                aria-label={t("chat.banner_custom")}
                title={t("chat.banner_custom")}
                onClick={() => set("banner", "custom")}
                className={cn("h-8 w-14 overflow-hidden rounded-md border", p.banner === "custom" ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : "border-border")}
              >
                <img src={withBasePath(picture.url)} alt="" className="h-full w-full object-cover" />
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ChooseFile label={picture ? t("chat.banner_custom_replace") : t("chat.banner_custom_choose")} onFile={(file) => setPicking({ what: "banner", file })} icon={<IconPlus size={15} />} />
            {picture && (
              <button type="button" onClick={() => void removeOwnBanner()} className="flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground hover:bg-accent">
                <IconTrash size={15} />
                {t("chat.banner_custom_remove")}
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("chat.banner_custom_hint")}</p>
          {picking?.what === "banner" && <PickedPicture file={picking.file} aspect={BANNER_ASPECT} label={t("chat.profile_banner")} send={sendOwnBanner} onDone={() => setPicking(null)} />}
        </section>

        <section>
          <h3 className="text-sm font-medium">{t("chat.profile_frame")}</h3>
          <div className="mt-1 flex flex-wrap gap-3" role="radiogroup" aria-label={t("chat.profile_frame")}>
            {FRAMES.map((f) => (
              <button key={f} type="button" role="radio" aria-checked={p.frame === f} aria-label={t(`chat.frame_${f}`)} title={t(`chat.frame_${f}`)} onClick={() => set("frame", f)} className={cn("rounded-full p-1", p.frame === f && "bg-accent")}>
                <span className={cn("inline-flex rounded-full", FRAME_STYLE[f])}>
                  <span className="block h-8 w-8 rounded-full bg-muted" />
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        {submitted && Object.keys({ ...localErrors, ...serverIssues }).length > 0 && (
          <span className="mr-auto text-xs text-destructive" role="alert">
            {t("chat.profile_fix_marked")}
          </span>
        )}
        {onCancel && (
          <button type="button" onClick={onCancel} className="h-9 rounded-md px-3 text-sm hover:bg-accent">
            {t("chat.cancel")}
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => void save()} className="h-9 rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">
          {t("chat.save_edit")}
        </button>
      </div>
    </>
  );
}

/** Edit one's own profile in the chat: the same form as in Settings → Account; the status in its own tab. */
export function ProfileDialog({
  address,
  initial,
  colleague,
  onClose,
  nameField,
  statusTab,
}: {
  address: string;
  initial: UserProfile | undefined;
  colleague?: Colleague;
  onClose: () => void;
  /** The own name (saved on its own, step 101). */
  nameField?: ReactNode;
  /** The status (saved on its own). */
  statusTab?: ReactNode;
}) {
  const t = useXT();
  const setProfile = useChatStore((s) => s.setProfile);
  const setColleague = useChatStore((s) => s.setColleague);
  const [tab, setTab] = useState<"profile" | "status">("profile");
  return (
    <Modal title={t("chat.profile_edit")} onClose={onClose} wide>
      {statusTab && (
        <div role="tablist" aria-label={t("chat.profile_edit")} className="-mt-1 mb-3 flex gap-1 border-b border-border">
          {(["profile", "status"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn("-mb-px border-b-2 px-3 py-1.5 text-sm font-medium", tab === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              {t(k === "profile" ? "chat.profile_tab_profile" : "chat.profile_tab_status")}
            </button>
          ))}
        </div>
      )}
      {tab === "status" && statusTab ? (
        <div className="max-h-[70vh] overflow-y-auto pr-1">{statusTab}</div>
      ) : (
        <ProfileForm
          initial={initial}
          person={colleague}
          nameField={nameField}
          scroll
          onChange={(p) => {
            setProfile(address, p);
            usePeopleStore.getState().changed(colleague?.email, { profile: p });
          }}
          onPicture={(change) => {
            setColleague(address, change);
            usePeopleStore.getState().changed(colleague?.email, change);
          }}
          onSaved={onClose}
          onCancel={onClose}
        />
      )}
    </Modal>
  );
}

export type { AvatarAnimation };
