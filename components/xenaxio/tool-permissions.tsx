"use client";

// Step 85: per-tool permissions of the AI, like the per-tool settings of a
// connector in Claude — allow, ask or deny — for the assistant, scheduled
// tasks and connected AI chats alike. The admin's page sets the company's
// limit; an employee can only be stricter. The platform applies both; the AI
// never changes them.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice, Spinner } from "@/components/xenaxio/ui";
import { errorText, type ToolCeilingPage, type ToolLevel, type ToolPermission, type ToolPermissionPage, xenaxio } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";
import { cn } from "@/lib/utils";

const RANK: Record<ToolLevel, number> = { allow: 0, ask: 1, deny: 2 };

/** The tool's name for people; a tool without a text yet shows its technical name. */
export function useToolLabel() {
  const t = useXT();
  return useCallback(
    (name: string) => {
      const key = `permissions.tool.${name}`;
      const text = t(key);
      return text === key ? name : text;
    },
    [t],
  );
}

function Segmented<T extends string>({
  options,
  value,
  label,
  disabled,
  onChange,
}: {
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  label: string;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 overflow-hidden rounded-md border border-border">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          disabled={disabled || o.disabled}
          onClick={() => o.value !== value && onChange(o.value)}
          className={cn(
            "px-2.5 py-1 text-xs font-medium transition-colors border-l border-border first:border-l-0 disabled:cursor-not-allowed disabled:opacity-50",
            o.value === value ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ToolRow({ tool, busy, onChange }: { tool: ToolPermission; busy: boolean; onChange: (level: ToolLevel | null) => void }) {
  const t = useXT();
  const label = useToolLabel();
  const levelText = (l: ToolLevel) => t(`permissions.level_${l}`);
  const ceiling = tool.ceiling && tool.kind !== "read" ? tool.ceiling : tool.ceiling === "deny" ? "deny" : null;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      {/* At least 12rem for the name, so on a phone the buttons go below it. */}
      <span className="min-w-[12rem] flex-1">
        <span className="block text-sm font-medium">
          {label(tool.name)}
          {tool.where !== "both" && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">{t(`permissions.where_${tool.where}`)}</span>}
        </span>
        <span className="block text-xs text-muted-foreground">
          {ceiling ? t("permissions.ceiling", { level: levelText(ceiling) }) : t("permissions.default", { level: levelText(tool.defaultLevel) })}
        </span>
      </span>
      <Segmented
        label={label(tool.name)}
        value={tool.level}
        disabled={busy}
        options={tool.choices.map((c) => ({ value: c, label: levelText(c), disabled: !!ceiling && RANK[c] < RANK[ceiling] }))}
        onChange={(level) => onChange(level === tool.defaultLevel && !ceiling ? null : level)}
      />
    </li>
  );
}

/** The user's own page. */
export function ToolPermissions() {
  const t = useXT();
  const [page, setPage] = useState<ToolPermissionPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    xenaxio
      .toolPermissions()
      .then(setPage)
      .catch((err: unknown) => setError(errorText(t, err)));
  }, [t]);

  const save = async (call: () => Promise<ToolPermissionPage>) => {
    setBusy(true);
    setError(null);
    try {
      setPage(await call());
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  if (!page) return error ? <Notice kind="error">{error}</Notice> : <Spinner label={t("common.loading")} />;

  const groups = page.groups.filter((g) => page.tools.some((tool) => tool.group === g));
  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm text-muted-foreground">{t("permissions.intro")}</p>
      <p className="text-sm text-muted-foreground">{t("permissions.legend")}</p>
      {error && <Notice kind="error">{error}</Notice>}

      <section className="space-y-2 rounded-lg border border-border p-4">
        <h2 className="font-medium">{t("permissions.external_title")}</h2>
        <p className="text-xs text-muted-foreground">{t("permissions.external_hint")}</p>
        <div className="space-y-1.5 pt-1 text-sm">
          {(["client", "app"] as const).map((v) => (
            <label key={v} className="flex items-start gap-2">
              <input type="radio" name="external-confirm" className="mt-1" checked={page.externalConfirm === v} disabled={busy} onChange={() => save(() => xenaxio.setExternalConfirm(v))} />
              <span>{t(`permissions.external_${v}`)}</span>
            </label>
          ))}
        </div>
      </section>

      {groups.map((group) => (
        <section key={group} className="space-y-2">
          <h2 className="font-medium">{t(`permissions.group.${group}`)}</h2>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {page.tools
              .filter((tool) => tool.group === group)
              .map((tool) => (
                <ToolRow key={tool.name} tool={tool} busy={busy} onChange={(level) => save(() => xenaxio.setToolPermission(tool.name, level))} />
              ))}
          </ul>
        </section>
      ))}

      <p className="text-xs text-muted-foreground">{t("permissions.read_note")}</p>
      <p className="text-xs text-muted-foreground">{t("permissions.never")}</p>
      <Button variant="outline" disabled={busy} onClick={() => window.confirm(t("permissions.reset_confirm")) && save(() => xenaxio.resetToolPermissions())}>
        {t("permissions.reset")}
      </Button>
    </div>
  );
}

type Ceiling = "none" | "ask" | "deny";

/** The admin's page: the company's limit per group and per tool. */
export function ToolCeilings() {
  const t = useXT();
  const label = useToolLabel();
  const [page, setPage] = useState<ToolCeilingPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    xenaxio
      .toolCeilings()
      .then(setPage)
      .catch((err: unknown) => setError(errorText(t, err)));
  }, [t]);

  if (!page) return error ? <Notice kind="error">{error}</Notice> : <Spinner label={t("common.loading")} />;

  const current = (scope: string): Ceiling => page.ceilings.find((c) => c.scope === scope)?.level ?? "none";
  const set = async (scope: string, level: Ceiling) => {
    setBusy(true);
    setError(null);
    try {
      setPage(await xenaxio.setToolCeiling(scope, level === "none" ? null : level));
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };
  const options = (readOnly: boolean): { value: Ceiling; label: string }[] => [
    { value: "none", label: t("permissions.admin_none") },
    ...(readOnly ? [] : [{ value: "ask" as const, label: t("permissions.admin_ask") }]),
    { value: "deny", label: t("permissions.admin_deny") },
  ];
  const groups = page.groups.filter((g) => page.tools.some((tool) => tool.group === g));

  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm text-muted-foreground">{t("permissions.admin_intro")}</p>
      {error && <Notice kind="error">{error}</Notice>}
      {groups.map((group) => {
        const tools = page.tools.filter((tool) => tool.group === group);
        return (
          <section key={group} className="space-y-2 rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">{t(`permissions.group.${group}`)}</h2>
              <Segmented label={t(`permissions.group.${group}`)} value={current(`group:${group}`)} disabled={busy} options={options(false)} onChange={(v) => set(`group:${group}`, v)} />
            </div>
            <details>
              <summary className="cursor-pointer select-none text-xs text-muted-foreground">{t("permissions.admin_tools")}</summary>
              <ul className="mt-2 divide-y divide-border">
                {tools.map((tool) => {
                  const readOnly = tool.kind === "read";
                  const value = current(`tool:${tool.name}`);
                  return (
                    <li key={tool.name} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="min-w-[10rem] flex-1 text-sm">{label(tool.name)}</span>
                      <Segmented label={label(tool.name)} value={readOnly && value === "ask" ? "none" : value} disabled={busy} options={options(readOnly)} onChange={(v) => set(`tool:${tool.name}`, v)} />
                    </li>
                  );
                })}
              </ul>
            </details>
          </section>
        );
      })}
      <p className="text-xs text-muted-foreground">{t("permissions.never")}</p>
    </div>
  );
}
