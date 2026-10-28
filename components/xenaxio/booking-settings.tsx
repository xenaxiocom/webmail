"use client";

// Step 56: online booking in Settings → Calendar (xenaxio build only).
// The employee's booking address, meeting types (length, place, working hours,
// rules), open requests to confirm and the upcoming booked meetings.
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { ExternalLink, Pencil, Plus, Trash2 } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/xenaxio/copy-button";
import { Notice } from "@/components/xenaxio/ui";
import { errorText } from "@/lib/xenaxio/api";
import { XENAXIO_BFF } from "@/lib/xenaxio/bff";
import {
  type Ask,
  booking,
  type BookingItem,
  type BookingSettings as Settings,
  type BookingType,
  type BookingTypeInput,
  type Hours,
  type LocationKind,
  timeZones,
  WEEKDAYS,
} from "@/lib/xenaxio/booking";
import { useXT } from "@/lib/xenaxio/i18n";

const button =
  "inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50 disabled:pointer-events-none";
const primary = "inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50";
const select = "rounded-md border border-border bg-background px-2 py-1.5 text-sm";
const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#64748b"];

const WORKDAYS: Hours = { mo: [["09:00", "17:00"]], tu: [["09:00", "17:00"]], we: [["09:00", "17:00"]], th: [["09:00", "17:00"]], fr: [["09:00", "17:00"]] };

function blankType(): BookingTypeInput {
  return {
    slug: "",
    title: "",
    description: "",
    color: COLORS[0]!,
    durationMinutes: 30,
    locationKind: "video",
    location: "",
    hours: WORKDAYS,
    bufferBefore: 0,
    bufferAfter: 0,
    minNoticeMinutes: 240,
    horizonDays: 60,
    slotStepMinutes: 30,
    maxPerDay: null,
    calendarId: null,
    busyCalendarIds: null,
    askPhone: "off",
    askMessage: "optional",
    allowRequests: true,
    reminder: true,
    active: true,
  };
}

