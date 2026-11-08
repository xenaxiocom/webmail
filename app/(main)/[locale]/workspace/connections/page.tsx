"use client";

// Step 122 (Xenacore, stage 8): "Connections" — the company's outside systems
// (MCP servers) the employee may use with the assistant: sign in with one's
// own account, sign out, and what the assistant may do there without asking.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice, Spinner } from "@/components/xenaxio/ui";
import { WorkspaceShell } from "@/components/xenaxio/workspace-shell";
import { errorText, type ExternalConnection, type ExternalLevel, xenaxio } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";

function Connections() {
  const t = useXT();
  // Back from the sign-in page of the server: ?connected=<name> or ?error=<code>.
  const [back, setBack] = useState<{ connected: string | null; failed: string | null }>({ connected: null, failed: null });
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setBack({ connected: q.get("connected"), failed: q.get("error") });
  }, []);
  const [list, setList] = useState<ExternalConnection[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setList((await xenaxio.connections()).connections);
    } catch (err) {
      setError(errorText(t, err));
    }
  }, [t]);
  useEffect(() => {
    void load();
  }, [load]);

  const { connected, failed } = back;

  const connect = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      window.location.assign((await xenaxio.connect(id)).url);
    } catch (err) {
      setError(errorText(t, err));
      setBusy(false);
    }
  };
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  if (!list) return error ? <Notice kind="error">{error}</Notice> : <Spinner label={t("common.loading")} />;
  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm text-muted-foreground">{t("external.user_intro")}</p>
      {connected && <Notice kind="success">{t("external.connected_now", { name: connected })}</Notice>}
      {failed && <Notice kind="error">{t("external.sign_in_failed")}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      {list.length === 0 && <p className="text-sm text-muted-foreground">{t("external.none")}</p>}
      {list.map((c) => (
        <section key={c.id} className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label={c.title}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-medium">{c.title}</h2>
              <p className="text-xs text-muted-foreground">
                {c.auth === "key" ? t("external.shared_key") : c.connected ? t("external.signed_in") : t("external.not_signed_in")} · {t("external.tool_count", { count: c.tools })}
              </p>
            </div>
            {c.auth === "oauth" &&
              (c.connected ? (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => xenaxio.disconnect(c.id))}>
                  {t("external.disconnect")}
                </Button>
              ) : (
                <Button size="sm" disabled={busy} onClick={() => void connect(c.id)}>
                  {t("external.connect", { name: c.title })}
                </Button>
              ))}
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <label className="space-y-1">
              <span>{t("external.level_read")}</span>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2"
                value={c.levels.read}
                disabled={busy}
                onChange={(e) => void act(() => xenaxio.setConnectionLevel(c.id, "read", e.target.value as ExternalLevel))}
              >
                <option value="allow">{t("external.level_allow")}</option>
                <option value="ask">{t("external.level_ask")}</option>
                <option value="deny">{t("external.level_deny")}</option>
              </select>
            </label>
            <label className="space-y-1">
              <span>{t("external.level_write")}</span>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2"
                value={c.levels.write}
                disabled={busy}
                onChange={(e) => void act(() => xenaxio.setConnectionLevel(c.id, "write", e.target.value as ExternalLevel))}
              >
                <option value="ask">{t("external.level_ask")}</option>
                <option value="deny">{t("external.level_deny")}</option>
              </select>
            </label>
          </div>
        </section>
      ))}
      <p className="text-xs text-muted-foreground">{t("external.user_privacy")}</p>
    </div>
  );
}

export default function ConnectionsPage() {
  const t = useXT();
  return (
    <WorkspaceShell title={t("external.user_title")} backHref="/workspace">
      <Connections />
    </WorkspaceShell>
  );
}
