"use client";

// Step 122 (Xenacore, stage 8): "Administration → AI → External tools" — MCP
// servers of the company (CRM, accounting, own systems). The admin adds a
// server, signs in once (OAuth) so its tools can be read, and approves the
// tools the assistant may use; a tool the server changes later waits here.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice, Spinner } from "@/components/xenaxio/ui";
import { WorkspaceShell } from "@/components/xenaxio/workspace-shell";
import { errorText, type ExternalServer, type WorkspaceUser, xenaxio } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";

function AddServer({ onAdded, redirectUri }: { onAdded: () => Promise<void>; redirectUri: string }) {
  const t = useXT();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [auth, setAuth] = useState<"oauth" | "key">("oauth");
  const [keyHeader, setKeyHeader] = useState("Authorization");
  const [key, setKey] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await xenaxio.addExternalServer({
        title,
        url,
        auth,
        ...(auth === "key" ? { keyHeader, key } : {}),
        ...(auth === "oauth" && clientId ? { clientId, ...(clientSecret ? { clientSecret } : {}) } : {}),
      });
      setTitle("");
      setUrl("");
      setKey("");
      setClientId("");
      setClientSecret("");
      await onAdded();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-labelledby="ext-add-title">
      <h2 id="ext-add-title" className="font-medium">
        {t("external.add_title")}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>{t("external.name")}</span>
          <Input value={title} maxLength={60} placeholder="CRM" onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span>{t("external.url")}</span>
          <Input value={url} placeholder="https://mcp.example.com/mcp" onChange={(e) => setUrl(e.target.value)} />
        </label>
      </div>
      <fieldset className="space-y-1 text-sm">
        <legend className="mb-1">{t("external.auth")}</legend>
        <label className="flex items-start gap-2">
          <input type="radio" name="ext-auth" checked={auth === "oauth"} onChange={() => setAuth("oauth")} className="mt-1" />
          <span>
            {t("external.auth_oauth")}
            <span className="block text-xs text-muted-foreground">{t("external.auth_oauth_hint")}</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="ext-auth" checked={auth === "key"} onChange={() => setAuth("key")} className="mt-1" />
          <span>
            {t("external.auth_key")}
            <span className="block text-xs text-muted-foreground">{t("external.auth_key_hint")}</span>
          </span>
        </label>
      </fieldset>
      {auth === "key" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>{t("external.key_header")}</span>
            <Input value={keyHeader} onChange={(e) => setKeyHeader(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t("external.key")}</span>
            <Input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
          </label>
        </div>
      ) : (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">{t("external.own_client")}</summary>
          <p className="my-2 text-xs text-muted-foreground">{t("external.own_client_hint", { redirect: redirectUri })}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span>{t("external.client_id")}</span>
              <Input value={clientId} onChange={(e) => setClientId(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span>{t("external.client_secret")}</span>
              <Input type="password" autoComplete="off" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
            </label>
          </div>
        </details>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      <Button disabled={busy || !title.trim() || !url.trim() || (auth === "key" && !key.trim())} onClick={() => void add()}>
        {t("external.add")}
      </Button>
    </section>
  );
}

function ServerCard({ server, users, onChanged }: { server: ExternalServer; users: WorkspaceUser[]; onChanged: () => Promise<void> }) {
  const t = useXT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };
  const connectSelf = async () => {
    setBusy(true);
    try {
      const { url } = await xenaxio.connect(server.id);
      window.location.assign(url);
    } catch (err) {
      setError(errorText(t, err));
      setBusy(false);
    }
  };
  const setTool = (name: string, approved: boolean, confirm: boolean) => run(() => xenaxio.approveExternalTools(server.id, [{ name, approved, confirm }]));
  const toggleUser = (id: string, on: boolean) => run(() => xenaxio.updateExternalServer(server.id, { users: on ? [...server.users, id] : server.users.filter((u) => u !== id) }));

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label={server.title}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-medium">
            {server.title}
            {!server.enabled && <span className="ml-2 text-xs font-normal text-muted-foreground">{t("external.off")}</span>}
          </h3>
          <p className="break-all text-xs text-muted-foreground">{server.url}</p>
          <p className="text-xs text-muted-foreground">
            {server.auth === "oauth" ? t("external.auth_oauth") : t("external.auth_key")}
            {server.auth === "oauth" && ` · ${t("external.connected_count", { count: server.connected })}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {server.auth === "oauth" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void connectSelf()}>
              {t("external.sign_in_self")}
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => xenaxio.checkExternalServer(server.id))}>
            {t("external.check")}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => xenaxio.updateExternalServer(server.id, { enabled: !server.enabled }))}>
            {server.enabled ? t("external.switch_off") : t("external.switch_on")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (window.confirm(t("external.remove_confirm", { name: server.title }))) void run(() => xenaxio.removeExternalServer(server.id));
            }}
          >
            {t("external.remove")}
          </Button>
        </div>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {server.review > 0 && <Notice kind="info">{t("external.review", { count: server.review })}</Notice>}
      {server.tools.length === 0 ? (
        <p className="text-sm text-muted-foreground">{server.auth === "oauth" ? t("external.no_tools_oauth") : t("external.no_tools")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {server.tools.map((tool) => (
            <li key={tool.name} className="flex flex-wrap items-start justify-between gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm">
                  {tool.name}
                  <span className="ml-2 font-sans text-xs text-muted-foreground">{tool.readOnly && !tool.confirm ? t("external.reads") : t("external.changes")}</span>
                  {tool.change && <span className="ml-2 font-sans text-xs text-warning">{tool.change === "new" ? t("external.new") : t("external.changed")}</span>}
                </p>
                <p className="text-xs text-muted-foreground">{tool.description}</p>
              </div>
              <div className="flex flex-col items-end gap-1 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={tool.approved} disabled={busy} onChange={(e) => void setTool(tool.name, e.target.checked, tool.confirm)} />
                  {t("external.approved")}
                </label>
                {tool.readOnly && tool.approved && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={tool.confirm} disabled={busy} onChange={(e) => void setTool(tool.name, true, e.target.checked)} />
                    {t("external.always_confirm")}
                  </label>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <fieldset className="space-y-1 text-sm">
        <legend className="mb-1 font-medium">{t("external.who")}</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name={`access-${server.id}`} checked={server.access === "all"} disabled={busy} onChange={() => void run(() => xenaxio.updateExternalServer(server.id, { access: "all" }))} />
          {t("external.who_all")}
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name={`access-${server.id}`} checked={server.access === "some"} disabled={busy} onChange={() => void run(() => xenaxio.updateExternalServer(server.id, { access: "some" }))} />
          {t("external.who_some")}
        </label>
        {server.access === "some" && (
          <ul className="ml-6 max-h-48 space-y-1 overflow-y-auto">
            {users.map((u) => (
              <li key={u.id}>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={server.users.includes(u.id)} disabled={busy} onChange={(e) => void toggleUser(u.id, e.target.checked)} />
                  <span className="truncate">
                    {u.displayName} <span className="text-xs text-muted-foreground">{u.email}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
    </section>
  );
}

function ExternalTools() {
  const t = useXT();
  const [servers, setServers] = useState<ExternalServer[] | null>(null);
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [redirectUri, setRedirectUri] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const [s, u] = await Promise.all([xenaxio.externalServers(), xenaxio.users().catch(() => ({ users: [] as WorkspaceUser[] }))]);
      setServers(s.servers);
      setRedirectUri(s.redirectUri);
      setUsers(u.users);
    } catch (err) {
      setError(errorText(t, err));
    }
  }, [t]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!servers) return error ? <Notice kind="error">{error}</Notice> : <Spinner label={t("common.loading")} />;
  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-sm text-muted-foreground">{t("external.admin_intro")}</p>
      <Notice kind="info">{t("external.safety")}</Notice>
      {servers.map((s) => (
        <ServerCard key={s.id} server={s} users={users} onChanged={load} />
      ))}
      <AddServer onAdded={load} redirectUri={redirectUri} />
    </div>
  );
}

export default function ExternalToolsPage() {
  const t = useXT();
  return (
    <WorkspaceShell title={t("external.admin_title")} backHref="/workspace/ai" requireAdmin>
      <ExternalTools />
    </WorkspaceShell>
  );
}
