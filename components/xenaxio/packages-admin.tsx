"use client";

// xenaxio step 129 G: "Verwaltung → Erweiterungen" — industry packages (e.g. Xenaxio Maritime).
// Only the company's admin installs or removes a package, hands out the rights it declares
// (everyone, groups, people) and chooses its AI: the company's or its own model, which the
// platform checks (it must read a picture and answer strict JSON).
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Puzzle } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/xenaxio/ui";
import { Link } from "@/i18n/navigation";
import { apiFetch } from "@/lib/browser-navigation";
import { errorText } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";
import { type Grant, type PackageView, packagesApi } from "@/lib/xenaxio/packages";
import { PeoplePicker } from "./projects/bits";

type Group = { id: string; name: string };
const local = (t: { de: string; en: string }, locale: string) => (locale === "de" ? t.de || t.en : t.en || t.de);

function RightRow({ name, description, grant, groups, onChange }: { name: string; description?: string; grant: Grant; groups: Group[]; onChange: (g: Grant) => void }) {
  const t = useXT();
  return (
    <li className="space-y-2 rounded-md border border-border p-3">
      <div>
        <p className="font-medium">{name}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!grant.all} onChange={(e) => onChange({ ...grant, all: e.target.checked })} />
        {t("packages.everyone")}
      </label>
      {!grant.all && (
        <>
          {groups.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => (
                <label key={g.id} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={(grant.groups ?? []).includes(g.id)} onChange={(e) => onChange({ ...grant, groups: e.target.checked ? [...(grant.groups ?? []), g.id] : (grant.groups ?? []).filter((x) => x !== g.id) })} />
                  {g.name}
                </label>
              ))}
            </div>
          )}
          <PeoplePicker selected={grant.users ?? []} onChange={(users) => onChange({ ...grant, users })} />
        </>
      )}
    </li>
  );
}

function ModelForm({ pkg, onSaved }: { pkg: PackageView; onSaved: (p: PackageView) => void }) {
  const t = useXT();
  const [mode, setMode] = useState(pkg.model.mode);
  const [baseUrl, setBaseUrl] = useState(pkg.model.baseUrl ?? "");
  const [model, setModel] = useState(pkg.model.model ?? "");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await packagesApi.setModel(pkg.key, mode === "company" ? { mode } : { mode, baseUrl: baseUrl.trim(), model: model.trim(), ...(key ? { key } : {}) }));
      setKey("");
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 text-sm">
      {error && <Notice kind="error">{error}</Notice>}
      <label className="flex items-center gap-2">
        <input type="radio" checked={mode === "company"} onChange={() => setMode("company")} />
        {t("packages.model_company")}
      </label>
      <label className="flex items-center gap-2">
        <input type="radio" checked={mode === "own"} onChange={() => setMode("own")} />
        {t("packages.model_own")}
      </label>
      {mode === "own" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" aria-label={t("packages.model_url")} />
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder={t("packages.model_name")} aria-label={t("packages.model_name")} />
          <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={pkg.model.hasKey ? t("packages.model_key_kept") : t("packages.model_key")} aria-label={t("packages.model_key")} className="sm:col-span-2" />
          <p className="text-xs text-muted-foreground sm:col-span-2">{t("packages.model_hint")}</p>
        </div>
      )}
      <Button size="sm" onClick={() => void save()} disabled={busy || (mode === "own" && (!baseUrl.trim() || !model.trim()))}>
        {busy ? t("packages.model_checking") : t("common.save")}
      </Button>
    </div>
  );
}

function PackageCard({ pkg, groups, onChanged }: { pkg: PackageView; groups: Group[]; onChanged: () => void }) {
  const t = useXT();
  const locale = useLocale();
  const [grants, setGrants] = useState<Record<string, Grant>>(pkg.grants);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  useEffect(() => setGrants(pkg.grants), [pkg.grants]);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };
  const changed = JSON.stringify(grants) !== JSON.stringify(pkg.grants);
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4 text-card-foreground">
      <div className="flex flex-wrap items-start gap-3">
        <Puzzle className="mt-0.5 h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">
            {local(pkg.name, locale)} <span className="text-xs font-normal text-muted-foreground">{pkg.version}</span>
          </h2>
          <p className="text-sm text-muted-foreground">{local(pkg.description, locale)}</p>
        </div>
        {pkg.installed ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setRemoving(true)}>
            {t("packages.remove")}
          </Button>
        ) : (
          <Button size="sm" disabled={busy} onClick={() => void act(() => packagesApi.install(pkg.key))}>
            {t("packages.install")}
          </Button>
        )}
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {!pkg.installed && pkg.types.length > 0 && <p className="text-xs text-muted-foreground">{t("packages.brings", { types: pkg.types.join(", ") })}</p>}
      {pkg.installed && (
        <>
          <div className="flex flex-wrap gap-3 text-sm">
            {pkg.web && (
              <a href={`/${pkg.key}/`} className="text-primary underline">
                {t("packages.open_app")}
              </a>
            )}
            <Link href="/workspace/object-types" className="text-primary underline">
              {t("packages.types_link")}
            </Link>
          </div>
          {pkg.rights.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t("packages.rights")}</h3>
              <p className="text-xs text-muted-foreground">{t("packages.rights_hint")}</p>
              <ul className="space-y-2">
                {pkg.rights.map((r) => (
                  <RightRow key={r.key} name={local(r.name, locale)} {...(r.description ? { description: local(r.description, locale) } : {})} grant={grants[r.key] ?? {}} groups={groups} onChange={(g) => setGrants({ ...grants, [r.key]: g })} />
                ))}
              </ul>
              {changed && (
                <Button size="sm" disabled={busy} onClick={() => void act(() => packagesApi.setGrants(pkg.key, grants))}>
                  {t("common.save")}
                </Button>
              )}
            </div>
          )}
          {pkg.models && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t("packages.model")}</h3>
              <ModelForm pkg={pkg} onSaved={() => onChanged()} />
            </div>
          )}
        </>
      )}
      <ConfirmDialog
        isOpen={removing}
        onClose={() => setRemoving(false)}
        onConfirm={() => (setRemoving(false), void act(() => packagesApi.remove(pkg.key)))}
        title={t("packages.remove")}
        message={t("packages.remove_text", { name: local(pkg.name, locale) })}
        confirmText={t("packages.remove")}
        variant="destructive"
      />
    </section>
  );
}

export function PackagesAdmin() {
  const t = useXT();
  const [list, setList] = useState<PackageView[] | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const [r, g] = await Promise.all([
        packagesApi.list(),
        apiFetch("/api/admin/chat/groups", { credentials: "same-origin", headers: { Accept: "application/json" } })
          .then((x) => (x.ok ? (x.json() as Promise<{ groups: Group[] }>) : { groups: [] }))
          .catch(() => ({ groups: [] })),
      ]);
      setList(r.packages);
      setGroups(g.groups);
    } catch (err) {
      setError(errorText(t, err));
    }
  }, [t]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("packages.intro")}</p>
      {error && <Notice kind="error">{error}</Notice>}
      {list && list.length === 0 && <Notice kind="info">{t("packages.none")}</Notice>}
      {(list ?? []).map((p) => (
        <PackageCard key={p.key} pkg={p} groups={groups} onChanged={() => void load()} />
      ))}
    </div>
  );
}
