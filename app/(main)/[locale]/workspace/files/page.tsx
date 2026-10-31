"use client";

// xenaxio step 90, part D: "Administration → Employees' files". The admin sees
// who uses how much space, opens an employee's folders, opens or saves a file
// and deletes files and folders. Each look, download and delete is in the
// audit log, and the employee gets an e-mail about a delete (owner's decision
// 30.10.2026: the admin cleans up employees' files and recordings).
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { ChevronRight, File, Folder, Trash2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Notice, Spinner } from "@/components/xenaxio/ui";
import { WorkspaceShell } from "@/components/xenaxio/workspace-shell";
import { type AdminFolder, type AdminPerson, adminFiles, formatSize } from "@/lib/xenaxio/admin-files";
import { errorText } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";

function EmployeeFiles() {
  const t = useXT();
  const locale = useLocale();
  const [people, setPeople] = useState<AdminPerson[] | null>(null);
  const [folder, setFolder] = useState<AdminFolder | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    adminFiles
      .people()
      .then(setPeople)
      .catch((err: unknown) => setError(errorText(t, err)));
  }, [t]);

  const open = useCallback(
    async (user: string, parent: string | null) => {
      setBusy(true);
      setError(null);
      setDone(null);
      try {
        setFolder(await adminFiles.folder(user, parent));
        setSelected(new Set());
      } catch (err) {
        setError(errorText(t, err));
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  const remove = async () => {
    if (!folder || selected.size === 0) return;
    const names = folder.items.filter((i) => selected.has(i.id)).map((i) => i.name);
    if (!window.confirm(t("adminfiles.delete_confirm", { count: names.length, name: folder.person.name, names: names.slice(0, 5).join(", ") }))) return;
    setBusy(true);
    setError(null);
    try {
      await adminFiles.remove(folder.person.id, [...selected]);
      setDone(t("adminfiles.deleted", { count: selected.size }));
      const parent = folder.path.at(-1)?.id ?? null;
      setFolder(await adminFiles.folder(folder.person.id, parent));
      setSelected(new Set());
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  if (!people) return error ? <Notice kind="error">{error}</Notice> : <Spinner label={t("common.loading")} />;
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
  return (
    <div className="max-w-3xl space-y-4">
      <Notice kind="info">{t("adminfiles.intro")}</Notice>
      {error && <Notice kind="error">{error}</Notice>}
      {done && <Notice kind="success">{done}</Notice>}
      {!folder ? (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {people.map((p) => (
            <li key={p.id}>
              <button type="button" disabled={busy} onClick={() => void open(p.id, null)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent disabled:opacity-50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{p.email}</span>
                </span>
                {p.usedBytes !== null && <span className="text-xs text-muted-foreground">{t("adminfiles.used", { size: formatSize(p.usedBytes, locale) })}</span>}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <nav aria-label={t("adminfiles.path")} className="flex flex-wrap items-center gap-1 text-sm">
            <button type="button" onClick={() => setFolder(null)} className="text-primary hover:underline">
              {t("adminfiles.people")}
            </button>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <button type="button" onClick={() => void open(folder.person.id, null)} className="text-primary hover:underline">
              {folder.person.name}
            </button>
            {folder.path.map((f) => (
              <span key={f.id} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <button type="button" onClick={() => void open(folder.person.id, f.id)} className="text-primary hover:underline">
                  {f.name}
                </button>
              </span>
            ))}
          </nav>
          <p className="text-xs text-muted-foreground">{t("adminfiles.total", { size: formatSize(folder.totalBytes, locale) })}</p>
          {folder.truncated && <Notice kind="info">{t("adminfiles.truncated")}</Notice>}
          {folder.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("adminfiles.empty")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {folder.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={t("adminfiles.select", { name: item.name })}
                    checked={selected.has(item.id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(item.id);
                      else next.delete(item.id);
                      setSelected(next);
                    }}
                  />
                  {item.folder ? <Folder className="h-4 w-4 text-muted-foreground" /> : <File className="h-4 w-4 text-muted-foreground" />}
                  {item.folder ? (
                    <button type="button" disabled={busy} onClick={() => void open(folder.person.id, item.id)} className="min-w-0 flex-1 truncate text-left text-sm hover:underline">
                      {item.name}
                    </button>
                  ) : (
                    <a href={adminFiles.downloadUrl(folder.person.id, item.id)} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm hover:underline">
                      {item.name}
                    </a>
                  )}
                  {!item.folder && <span className="text-xs text-muted-foreground">{formatSize(item.size, locale)}</span>}
                  <span className="hidden w-24 text-right text-xs text-muted-foreground sm:inline">{date(item.modified)}</span>
                </li>
              ))}
            </ul>
          )}
          <Button variant="destructive" disabled={busy || selected.size === 0} onClick={() => void remove()}>
            <Trash2 className="mr-1 h-4 w-4" /> {t("adminfiles.delete", { count: selected.size })}
          </Button>
        </section>
      )}
    </div>
  );
}

export default function EmployeeFilesPage() {
  const t = useXT();
  return (
    <WorkspaceShell title={t("adminfiles.title")} backHref="/workspace" requireAdmin>
      <EmployeeFiles />
    </WorkspaceShell>
  );
}
