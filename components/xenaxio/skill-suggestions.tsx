"use client";

// Step 142 (Xenacore, stage 9): skills the assistant drafted from requests the
// person made again and again, and new versions of their own skills after
// their corrections. Only a draft: the person edits it and creates it, or
// dismisses it; the assistant never creates or changes a skill itself.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/xenaxio/ui";
import { errorText, type SkillSuggestionItem, xenaxio } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";

function Draft({ s, onDone }: { s: SkillSuggestionItem; onDone: () => Promise<void> }) {
  const t = useXT();
  const [name, setName] = useState(s.name);
  const [description, setDescription] = useState(s.description);
  const [body, setBody] = useState(s.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onDone();
    } catch (err) {
      setError(errorText(t, err));
      setBusy(false);
    }
  };
  return (
    <li className="space-y-2 rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{s.kind === "new" ? t("skills.suggested_new") : t("skills.suggested_version", { name: s.name })}</p>
      {s.note && <p className="text-sm">{s.note}</p>}
      {s.kind === "new" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>{t("skills.name")}</span>
            <Input value={name} maxLength={64} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t("skills.description")}</span>
            <Input value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
      )}
      <label className="block space-y-1 text-sm">
        <span>{t("skills.body")}</span>
        <textarea className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={body} maxLength={8000} onChange={(e) => setBody(e.target.value)} />
      </label>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || !name.trim() || !description.trim() || !body.trim()} onClick={() => void act(() => xenaxio.acceptSkillSuggestion(s.id, { name, description, body }))}>
          {s.kind === "new" ? t("skills.suggested_create") : t("skills.suggested_apply")}
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => xenaxio.dismissSkillSuggestion(s.id))}>
          {t("skills.suggested_dismiss")}
        </Button>
      </div>
    </li>
  );
}

export function SkillSuggestions({ onChanged }: { onChanged: () => Promise<void> }) {
  const t = useXT();
  const [list, setList] = useState<SkillSuggestionItem[]>([]);
  const load = useCallback(async () => {
    try {
      setList((await xenaxio.skillSuggestions()).suggestions);
    } catch {
      setList([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!list.length) return null;
  return (
    <section id="skill-suggestions" className="space-y-2" aria-labelledby="skill-suggestions-title">
      <h3 id="skill-suggestions-title" className="text-sm font-medium">
        {t("skills.suggested_title")}
      </h3>
      <p className="text-xs text-muted-foreground">{t("skills.suggested_intro")}</p>
      <ul className="space-y-2">
        {list.map((s) => (
          <Draft
            key={s.id}
            s={s}
            onDone={async () => {
              await load();
              await onChanged();
            }}
          />
        ))}
      </ul>
    </section>
  );
}
