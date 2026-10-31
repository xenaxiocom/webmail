"use client";

// xenaxio step 73: the live demo without sign-up. The website's "Live demo"
// button opens this page; it takes a free demo company for the guest, signs
// in as its owner and opens the mail app (on the company's portal). A reload
// keeps the company this browser already has.
import { Suspense, useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { withBasePath } from "@/lib/browser-navigation";
import { AuthCard, Notice } from "@/components/xenaxio/ui";
import { errorKey, XenaxioApiError, xenaxio } from "@/lib/xenaxio/api";
import { clearAssistantState } from "@/lib/xenaxio/assistant";
import { useXT } from "@/lib/xenaxio/i18n";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { goToPortal, shouldHandOff } from "@/lib/xenaxio/portal";

function DemoStart() {
  const t = useXT();
  const locale = useLocale();
  const [error, setError] = useState<{ key: string; busy: boolean } | null>(null);
  const started = useRef(false);
  useDocumentTitle(t("demo.title"), { withAccount: false });

  useEffect(() => {
    // Once per page view (React runs effects twice in development).
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const me = await xenaxio.demoStart(locale);
        clearAssistantState();
        const target = `/${locale}/`;
        if (shouldHandOff(me.portalUrl, window.location.origin, window.location.pathname) && (await goToPortal(target))) return;
        window.location.assign(withBasePath(target));
      } catch (err) {
        const busy = err instanceof XenaxioApiError && ["demo_busy", "demo_rate_limited", "demo_daily_limit"].includes(err.code);
        setError({ key: errorKey(err), busy });
      }
    })();
  }, [locale]);

  return (
    <AuthCard title={t("demo.title")} subtitle={error ? undefined : t("demo.starting")}>
      {error ? (
        <div className="space-y-4">
          <Notice kind={error.busy ? "info" : "error"}>{t(error.key)}</Notice>
          <p className="text-sm text-muted-foreground">{t("demo.meanwhile")}</p>
          <button type="button" className="text-sm font-medium text-primary underline underline-offset-2" onClick={() => window.location.reload()}>
            {t("demo.retry")}
          </button>
        </div>
      ) : (
        <div className="flex justify-center py-6" aria-hidden>
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
    </AuthCard>
  );
}

export default function DemoPage() {
  return (
    <Suspense>
      <DemoStart />
    </Suspense>
  );
}