/** "Erstgespräch Steuer" → "erstgespraech-steuer" */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** The code a company puts on its website: the page in a frame, or a button. */
export function embedCode(url: string, title: string, label: string): { frame: string; link: string } {
  const safe = (s: string) => s.replace(/[<>"&]/g, "");
  return {
    frame: `<iframe src="${safe(url)}" title="${safe(title)}" style="width:100%;min-height:760px;border:0" loading="lazy"></iframe>`,
    link: `<a href="${safe(url)}" target="_blank" rel="noopener">${safe(label)}</a>`,
  };
}

function useWhen() {
  const locale = useLocale();
  return useCallback(
    (iso: string) => new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", { weekday: "short", dateStyle: undefined, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)),
    [locale],
  );
}

// --- Editor --------------------------------------------------------------------

function HoursEditor({ value, onChange }: { value: Hours; onChange: (h: Hours) => void }) {
  const t = useXT();
  const set = (day: (typeof WEEKDAYS)[number], ranges: [string, string][]) => {
    const next = { ...value };
    if (ranges.length) next[day] = ranges;
    else delete next[day];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {WEEKDAYS.map((day) => {
        const ranges = value[day] ?? [];
        return (
          <div key={day} className="flex flex-wrap items-start gap-2">
            <label className="flex w-20 shrink-0 items-center gap-2 pt-1.5 text-sm">
              <input type="checkbox" checked={ranges.length > 0} onChange={(e) => set(day, e.target.checked ? [["09:00", "17:00"]] : [])} />
              {t(`booking_settings.days.${day}`)}
            </label>
            {ranges.length === 0 ? (
              <span className="pt-1.5 text-sm text-muted-foreground">{t("booking_settings.day_off")}</span>
            ) : (
              <div className="space-y-1.5">
                {ranges.map(([from, to], i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Input type="time" step={900} value={from} aria-label={t("booking_settings.from")} className="w-28" onChange={(e) => set(day, ranges.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} />
                    <span className="text-muted-foreground">–</span>
                    <Input type="time" step={900} value={to} aria-label={t("booking_settings.to")} className="w-28" onChange={(e) => set(day, ranges.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} />
                    <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={t("booking_settings.remove_range")} onClick={() => set(day, ranges.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                    {i === ranges.length - 1 && ranges.length < 6 && (
                      <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={t("booking_settings.add_range")} onClick={() => set(day, [...ranges, [to, to < "23:00" ? `${String(Math.min(23, Number(to.slice(0, 2)) + 1)).padStart(2, "0")}${to.slice(2)}` : "23:45"]])}>
                        <Plus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[200px_minmax(0,1fr)] sm:items-start sm:gap-3">
      <span className="pt-1.5 text-sm font-medium">{label}</span>
      <div className="space-y-1">
        {children}
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

function TypeEditor({
  initial,
  calendars,
  onSave,
  onCancel,
}: {
  initial: BookingTypeInput;
  calendars: Settings["calendars"];
  onSave: (input: BookingTypeInput) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useXT();
  const [v, setV] = useState<BookingTypeInput>(initial);
  const [slugTouched, setSlugTouched] = useState(!!initial.slug);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const set = <K extends keyof BookingTypeInput>(key: K, value: BookingTypeInput[K]) => setV((x) => ({ ...x, [key]: value }));
  const durations = [15, 20, 30, 45, 60, 90, 120];
  const asks: Ask[] = ["off", "optional", "required"];

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave({ ...v, slug: v.slug || slugify(v.title) });
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-4 rounded-lg border border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Row label={t("booking_settings.title")}>
        <Input
          id={`${id}-title`}
          required
          maxLength={100}
          value={v.title}
          placeholder={t("booking_settings.title_placeholder")}
          onChange={(e) => setV((x) => ({ ...x, title: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) }))}
        />
      </Row>
      <Row label={t("booking_settings.slug")} hint={t("booking_settings.slug_hint")}>
        <Input
          required
          maxLength={40}
          pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
          value={v.slug}
          onChange={(e) => {
            setSlugTouched(true);
            set("slug", e.target.value.toLowerCase());
          }}
        />
      </Row>
      <Row label={t("booking_settings.description")}>
        <textarea value={v.description} maxLength={2000} rows={3} onChange={(e) => set("description", e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
      </Row>
      <Row label={t("booking_settings.color")}>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("booking_settings.color")}>
          {COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={v.color === c} aria-label={c} onClick={() => set("color", c)} className={`h-6 w-6 rounded-full border-2 ${v.color === c ? "border-foreground" : "border-transparent"}`} style={{ backgroundColor: c }} />
          ))}
        </div>
      </Row>
      <Row label={t("booking_settings.duration")}>
        <div className="flex flex-wrap items-center gap-2">
          <select className={select} value={durations.includes(v.durationMinutes) ? String(v.durationMinutes) : "custom"} onChange={(e) => e.target.value !== "custom" && set("durationMinutes", Number(e.target.value))}>
            {durations.map((d) => (
              <option key={d} value={d}>
                {t("booking_settings.minutes", { n: d })}
              </option>
            ))}
            <option value="custom">{t("booking_settings.custom")}</option>
          </select>
          <Input type="number" min={5} max={480} value={v.durationMinutes} onChange={(e) => set("durationMinutes", Number(e.target.value))} className="w-24" aria-label={t("booking_settings.duration")} />
        </div>
      </Row>
      <Row label={t("booking_settings.place")} hint={v.locationKind === "video" ? t("booking_settings.video_hint") : undefined}>
        <select className={select} value={v.locationKind} onChange={(e) => set("locationKind", e.target.value as LocationKind)}>
          {(["video", "phone", "address", "none"] as const).map((k) => (
            <option key={k} value={k}>
              {t(`booking_settings.place_kind.${k}`)}
            </option>
          ))}
        </select>
        {(v.locationKind === "video" || v.locationKind === "address") && (
          <Input
            type={v.locationKind === "video" ? "url" : "text"}
            required={v.locationKind === "address"}
            maxLength={500}
            value={v.location}
            placeholder={v.locationKind === "video" ? "https://zoom.us/j/…" : t("booking_settings.address_placeholder")}
            onChange={(e) => set("location", e.target.value)}
          />
        )}
      </Row>
      <Row label={t("booking_settings.hours")} hint={t("booking_settings.hours_hint")}>
        <HoursEditor value={v.hours} onChange={(h) => set("hours", h)} />
      </Row>
      <Row label={t("booking_settings.rules")}>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">{t("booking_settings.buffer_before")}</span>
            <select className={select} value={v.bufferBefore} onChange={(e) => set("bufferBefore", Number(e.target.value))}>
              {[0, 5, 10, 15, 30, 45, 60].map((n) => (
                <option key={n} value={n}>
                  {t("booking_settings.minutes", { n })}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">{t("booking_settings.buffer_after")}</span>
            <select className={select} value={v.bufferAfter} onChange={(e) => set("bufferAfter", Number(e.target.value))}>
              {[0, 5, 10, 15, 30, 45, 60].map((n) => (
                <option key={n} value={n}>
                  {t("booking_settings.minutes", { n })}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">{t("booking_settings.notice")}</span>
            <select className={select} value={v.minNoticeMinutes} onChange={(e) => set("minNoticeMinutes", Number(e.target.value))}>
              {[0, 60, 120, 240, 720, 1440, 2880, 10080].map((n) => (
                <option key={n} value={n}>
                  {n < 60 ? t("booking_settings.none") : n < 1440 ? t("booking_settings.hours_n", { n: n / 60 }) : t("booking_settings.days_n", { n: n / 1440 })}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">{t("booking_settings.horizon")}</span>
            <select className={select} value={v.horizonDays} onChange={(e) => set("horizonDays", Number(e.target.value))}>
              {[7, 14, 30, 60, 90, 180, 365].map((n) => (
                <option key={n} value={n}>
                  {t("booking_settings.days_n", { n })}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">{t("booking_settings.step")}</span>
            <select className={select} value={v.slotStepMinutes} onChange={(e) => set("slotStepMinutes", Number(e.target.value))}>
              {[10, 15, 20, 30, 45, 60, 90, 120].map((n) => (
                <option key={n} value={n}>
                  {t("booking_settings.minutes", { n })}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">{t("booking_settings.max_per_day")}</span>
            <select className={select} value={v.maxPerDay ?? 0} onChange={(e) => set("maxPerDay", Number(e.target.value) || null)}>
              <option value={0}>{t("booking_settings.unlimited")}</option>
              {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Row>
      <Row label={t("booking_settings.calendar")}>
        <select className={select} value={v.calendarId ?? ""} onChange={(e) => set("calendarId", e.target.value || null)}>
          <option value="">{t("booking_settings.default_calendar")}</option>
          {calendars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Row>
      <Row label={t("booking_settings.busy_from")} hint={t("booking_settings.busy_hint")}>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={v.busyCalendarIds === null} onChange={(e) => set("busyCalendarIds", e.target.checked ? null : calendars.map((c) => c.id))} />
          {t("booking_settings.busy_all")}
        </label>
        {v.busyCalendarIds !== null && (
          <div className="space-y-1 pl-6">
            {calendars.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={v.busyCalendarIds?.includes(c.id) ?? false}
                  onChange={(e) => set("busyCalendarIds", e.target.checked ? [...(v.busyCalendarIds ?? []), c.id] : (v.busyCalendarIds ?? []).filter((x) => x !== c.id))}
                />
                {c.name}
              </label>
            ))}
          </div>
        )}
      </Row>
      <Row label={t("booking_settings.questions")}>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">{t("booking_settings.ask_phone")}</span>
            <select className={select} value={v.locationKind === "phone" ? "required" : v.askPhone} disabled={v.locationKind === "phone"} onChange={(e) => set("askPhone", e.target.value as Ask)}>
              {asks.map((a) => (
                <option key={a} value={a}>
                  {t(`booking_settings.ask.${a}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">{t("booking_settings.ask_message")}</span>
            <select className={select} value={v.askMessage} onChange={(e) => set("askMessage", e.target.value as Ask)}>
              {asks.map((a) => (
                <option key={a} value={a}>
                  {t(`booking_settings.ask.${a}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Row>
      <Row label={t("booking_settings.options")}>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={v.allowRequests} onChange={(e) => set("allowRequests", e.target.checked)} />
          <span>
            {t("booking_settings.allow_requests")}
            <span className="block text-xs text-muted-foreground">{t("booking_settings.allow_requests_hint")}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={v.reminder} onChange={(e) => set("reminder", e.target.checked)} />
          {t("booking_settings.reminder")}
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={v.active} onChange={(e) => set("active", e.target.checked)} />
          {t("booking_settings.active")}
        </label>
      </Row>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex gap-2">
        <button type="submit" className={primary} disabled={busy}>
          {t("booking_settings.save")}
        </button>
        <button type="button" className={button} onClick={onCancel} disabled={busy}>
          {t("booking_settings.cancel")}
        </button>
      </div>
    </form>
  );
}

// --- Lists ---------------------------------------------------------------------

function TypeCard({ type, onEdit, onDelete, onToggle }: { type: BookingType; onEdit: () => void; onDelete: () => void; onToggle: (active: boolean) => void }) {
  const t = useXT();
  const [embed, setEmbed] = useState(false);
  const code = type.url ? embedCode(type.url, type.title, t("booking_settings.embed_button_label")) : null;
  return (
    <li className="rounded-lg border border-border p-3" style={type.color ? { borderLeft: `4px solid ${type.color}` } : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            {type.title}
            {!type.active && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{t("booking_settings.inactive")}</span>}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("booking_settings.minutes", { n: type.durationMinutes })} · {t(`booking_settings.place_kind.${type.locationKind}`)}
          </p>
          {type.url && <p className="break-all text-xs text-muted-foreground">{type.url}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {type.url && <CopyButton value={type.url} />}
          {type.url && (
            <a href={type.url} target="_blank" rel="noopener noreferrer" className={button} aria-label={t("booking_settings.preview")}>
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          <button type="button" className={button} onClick={onEdit} aria-label={t("booking_settings.edit")}>
            <Pencil className="h-4 w-4" />
          </button>
          <button type="button" className={button} onClick={onDelete} aria-label={t("booking_settings.delete")}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={type.active} onChange={(e) => onToggle(e.target.checked)} />
          {t("booking_settings.active")}
        </label>
        {code && (
          <button type="button" className="text-primary hover:underline" onClick={() => setEmbed((x) => !x)} aria-expanded={embed}>
            {t("booking_settings.embed")}
          </button>
        )}
      </div>
      {embed && code && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-muted-foreground">{t("booking_settings.embed_hint")}</p>
          {[code.frame, code.link].map((c) => (
            <div key={c} className="flex items-start gap-2">
              <textarea readOnly value={c} rows={2} className="min-w-0 flex-1 rounded-md border border-input bg-muted/40 px-2 py-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <CopyButton value={c} />
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

function Requests({ items, onChanged }: { items: BookingItem[]; onChanged: () => void }) {
  const t = useXT();
  const when = useWhen();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (id: string, work: () => Promise<unknown>) => {
    setBusy(id);
    setError(null);
    try {
      await work();
      onChanged();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(null);
    }
  };
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">{t("booking_settings.requests", { n: items.length })}</h4>
      {error && <Notice kind="error">{error}</Notice>}
      <ul className="space-y-2">
        {items.map((r) => (
          <li key={r.id} className="rounded-lg border border-amber-300 bg-amber-50/50 p-3 dark:border-amber-700 dark:bg-amber-950/20">
            <p className="text-sm font-medium">
              {r.title} · {r.guest?.name} <span className="font-normal text-muted-foreground">&lt;{r.guest?.email}&gt;</span>
            </p>
            {r.guest?.phone && <p className="text-xs text-muted-foreground">{r.guest.phone}</p>}
            {r.guest?.message && <p className="mt-1 whitespace-pre-wrap text-sm">{r.guest.message}</p>}
            <ul className="mt-2 space-y-1.5">
              {r.proposals.map((p, i) => (
                <li key={p.start} className="flex flex-wrap items-center gap-2 text-sm">
                  <span>{when(p.start)}</span>
                  {p.conflict && <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{t("booking_settings.conflict")}</span>}
                  <button type="button" className={primary} disabled={busy === r.id || new Date(p.start) < new Date()} onClick={() => void run(r.id, () => booking.confirm(r.id, i))}>
                    {t("booking_settings.confirm")}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={`${button} mt-2`}
              disabled={busy === r.id}
              onClick={() => {
                const message = window.prompt(t("booking_settings.decline_prompt"));
                if (message === null) return;
                void run(r.id, () => booking.decline(r.id, message.trim() || undefined));
              }}
            >
              {t("booking_settings.decline")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Upcoming({ items, onChanged }: { items: BookingItem[]; onChanged: () => void }) {
  const t = useXT();
  const when = useWhen();
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  if (!items.length) return null;
  const shown = showAll ? items : items.slice(0, 5);
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">{t("booking_settings.upcoming")}</h4>
      {error && <Notice kind="error">{error}</Notice>}
      <ul className="divide-y divide-border rounded-lg border border-border">
        {shown.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <span>
              <span className="font-medium">{b.start ? when(b.start) : ""}</span> · {b.title} · {b.guest?.name}
            </span>
            <button
              type="button"
              className="text-xs text-red-600 hover:underline"
              onClick={() => {
                const message = window.prompt(t("booking_settings.cancel_prompt"));
                if (message === null) return;
                booking
                  .cancel(b.id, message.trim() || undefined)
                  .then(onChanged)
                  .catch((err: unknown) => setError(errorText(t, err)));
              }}
            >
              {t("booking_settings.cancel_meeting")}
            </button>
          </li>
        ))}
      </ul>
      {items.length > 5 && !showAll && (
        <button type="button" className="text-sm text-primary hover:underline" onClick={() => setShowAll(true)}>
          {t("booking_settings.show_all", { n: items.length })}
        </button>
      )}
    </div>
  );
}

// --- Section ---------------------------------------------------------------------

export function BookingSettings() {
  const t = useXT();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [lists, setLists] = useState<{ upcoming: BookingItem[]; requests: BookingItem[] }>({ upcoming: [], requests: [] });
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState<{ id: string | null; input: BookingTypeInput } | null>(null);
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const loadLists = useCallback(() => {
    booking.bookings().then(setLists).catch(() => undefined);
  }, []);
  const load = useCallback(() => {
    booking
      .settings()
      .then((s) => {
        setSettings(s);
        setSlug(s.profile.slug);
      })
      .catch(() => setLoadError(true));
    loadLists();
  }, [loadLists]);
  useEffect(() => {
    if (XENAXIO_BFF) load();
  }, [load]);

  const zones = useMemo(() => timeZones([settings?.profile.timeZone ?? "Europe/Berlin", "Europe/Berlin"]), [settings?.profile.timeZone]);
  if (!XENAXIO_BFF) return null;

  const profile = async (patch: { slug?: string; timeZone?: string; notify?: boolean }) => {
    setError(null);
    setSaved(false);
    try {
      const s = await booking.updateProfile(patch);
      setSettings(s);
      setSlug(s.profile.slug);
      setSaved(true);
    } catch (err) {
      setError(errorText(t, err));
    }
  };
  const saveType = async (input: BookingTypeInput) => {
    if (editing?.id) await booking.updateType(editing.id, input);
    else await booking.createType(input);
    setEditing(null);
    load();
  };
  const strip = ({ id: _id, url: _url, ...rest }: BookingType): BookingTypeInput => rest;

  return (
    <section className="mt-8 space-y-4 border-t border-border pt-6" data-settings-section="booking">
      <div>
        <h3 className="text-base font-semibold">{t("booking_settings.heading")}</h3>
        <p className="text-sm text-muted-foreground">{t("booking_settings.intro")}</p>
      </div>
      {loadError && <Notice kind="error">{t("errors.internal")}</Notice>}
      {settings && !settings.enabled && <Notice kind="info">{t("booking_settings.disabled_by_admin")}</Notice>}
      {settings && (
        <>
          <div className="space-y-3 rounded-lg border border-border p-3">
            <Row label={t("booking_settings.address")} hint={t("booking_settings.address_hint")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">{settings.profile.url.replace(/[^/]+$/, "")}</span>
                <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} maxLength={40} className="w-40" aria-label={t("booking_settings.address")} />
                {slug !== settings.profile.slug && (
                  <button type="button" className={button} onClick={() => void profile({ slug })}>
                    {t("booking_settings.save")}
                  </button>
                )}
                <CopyButton value={settings.profile.url} />
              </div>
            </Row>
            <Row label={t("booking_settings.time_zone")} hint={t("booking_settings.time_zone_hint")}>
              <select className={select} value={settings.profile.timeZone} onChange={(e) => void profile({ timeZone: e.target.value })}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </Row>
            <Row label={t("booking_settings.notify")}>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={settings.profile.notify} onChange={(e) => void profile({ notify: e.target.checked })} />
                {t("booking_settings.notify_text")}
              </label>
            </Row>
            {error && <Notice kind="error">{error}</Notice>}
            {saved && !error && <Notice kind="success">{t("booking_settings.saved")}</Notice>}
          </div>

          <Requests items={lists.requests} onChanged={loadLists} />
          <Upcoming items={lists.upcoming} onChanged={loadLists} />

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium">{t("booking_settings.types")}</h4>
              {!editing && settings.types.length < 10 && (
                <button type="button" className={button} onClick={() => setEditing({ id: null, input: blankType() })}>
                  <Plus className="h-4 w-4" />
                  {t("booking_settings.new_type")}
                </button>
              )}
            </div>
            {editing && !editing.id && <TypeEditor initial={editing.input} calendars={settings.calendars} onSave={saveType} onCancel={() => setEditing(null)} />}
            {settings.types.length === 0 && !editing && <p className="text-sm text-muted-foreground">{t("booking_settings.no_types")}</p>}
            <ul className="space-y-2">
              {settings.types.map((type) =>
                editing?.id === type.id ? (
                  <li key={type.id}>
                    <TypeEditor initial={editing.input} calendars={settings.calendars} onSave={saveType} onCancel={() => setEditing(null)} />
                  </li>
                ) : (
                  <TypeCard
                    key={type.id}
                    type={type}
                    onEdit={() => setEditing({ id: type.id, input: strip(type) })}
                    onDelete={() => {
                      if (!window.confirm(t("booking_settings.delete_confirm", { title: type.title }))) return;
                      booking
                        .deleteType(type.id)
                        .then(load)
                        .catch((err: unknown) => setError(errorText(t, err)));
                    }}
                    onToggle={(active) => {
                      booking
                        .updateType(type.id, { ...strip(type), active })
                        .then(load)
                        .catch((err: unknown) => setError(errorText(t, err)));
                    }}
                  />
                ),
              )}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
