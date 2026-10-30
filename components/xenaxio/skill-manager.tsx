"use client";

// Step 84: skills (SKILL.md) — instructions people write for the assistant,
// e.g. "offers follow our template". The same list and editor for the
// company's skills (admin) and a user's own: write or upload, switch off,
// change (each change is a version), go back to a version, download, delete.
import { type ChangeEvent, type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/xenaxio/ui";
import { withBasePath } from "@/lib/browser-navigation";
import { errorText, type SkillApi, type SkillInput, type SkillItem, type SkillVersionInfo, XenaxioApiError } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";

export const SKILL_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export const MAX_SKILL_DESCRIPTION = 300;
export const MAX_SKILL_BODY = 8_000;
const MAX_FILE_BYTES = 20_000;

type T = ReturnType<typeof useXT>;

/** A readable error; for a bad skill it names the field (the server says it in English). */
export function skillError(t: T, err: unknown): string {
  if (err instanceof XenaxioApiError && err.code === "skill_invalid") {
    const reason = String(err.details?.reason ?? "");
    const field = reason.split(":")[0];
    if (field === "name" || field === "description" || field === "text" || field === "header") return t(`skills.invalid_${field}`, { max: field === "description" ? MAX_SKILL_DESCRIPTION : MAX_SKILL_BODY });
  }
  return errorText(t, err);
}

interface Draft {
  name: string;
  description: string;
  body: string;
}
const EMPTY: Draft = { name: "", description: "", body: "" };

function Editor({ api, editing, onDone, onCancel }: { api: SkillApi; editing: (SkillItem & { body: string }) | null; onDone: () => Promise<void>; onCancel: () => void }) {
  const t = useXT();
  const [draft, setDraft] = useState<Draft>(editing ? { name: editing.name, description: editing.description, body: editing.body } : EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameOk = !draft.name || SKILL_NAME.test(draft.name);

  const save = async (input: SkillInput) => {
    setBusy(true);
    setError(null);
    try {
      if (editing) await api.update(editing.id, input);
      else await api.create(input);
      await onDone();
    } catch (err) {
      setError(skillError(t, err));
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save({ name: draft.name.trim(), description: draft.description.trim(), body: draft.body });
  };
  // A SKILL.md file is checked by the server like the form.
  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError(t("skills.file_too_big"));
      return;
    }
    await save({ file: await file.text() });
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label={editing ? t("skills.edit_title", { name: editing.name }) : t("skills.new_title")}>
      <h3 className="font-medium">{editing ? t("skills.edit_title", { name: editing.name }) : t("skills.new_title")}</h3>
      <div className="space-y-1">
        <label htmlFor="skill-name" className="text-sm font-medium">
          {t("skills.name")}
        </label>
        <Input id="skill-name" className="font-mono" value={draft.name} maxLength={64} placeholder="angebot" autoComplete="off" spellCheck={false} aria-invalid={!nameOk || undefined} onChange={(e) => setDraft({ ...draft, name: e.target.value.toLowerCase() })} required />
        <p className={nameOk ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>{t("skills.name_hint")}</p>
      </div>
      <div className="space-y-1">
        <label htmlFor="skill-description" className="text-sm font-medium">
          {t("skills.description")}
        </label>
        <Input id="skill-description" value={draft.description} maxLength={MAX_SKILL_DESCRIPTION} placeholder={t("skills.description_placeholder")} onChange={(e) => setDraft({ ...draft, description: e.target.value })} required />
        <p className="text-xs text-muted-foreground">{t("skills.description_hint", { max: MAX_SKILL_DESCRIPTION })}</p>
      </div>
      <div className="space-y-1">
        <label htmlFor="skill-body" className="text-sm font-medium">
          {t("skills.body")}
        </label>
        <textarea
          id="skill-body"
          className="min-h-48 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
          value={draft.body}
          maxLength={MAX_SKILL_BODY}
          placeholder={t("skills.body_placeholder")}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          required
        />
        <p className="text-xs text-muted-foreground">{t("skills.body_hint", { count: draft.body.length, max: MAX_SKILL_BODY })}</p>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy || !nameOk}>
          {t("skills.save")}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          {t("skills.cancel")}
        </Button>
        <label className="cursor-pointer text-sm text-primary underline underline-offset-4">
          {editing ? t("skills.upload_replace") : t("skills.upload")}
          <input type="file" accept=".md,text/markdown,text/plain" className="sr-only" disabled={busy} onChange={(e) => void upload(e)} />
        </label>
      </div>
    </form>
  );
}

function Versions({ api, skill, onRestored }: { api: SkillApi; skill: SkillItem; onRestored: () => Promise<void> }) {
  const t = useXT();
  const [versions, setVersions] = useState<SkillVersionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setVersions((await api.versions(skill.id)).versions);
    } catch (err) {
      setError(skillError(t, err));
    }
  };
  const restore = async (version: number) => {
    if (!window.confirm(t("skills.restore_confirm", { version }))) return;
    setBusy(true);
    try {
      await api.restore(skill.id, version);
      await onRestored();
    } catch (err) {
      setError(skillError(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="text-xs" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && versions === null && void load()}>
      <summary className="cursor-pointer text-muted-foreground">{t("skills.history", { version: skill.version })}</summary>
      {error && <p className="text-destructive">{error}</p>}
      <ul className="mt-1 space-y-1">
        {versions?.map((v) => (
          <li key={v.version} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">
              {t("skills.version", { version: v.version, date: new Date(v.createdAt).toLocaleString() })}
              {v.name !== skill.name ? ` · ${v.name}` : ""}
            </span>
            {v.version !== skill.version && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void restore(v.version)}>
                {t("skills.restore")}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The list of skills of one scope with the editor. */
export function SkillManager({ api, skills, max, onChanged }: { api: SkillApi; skills: SkillItem[]; max: number; onChanged: () => Promise<void> }) {
  const t = useXT();
  const [editing, setEditing] = useState<(SkillItem & { body: string }) | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = skills.length >= max;

  const run = async (change: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await change();
      await onChanged();
    } catch (err) {
      setError(skillError(t, err));
    } finally {
      setBusy(false);
    }
  };
  const edit = (skill: SkillItem) =>
    void run(async () => {
      setEditing((await api.get(skill.id)).skill);
    });
  const remove = (skill: SkillItem) => {
    if (!window.confirm(t("skills.delete_confirm", { name: skill.name }))) return;
    void run(() => api.remove(skill.id));
  };
  const done = async () => {
    setEditing(null);
    await onChanged();
  };

  return (
    <div className="space-y-3">
      {error && <Notice kind="error">{error}</Notice>}
      {skills.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("skills.none")}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {skills.map((skill) => (
            <li key={skill.id} className="space-y-1 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-mono text-sm font-medium">
                    {skill.name}
                    {!skill.enabled && <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">{t("skills.off")}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{skill.description}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => edit(skill)}>
                    {t("skills.edit")}
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => api.setEnabled(skill.id, !skill.enabled))}>
                    {skill.enabled ? t("skills.switch_off") : t("skills.switch_on")}
                  </Button>
                  <a className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm hover:bg-accent" href={withBasePath(api.fileUrl(skill.id))} download>
                    {t("skills.download")}
                  </a>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => remove(skill)}>
                    {t("skills.delete")}
                  </Button>
                </div>
              </div>
              <Versions api={api} skill={skill} onRestored={onChanged} />
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <Editor key={editing === "new" ? "new" : `${editing.id}-${editing.version}`} api={api} editing={editing === "new" ? null : editing} onDone={done} onCancel={() => setEditing(null)} />
      ) : (
        <div className="space-y-1">
          <Button type="button" disabled={busy || full} onClick={() => setEditing("new")}>
            {t("skills.add")}
          </Button>
          <p className="text-xs text-muted-foreground">{full ? t("skills.full", { max }) : t("skills.count", { count: skills.length, max })}</p>
        </div>
      )}
    </div>
  );
}
