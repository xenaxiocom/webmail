"use client";

// Step 91: facts the assistant keeps — one row each with what it is about,
// until when it holds and where it came from; change and delete. Used on the
// user's page "Was der Assistent weiß" and the admin's "Firmenwissen".
import { type FormEvent, useState } from "react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MemoryInput, MemoryNote } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";

/** A fact whose last day has passed (the assistant no longer uses it). */
export function isExpiredFact(note: Pick<MemoryNote, "validUntil">, today = new Date()): boolean {
  return !!note.validUntil && note.validUntil < today.toISOString().slice(0, 10);
}

function FactForm({ initial, maxLength, busy, submitLabel, onSubmit, onCancel }: { initial?: MemoryInput; maxLength: number; busy: boolean; submitLabel: string; onSubmit: (input: MemoryInput) => Promise<boolean>; onCancel?: () => void }) {
  const t = useXT();
  const [text, setText] = useState(initial?.text ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [until, setUntil] = useState(initial?.validUntil ?? "");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await onSubmit({ text: text.trim(), ...(subject.trim() ? { subject: subject.trim() } : {}), validUntil: until || null });
    if (ok && !initial) {
      setText("");
      setSubject("");
      setUntil("");
    }
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Input className="min-w-0 flex-[2]" value={text} maxLength={maxLength} placeholder={t("memory.add_placeholder")} aria-label={t("memory.fact")} onChange={(e) => setText(e.target.value)} />
        <Input className="min-w-0 flex-1" value={subject} maxLength={120} placeholder={t("memory.subject_placeholder")} aria-label={t("memory.subject")} onChange={(e) => setSubject(e.target.value)} />
        <Input className="w-40" type="date" value={until} aria-label={t("memory.until")} onChange={(e) => setUntil(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" type="submit" disabled={busy || !text.trim()}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button size="sm" variant="outline" type="button" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        )}
      </div>
    </form>
  );
}

function FactRow({ note, maxLength, busy, onSave, onDelete }: { note: MemoryNote; maxLength: number; busy: boolean; onSave?: (input: MemoryInput) => Promise<boolean>; onDelete?: () => void }) {
  const t = useXT();
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
  if (editing && onSave) {
    return (
      <li className="px-4 py-3">
        <FactForm
          initial={{ text: note.text, subject: note.subject ?? "", validUntil: note.validUntil ?? "" }}
          maxLength={maxLength}
          busy={busy}
          submitLabel={t("memory.save")}
          onSubmit={async (input) => {
            const ok = await onSave(input);
            if (ok) setEditing(false);
            return ok;
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }
  const expired = isExpiredFact(note);
  const source = note.source?.type ?? "chat";
  return (
    <li className={`flex flex-wrap items-center gap-3 px-4 py-3 ${expired ? "opacity-60" : ""}`}>
      <span className="min-w-0 flex-1">
        <span className="block break-words">
          {note.subject && <span className="font-medium">{note.subject}: </span>}
          {note.text}
        </span>
        <span className="block text-xs text-muted-foreground">
          {[
            t(`memory.source_${source}`),
            note.trust === "data" ? t("memory.from_data") : null,
            note.validUntil ? (expired ? t("memory.expired", { date: day(note.validUntil) }) : t("memory.valid_until", { date: day(note.validUntil) })) : null,
            t("memory.since", { date: day(note.updatedAt) }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      {onSave && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(true)}>
          {t("memory.edit")}
        </Button>
      )}
      {onDelete && (
        <Button size="sm" variant="outline" disabled={busy} onClick={onDelete}>
          {t("memory.delete")}
        </Button>
      )}
    </li>
  );
}

/** A list of facts; without handlers it is read-only. */
export function FactList({ notes, maxLength, busy, empty, onSave, onDelete }: { notes: MemoryNote[]; maxLength: number; busy: boolean; empty: string; onSave?: (note: MemoryNote, input: MemoryInput) => Promise<boolean>; onDelete?: (note: MemoryNote) => void }) {
  if (notes.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {notes.map((note) => (
        <FactRow
          key={note.id}
          note={note}
          maxLength={maxLength}
          busy={busy}
          {...(onSave ? { onSave: (input: MemoryInput) => onSave(note, input) } : {})}
          {...(onDelete ? { onDelete: () => onDelete(note) } : {})}
        />
      ))}
    </ul>
  );
}

export function AddFact({ maxLength, busy, full, fullText, hint, onAdd }: { maxLength: number; busy: boolean; full: boolean; fullText: string; hint: string; onAdd: (input: MemoryInput) => Promise<boolean> }) {
  const t = useXT();
  return (
    <section className="space-y-2" aria-label={t("memory.add")}>
      <h3 className="text-sm font-medium">{t("memory.add")}</h3>
      {full ? <p className="text-xs text-muted-foreground">{fullText}</p> : <FactForm maxLength={maxLength} busy={busy} submitLabel={t("memory.add_button")} onSubmit={onAdd} />}
      {!full && <p className="text-xs text-muted-foreground">{hint}</p>}
    </section>
  );
}
