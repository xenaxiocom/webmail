"use client";

// xenaxio step 118: small pieces the Projects section shares — initials of a
// person, a status chip, colours of columns, a modal frame and a picker of colleagues.
import { type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { X } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { cn } from "@/lib/utils";
import { useXT } from "@/lib/xenaxio/i18n";
import { type CompanyPerson, usePeopleStore } from "@/lib/xenaxio/people";
import { STATUS_COLORS, type StatusColor } from "@/lib/xenaxio/projects";

/**
 * Step 132 (rule 11): the colours of stages and columns are colours of the theme,
 * so themes, company colours and the dark mode change them too. Whole class
 * names, so Tailwind finds them: chip, dot (also the stripe on top of a column)
 * and the column's light tint (a gradient over its own background).
 */
export interface Tone {
  chip: string;
  dot: string;
  tint: string;
}

const TONES: Record<StatusColor, Tone> = {
  blue: { chip: "bg-info/15 text-info", dot: "bg-info", tint: "bg-linear-to-b from-info/10 to-info/4" },
  amber: { chip: "bg-warning/15 text-warning", dot: "bg-warning", tint: "bg-linear-to-b from-warning/10 to-warning/4" },
  green: { chip: "bg-success/15 text-success", dot: "bg-success", tint: "bg-linear-to-b from-success/10 to-success/4" },
  red: { chip: "bg-destructive/15 text-destructive", dot: "bg-destructive", tint: "bg-linear-to-b from-destructive/10 to-destructive/4" },
  gray: { chip: "bg-muted text-muted-foreground", dot: "bg-muted-foreground", tint: "bg-linear-to-b from-muted-foreground/10 to-muted-foreground/4" },
  violet: { chip: "bg-tag-violet/15 text-tag-violet", dot: "bg-tag-violet", tint: "bg-linear-to-b from-tag-violet/10 to-tag-violet/4" },
  teal: { chip: "bg-tag-teal/15 text-tag-teal", dot: "bg-tag-teal", tint: "bg-linear-to-b from-tag-teal/10 to-tag-teal/4" },
  pink: { chip: "bg-tag-pink/15 text-tag-pink", dot: "bg-tag-pink", tint: "bg-linear-to-b from-tag-pink/10 to-tag-pink/4" },
};

/** The classes of a colour; null for none or an unknown one. */
export function tone(color: string | null | undefined): Tone | null {
  return (color && TONES[color as StatusColor]) || null;
}

export function StatusChip({ text, color }: { text: string; color?: string }) {
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium", (tone(color) ?? TONES.gray).chip)}>{text}</span>;
}

/** Step 132: a row of colour swatches and "none" (column menu, stage editor). */
export function ColorPicker({ value, onChange, allowNone = true }: { value: StatusColor | null; onChange: (color: StatusColor | null) => void; allowNone?: boolean }) {
  const t = useXT();
  return (
    <div role="radiogroup" aria-label={t("projects.column_color")} className="flex flex-wrap items-center gap-1.5">
      {allowNone && (
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          title={t("projects.column_color_none")}
          aria-label={t("projects.column_color_none")}
          onClick={() => onChange(null)}
          className={cn("relative h-5 w-5 rounded-full border border-border bg-background after:absolute after:left-1/2 after:top-1/2 after:h-px after:w-4 after:-translate-x-1/2 after:-rotate-45 after:bg-muted-foreground", value === null && "ring-2 ring-ring ring-offset-1 ring-offset-background")}
        />
      )}
      {STATUS_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          title={t(`typeeditor.colors.${c}`)}
          aria-label={t(`typeeditor.colors.${c}`)}
          onClick={() => onChange(c)}
          className={cn("h-5 w-5 rounded-full", TONES[c].dot, value === c && "ring-2 ring-ring ring-offset-1 ring-offset-background")}
        />
      ))}
    </div>
  );
}

export function initials(name: string): string {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

export function PersonBadge({ name, email, size = "sm" }: { name: string; email?: string; size?: "sm" | "md" }) {
  const person = usePeopleStore((s) => (email ? s.people.get(email.toLowerCase()) : undefined));
  const px = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";
  if (person?.avatarUrl) return <img src={person.avatarUrl} alt="" title={name} className={cn("shrink-0 rounded-full object-cover", px)} />;
  return (
    <span title={name} className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary", px)}>
      {initials(name)}
    </span>
  );
}

export function Modal({ open, title, onClose, children, wide = false }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const t = useXT();
  const id = useId();
  const ref = useFocusTrap({ isActive: open, onEscape: onClose, restoreFocus: true });
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className={cn("max-h-[90dvh] w-full overflow-y-auto rounded-t-xl border border-border bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-xl sm:rounded-xl sm:pb-4", wide ? "sm:max-w-2xl" : "sm:max-w-md")}
      >
        {/* The title and the close button stay in view while a long dialog scrolls. */}
        <div className="sticky -top-4 z-10 -mx-4 -mt-4 mb-3 flex items-center gap-2 bg-background px-4 pt-4 pb-1">
          <h2 id={id} className="min-w-0 flex-1 text-base font-semibold">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="rounded p-2 text-muted-foreground hover:bg-muted sm:p-1" aria-label={t("common.close")}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Colleagues of the company to choose from (by id); `exclude` are already in. */
export function PeoplePicker({ selected, onChange, exclude = [], single = false }: { selected: string[]; onChange: (ids: string[]) => void; exclude?: string[]; single?: boolean }) {
  const t = useXT();
  const people = usePeopleStore((s) => s.people);
  const load = usePeopleStore((s) => s.load);
  const [q, setQ] = useState("");
  useEffect(() => {
    void load();
  }, [load]);
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return [...people.values()]
      .filter((p) => !exclude.includes(p.id))
      .filter((p) => words.every((w) => `${p.displayName} ${p.email}`.toLowerCase().includes(w)))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [people, q, exclude]);
  const toggle = (p: CompanyPerson) => {
    if (single) onChange(selected.includes(p.id) ? [] : [p.id]);
    else onChange(selected.includes(p.id) ? selected.filter((x) => x !== p.id) : [...selected, p.id]);
  };
  return (
    <div className="space-y-2">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("projects.people_search")} aria-label={t("projects.people_search")} />
      <ul className="max-h-48 overflow-y-auto rounded-md border border-border">
        {list.map((p) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted">
              <input type={single ? "radio" : "checkbox"} checked={selected.includes(p.id)} onChange={() => toggle(p)} />
              <PersonBadge name={p.displayName} email={p.email} />
              <span className="min-w-0 flex-1 truncate">{p.displayName}</span>
              <span className="hidden truncate text-xs text-muted-foreground sm:inline">{p.email}</span>
            </label>
          </li>
        ))}
        {list.length === 0 && <li className="px-2 py-2 text-sm text-muted-foreground">{t("projects.people_none")}</li>}
      </ul>
    </div>
  );
}

export const selectClass = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

/**
 * A date field that stays inside its column on the iPhone: Safari gives
 * `type="date"` its own minimum width and height, so the field stuck out to the
 * right and was taller than the others.
 */
export const dateClass = "min-w-0 appearance-none text-left [&::-webkit-date-and-time-value]:text-left";
