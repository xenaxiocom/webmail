"use client";

// Step 91: "Verwaltung → KI → Firmenwissen" — facts every employee's assistant
// knows (where invoices go, who is responsible for what). The admin writes,
// changes and deletes them; the assistant adds one only when a user says it is
// "für alle".
import { useCallback, useEffect, useState } from "react";
import { AddFact, FactList } from "@/components/xenaxio/memory-facts";
import { Notice, Spinner } from "@/components/xenaxio/ui";
import { WorkspaceShell } from "@/components/xenaxio/workspace-shell";
import { errorText, type MemoryInput, type MemoryNote, xenaxio } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";

function CompanyKnowledge() {
  const t = useXT();
  const [data, setData] = useState<{ notes: MemoryNote[]; maxNotes: number; maxLength: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await xenaxio.companyMemories());
    } catch (err) {
      setError(errorText(t, err));
    }
  }, [t]);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (change: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await change();
      await load();
      return true;
    } catch (err) {
      setError(errorText(t, err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!data) return error ? <Notice kind="error">{error}</Notice> : <Spinner label={t("common.loading")} />;
  const remove = (note: MemoryNote) => {
    if (!window.confirm(t("memory.delete_confirm", { text: note.text }))) return;
    void run(() => xenaxio.deleteCompanyMemory(note.id));
  };
  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm text-muted-foreground">{t("memory.company_intro")}</p>
      {error && <Notice kind="error">{error}</Notice>}
      <section className="space-y-2">
        <h2 className="font-medium">{t("memory.company_count", { count: data.notes.length, max: data.maxNotes })}</h2>
        <FactList
          notes={data.notes}
          maxLength={data.maxLength}
          busy={busy}
          empty={t("memory.company_none")}
          onSave={(note: MemoryNote, input: MemoryInput) => run(() => xenaxio.updateCompanyMemory(note.id, input))}
          onDelete={remove}
        />
      </section>
      <AddFact
        maxLength={data.maxLength}
        busy={busy}
        full={data.notes.length >= data.maxNotes}
        fullText={t("memory.full", { max: data.maxNotes })}
        hint={t("memory.add_hint", { max: data.maxLength })}
        onAdd={(input) => run(() => xenaxio.addCompanyMemory(input))}
      />
      <p className="text-xs text-muted-foreground">{t("memory.company_privacy")}</p>
    </div>
  );
}

export default function CompanyKnowledgePage() {
  const t = useXT();
  return (
    <WorkspaceShell title={t("memory.company_title")} backHref="/workspace/ai" requireAdmin>
      <CompanyKnowledge />
    </WorkspaceShell>
  );
}
