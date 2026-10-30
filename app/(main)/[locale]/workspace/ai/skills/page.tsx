"use client";

// Step 84: "Verwaltung → KI → Fähigkeiten" — the company's skills for the
// assistant and the platform's starter skills, which the admin can switch off.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SkillManager } from "@/components/xenaxio/skill-manager";
import { Notice, Spinner } from "@/components/xenaxio/ui";
import { WorkspaceShell } from "@/components/xenaxio/workspace-shell";
import { companySkills, errorText, type SkillItem, type SkillSummary, xenaxio } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";

interface State {
  company: SkillItem[];
  platform: (SkillSummary & { enabled: boolean })[];
  max: number;
  engine?: "classic" | "xenacore";
}

function CompanySkills() {
  const t = useXT();
  const [data, setData] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [skills, ai] = await Promise.all([xenaxio.adminSkills(), xenaxio.aiAdmin().catch(() => null)]);
      setData({ ...skills, ...(ai?.answers ? { engine: ai.answers.engine } : {}) });
    } catch (err) {
      setError(errorText(t, err));
    }
  }, [t]);
  useEffect(() => {
    void load();
  }, [load]);

  const togglePlatform = async (name: string, enabled: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await xenaxio.setPlatformSkill(name, enabled);
      await load();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  if (!data) return error ? <Notice kind="error">{error}</Notice> : <Spinner label={t("common.loading")} />;
  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm text-muted-foreground">{t("skills.admin_intro")}</p>
      {data.engine === "classic" && <Notice kind="info">{t("skills.classic")}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      <section className="space-y-3" aria-labelledby="skills-company-title">
        <h2 id="skills-company-title" className="font-medium">
          {t("skills.company_title")}
        </h2>
        <SkillManager api={companySkills} skills={data.company} max={data.max} onChanged={load} />
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-labelledby="skills-platform-title">
        <div className="space-y-1">
          <h2 id="skills-platform-title" className="font-medium">
            {t("skills.platform_title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("skills.platform_intro")}</p>
        </div>
        <ul className="divide-y divide-border">
          {data.platform.map((k) => (
            <li key={k.name} className="flex flex-wrap items-start justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="font-mono text-sm font-medium">
                  {k.name}
                  {!k.enabled && <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">{t("skills.off")}</span>}
                </p>
                <p className="text-xs text-muted-foreground">{k.description}</p>
              </div>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void togglePlatform(k.name, !k.enabled)}>
                {k.enabled ? t("skills.switch_off") : t("skills.switch_on")}
              </Button>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-xs text-muted-foreground">{t("skills.privacy")}</p>
    </div>
  );
}

export default function SkillsAdminPage() {
  const t = useXT();
  return (
    <WorkspaceShell title={t("skills.admin_title")} backHref="/workspace/ai" requireAdmin>
      <CompanySkills />
    </WorkspaceShell>
  );
}
