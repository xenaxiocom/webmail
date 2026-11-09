"use client";

// Step 145 (Xenacore, stage 9, part C): "Administration → AI → Helpers" — the
// company's own helpers. The admin writes what a helper is for, how it works
// and which tools it may use; only tools that read or prepare are offered, so
// a helper never changes, proposes or sends anything. The assistant hands it
// parts of its work next to the built-in helpers.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToolLabel } from "@/components/xenaxio/tool-permissions";
import { Notice, Spinner } from "@/components/xenaxio/ui";
import { WorkspaceShell } from "@/components/xenaxio/workspace-shell";
import { type CompanyHelper, type CompanyHelperInput, errorText, type HelperTool, xenaxio } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";

const EMPTY: CompanyHelperInput = { name: "", role: "", instructions: "", tools: [], profile: "default", enabled: true };
const PROFILES = ["default", "fast", "smart"] as const;

function HelperForm({
  initial,
  tools,
  onSave,
  onCancel,
}: {
  initial: CompanyHelperInput;
  tools: HelperTool[];
  onSave: (input: CompanyHelperInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const t = useXT();
  const label = useToolLabel();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<CompanyHelperInput>) => setV((prev) => ({ ...prev, ...patch }));
  const toggle = (name: string, on: boolean) => set({ tools: on ? [...v.tools, name] : v.tools.filter((x) => x !== name) });
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(v);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };
  // A tool the helper has that is no longer offered (a server switched off) stays visible, so it can be taken away.
  const shown = [...tools, ...v.tools.filter((n) => !tools.some((x) => x.name === n)).map((name) => ({ name, kind: "read" }) as HelperTool)];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>{t("helpers.name")}</span>
          <Input value={v.name} maxLength={60} placeholder={t("helpers.name_placeholder")} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="space-y-1 text-sm">
          <span>{t("helpers.profile")}</span>
          <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={v.profile} onChange={(e) => set({ profile: e.target.value as CompanyHelperInput["profile"] })}>
            {PROFILES.map((p) => (
              <option key={p} value={p}>
                {t(`helpers.profile_${p}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <span>{t("helpers.role")}</span>
        <Input value={v.role} maxLength={300} placeholder={t("helpers.role_placeholder")} onChange={(e) => set({ role: e.target.value })} />
        <span className="block text-xs text-muted-foreground">{t("helpers.role_hint")}</span>
      </label>
      <label className="block space-y-1 text-sm">
        <span>{t("helpers.instructions")}</span>
        <textarea
          className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={v.instructions}
          maxLength={4000}
          placeholder={t("helpers.instructions_placeholder")}
          onChange={(e) => set({ instructions: e.target.value })}
        />
      </label>
      <fieldset className="space-y-1 text-sm">
        <legend className="mb-1">{t("helpers.tools")}</legend>
        <p className="text-xs text-muted-foreground">{t("helpers.tools_hint")}</p>
        <ul className="grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2">
          {shown.map((tool) => (
            <li key={tool.name}>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" checked={v.tools.includes(tool.name)} disabled={busy || (!v.tools.includes(tool.name) && v.tools.length >= 20)} onChange={(e) => toggle(tool.name, e.target.checked)} />
                <span className="min-w-0">
                  {tool.system ? tool.name.split("__").slice(1).join("__") : label(tool.name)}
                  <span className="ml-1 text-xs text-muted-foreground">{tool.system ?? (tool.kind === "read" ? t("helpers.reads") : t("helpers.prepares"))}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        {t("helpers.enabled")}
      </label>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !v.name.trim() || !v.role.trim() || !v.instructions.trim() || v.tools.length === 0} onClick={() => void save()}>
          {t("helpers.save")}
        </Button>
        {onCancel && (
          <Button variant="outline" disabled={busy} onClick={onCancel}>
            {t("helpers.cancel")}
          </Button>
        )}
      </div>
    </div>
  );
}

function HelperCard({ helper, tools, onChanged }: { helper: CompanyHelper; tools: HelperTool[]; onChanged: () => Promise<void> }) {
  const t = useXT();
  const label = useToolLabel();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    if (!window.confirm(t("helpers.remove_confirm", { name: helper.name }))) return;
    try {
      await xenaxio.removeCompanyHelper(helper.id);
      await onChanged();
    } catch (err) {
      setError(errorText(t, err));
    }
  };

  return (
    <section className="space-y-2 rounded-lg border border-border bg-card p-4" aria-label={helper.name}>
      {editing ? (
        <HelperForm
          initial={{ name: helper.name, role: helper.role, instructions: helper.instructions, tools: helper.tools, profile: helper.profile, enabled: helper.enabled }}
          tools={tools}
          onCancel={() => setEditing(false)}
          onSave={async (input) => {
            await xenaxio.updateCompanyHelper(helper.id, input);
            setEditing(false);
            await onChanged();
          }}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-medium">
                {helper.name}
                {!helper.enabled && <span className="ml-2 text-xs font-normal text-muted-foreground">{t("helpers.off")}</span>}
              </h3>
              <p className="text-sm text-muted-foreground">{helper.role}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                {t("helpers.edit")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void remove()}>
                {t("helpers.remove")}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(`helpers.profile_${helper.profile}`)} · {helper.tools.map((n) => (n.includes("__") ? n.split("__").slice(1).join("__") : label(n))).join(", ")}
          </p>
          {error && <Notice kind="error">{error}</Notice>}
        </>
      )}
    </section>
  );
}

function Helpers() {
  const t = useXT();
  const [data, setData] = useState<{ helpers: CompanyHelper[]; tools: HelperTool[] } | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await xenaxio.companyHelpers());
    } catch (err) {
      setError(errorText(t, err));
    }
  }, [t]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return error ? <Notice kind="error">{error}</Notice> : <Spinner label={t("common.loading")} />;
  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-sm text-muted-foreground">{t("helpers.intro")}</p>
      <Notice kind="info">{t("helpers.safety")}</Notice>
      <section className="space-y-1 rounded-lg border border-border bg-card p-4">
        <h2 className="font-medium">{t("helpers.built_in")}</h2>
        <p className="text-sm text-muted-foreground">{["mail_research", "file_research", "calendar"].map((h) => t(`assistant.helpers.${h}`)).join(", ")}</p>
      </section>
      {data.helpers.length === 0 && <p className="text-sm text-muted-foreground">{t("helpers.none")}</p>}
      {data.helpers.map((h) => (
        <HelperCard key={h.id} helper={h} tools={data.tools} onChanged={load} />
      ))}
      {data.helpers.length < 10 &&
        (adding ? (
          <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-labelledby="helper-add-title">
            <h2 id="helper-add-title" className="font-medium">
              {t("helpers.add_title")}
            </h2>
            <HelperForm
              initial={EMPTY}
              tools={data.tools}
              onCancel={() => setAdding(false)}
              onSave={async (input) => {
                await xenaxio.addCompanyHelper(input);
                setAdding(false);
                await load();
              }}
            />
          </section>
        ) : (
          <Button onClick={() => setAdding(true)}>{t("helpers.add")}</Button>
        ))}
    </div>
  );
}

export default function HelpersPage() {
  const t = useXT();
  return (
    <WorkspaceShell title={t("helpers.title")} backHref="/workspace/ai" requireAdmin>
      <Helpers />
    </WorkspaceShell>
  );
}
