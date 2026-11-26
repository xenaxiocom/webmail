"use client";

// Step 152 R1: XenRooms on a phone signs in to every company of this browser at once
// (owner 26.11.2026: "one common sign-in"). The platform's /api/mobile/authorize sends the
// phone's browser here with the app's sign-in request in the query; the person ticks the
// companies that go to the phone (all, except those already there) and the platform hands
// the app one code for them. The platform checks the request again, nothing here is trusted.
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { withBasePath } from "@/lib/browser-navigation";
import { Button } from "@/components/ui/button";
import { CompanyMark } from "@/components/xenaxio/chat/rooms-rail";
import { AuthCard, Notice, Spinner } from "@/components/xenaxio/ui";
import { type BrowserAccount, xenaxio, XenaxioApiError } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";
import { readMobileRequest as readRequest, ROOMS_APP } from "@/lib/xenaxio/mobile-connect";

function Connect() {
  const t = useXT();
  const locale = useLocale();
  const query = useSearchParams();
  const parsed = useMemo(() => readRequest(query), [query]);
  const [accounts, setAccounts] = useState<BrowserAccount[] | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const back = `/${locale}/mobile/connect/?${query.toString()}`;

  useEffect(() => {
    if (!parsed) return;
    let cancelled = false;
    xenaxio.accounts().then(
      (list) => {
        if (cancelled) return;
        setAccounts(list.accounts);
        setTicked(new Set(list.accounts.filter((a) => !parsed.have.has(a.userId)).map((a) => a.userId)));
      },
      (err) => {
        if (cancelled) return;
        // Signed out meanwhile: sign in, then back to this very request.
        if (err instanceof XenaxioApiError && err.status === 401) {
          window.location.assign(withBasePath(`/${locale}/login/?next=${encodeURIComponent(back)}`));
          return;
        }
        setError(t("mobile_connect.failed"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [parsed, back, locale, t]);

  if (!parsed) {
    return (
      <AuthCard title={t("mobile_connect.title")}>
        <Notice kind="error">{t("mobile_connect.invalid")}</Notice>
      </AuthCard>
    );
  }
  if (leaving) return <Spinner label={t("mobile_connect.back")} />;
  if (!accounts) return error ? <AuthCard title={t("mobile_connect.title")}><Notice kind="error">{error}</Notice></AuthCard> : <Spinner label={t("common.loading")} />;

  const toggle = (userId: string) =>
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await xenaxio.mobileConnect({ ...parsed.request, userIds: [...ticked] });
      setLeaving(true);
      window.location.assign(url);
    } catch {
      setError(t("mobile_connect.failed"));
      setBusy(false);
    }
  };

  // Back to the app without a code; the app shows its sign-in again.
  const cancel = () => {
    const target = new URL(ROOMS_APP);
    target.searchParams.set("error", "access_denied");
    target.searchParams.set("state", parsed.request.state);
    window.location.assign(target.toString());
  };

  // One more company: the platform's sign-in for another company, then this page again.
  const addParams = new URLSearchParams(query);
  addParams.delete("have");
  addParams.set("prompt", "add");
  if (parsed.have.size) addParams.set("have", [...parsed.have].join(","));
  const addHref = withBasePath(`/api/mobile/authorize?${addParams.toString()}`);

  return (
    <AuthCard title={t("mobile_connect.title")}>
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">{t("mobile_connect.intro")}</p>
        {accounts.length === 0 ? (
          <Notice kind="info">{t("mobile_connect.none")}</Notice>
        ) : (
          <ul className="space-y-2" data-testid="mobile-connect-companies">
            {accounts.map((account) => {
              const already = parsed.have.has(account.userId);
              return (
                <li key={account.userId}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card px-3 py-2 has-[:checked]:border-primary">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={ticked.has(account.userId)}
                      onChange={() => toggle(account.userId)}
                      disabled={busy}
                    />
                    <CompanyMark account={account} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{account.company}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {account.email}
                        {already ? ` · ${t("mobile_connect.already")}` : ""}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <a className="inline-block text-sm text-primary underline-offset-2 hover:underline" href={addHref}>
          {t("mobile_connect.add")}
        </a>

        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={cancel} disabled={busy}>
            {t("mobile_connect.cancel")}
          </Button>
          <Button onClick={confirm} disabled={busy || ticked.size === 0}>
            {busy ? t("mobile_connect.working") : ticked.size ? t("mobile_connect.confirm_n", { count: ticked.size }) : t("mobile_connect.confirm")}
          </Button>
        </div>
      </div>
    </AuthCard>
  );
}

export default function MobileConnectPage() {
  return (
    <Suspense>
      <Connect />
    </Suspense>
  );
}
