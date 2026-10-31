"use client";

// Step 97: sign-up for XenRooms Free, without the operator. The company, its
// admin and its chat server are created only once the email is confirmed
// (the link in the email opens this page with ?confirm=…).
import { type FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthCard, Field, Notice, PasswordField, TextField } from "@/components/xenaxio/ui";
import { errorKey, errorText, type SlugProblem, xenaxio, XenaxioApiError } from "@/lib/xenaxio/api";
import { withBasePath } from "@/lib/browser-navigation";
import { clearAssistantState } from "@/lib/xenaxio/assistant";
import { useXT } from "@/lib/xenaxio/i18n";
import { roomsStart } from "@/lib/xenaxio/portal";
import { useDocumentTitle } from "@/hooks/use-document-title";

/** The privacy policy covering XenRooms (xenrooms.com shows the same as xenaxio.com). */
const PRIVACY = { de: "https://xenrooms.com/de/datenschutz/", en: "https://xenrooms.com/privacy/" };

function ConfirmView({ token }: { token: string }) {
  const t = useXT();
  const locale = useLocale();
  const [info, setInfo] = useState<{ status: string; email?: string; company?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDocumentTitle(t("rooms.signup_confirm_title"), { withAccount: false });

  useEffect(() => {
    xenaxio
      .roomsSignupInfo(token)
      .then(setInfo)
      .catch(() => setInfo({ status: "unknown" }));
  }, [token]);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await xenaxio.roomsSignupConfirm(token);
      clearAssistantState();
      window.location.assign(withBasePath(roomsStart(locale)));
    } catch (err) {
      setError(t(errorKey(err)));
      setBusy(false);
    }
  };

  if (!info) {
    return (
      <AuthCard title={t("rooms.signup_confirm_title")}>
        <p className="text-sm text-muted-foreground">{t("onboarding.checking")}</p>
      </AuthCard>
    );
  }
  if (info.status !== "valid") {
    return (
      <AuthCard title={t("rooms.signup_confirm_title")}>
        <Notice kind="error">{t(`rooms.signup_link_${info.status}`)}</Notice>
        <a className="mt-4 inline-block text-sm font-medium text-primary underline" href={withBasePath(`/${locale}/start/`)}>
          {t("rooms.signup_again")}
        </a>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={t("rooms.signup_confirm_title")} subtitle={t("rooms.signup_confirm_subtitle", { company: info.company ?? "", email: info.email ?? "" })}>
      {error && <Notice kind="error">{error}</Notice>}
      <Button className="mt-2 w-full" disabled={busy} onClick={() => void confirm()}>
        {busy ? t("rooms.signup_creating") : t("rooms.signup_confirm_submit")}
      </Button>
    </AuthCard>
  );
}

function SignupForm() {
  const t = useXT();
  const locale = useLocale();
  const lang: "de" | "en" = locale === "de" ? "de" : "en";
  const [open, setOpen] = useState<boolean | null>(null);
  const [form, setForm] = useState({ displayName: "", email: "", companyName: "", password: "", homepage: "" });
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [domain, setDomain] = useState<string | null>(null);
  const [slugProblem, setSlugProblem] = useState<SlugProblem | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  useDocumentTitle(t("rooms.signup_title"), { withAccount: false });

  useEffect(() => {
    xenaxio
      .roomsSignupOpen()
      .then((r) => {
        setOpen(r.open);
        setDomain(r.domain);
      })
      .catch(() => setOpen(false));
  }, []);

  // The chat address, suggested from the company name until edited by hand.
  useEffect(() => {
    if (!open || slugEdited) return;
    const name = form.companyName.trim();
    if (!name) return;
    const timer = setTimeout(() => {
      xenaxio
        .roomsSignupSlug({ name })
        .then((r) => {
          if (r.suggestion) setSlug(r.suggestion);
          setSlugProblem(null);
        })
        .catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [form.companyName, slugEdited, open]);

  useEffect(() => {
    if (!open || !slugEdited) return;
    if (!slug) return setSlugProblem("invalid");
    const timer = setTimeout(() => {
      xenaxio
        .roomsSignupSlug({ slug })
        .then((r) => setSlugProblem(r.problem ?? null))
        .catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [slug, slugEdited, open]);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await xenaxio.roomsSignup({ ...form, email: form.email.trim(), slug, locale: lang, ...(form.homepage ? { homepage: form.homepage } : {}) });
      setForm((f) => ({ ...f, password: "" }));
      setSent(true);
    } catch (err) {
      if (err instanceof XenaxioApiError && err.issues?.length) {
        setFieldErrors(Object.fromEntries(err.issues.map((i) => [i.path, t(`errors.${/^[a-z_]+$/.test(i.message) ? i.message : "validation"}`)])));
      }
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  if (open === null) {
    return (
      <AuthCard title={t("rooms.signup_title")}>
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </AuthCard>
    );
  }
  if (!open) {
    return (
      <AuthCard title={t("rooms.signup_title")}>
        <Notice kind="info">{t("rooms.signup_closed")}</Notice>
      </AuthCard>
    );
  }
  if (sent) {
    return (
      <AuthCard title={t("rooms.signup_sent_title")}>
        <Notice kind="success">{t("rooms.signup_sent", { email: form.email.trim() })}</Notice>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={t("rooms.signup_title")} subtitle={t("rooms.signup_subtitle")}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Notice kind="error">{error}</Notice>}
        <TextField label={t("onboarding.admin_name")} value={form.displayName} onChange={set("displayName")} autoComplete="name" error={fieldErrors.displayName} required autoFocus />
        <TextField label={t("rooms.work_email")} hint={t("rooms.work_email_hint")} type="email" autoComplete="email" value={form.email} onChange={set("email")} error={fieldErrors.email} required />
        <TextField label={t("onboarding.company")} value={form.companyName} onChange={set("companyName")} autoComplete="organization" error={fieldErrors.companyName} required />
        <Field
          label={t("rooms.chat_address")}
          htmlFor="signup-address"
          hint={slugProblem ? undefined : t("rooms.chat_address_hint")}
          error={slugProblem ? t(`errors.slug_${slugProblem}`) : fieldErrors.slug}
        >
          <div className="flex items-center gap-2">
            <Input
              id="signup-address"
              value={slug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40));
              }}
              autoCapitalize="none"
              spellCheck={false}
              placeholder="mueller"
              className="flex-1 min-w-0"
              aria-invalid={slugProblem ? true : undefined}
            />
            <span className="text-sm text-muted-foreground truncate max-w-[55%]">.{domain ?? "…"}</span>
          </div>
        </Field>
        <PasswordField label={t("onboarding.password")} hint={t("password.hint")} autoComplete="new-password" value={form.password} onChange={set("password")} error={fieldErrors.password} required />
        {/* Hidden from people; only bots fill it in. */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor="signup-homepage">Homepage</label>
          <input id="signup-homepage" tabIndex={-1} autoComplete="off" value={form.homepage} onChange={set("homepage")} />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            {t("rooms.signup_consent")}{" "}
            <a href={PRIVACY[lang]} target="_blank" rel="noopener" className="text-primary underline">
              {t("rooms.signup_privacy")}
            </a>
          </span>
        </label>
        <p className="text-xs text-muted-foreground">{t("rooms.signup_free_note")}</p>
        <Button
          type="submit"
          className="w-full"
          disabled={busy || !consent || !form.displayName.trim() || !form.email.includes("@") || !form.companyName.trim() || !slug || !!slugProblem || form.password.length < 10}
        >
          {busy ? t("login.submitting") : t("rooms.signup_submit")}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          {t("rooms.signup_have_account")}{" "}
          <a className="text-primary hover:underline" href={withBasePath(`/${locale}/login/`)}>
            {t("login.submit")}
          </a>
        </p>
      </form>
    </AuthCard>
  );
}

function StartPage() {
  const confirm = useSearchParams().get("confirm");
  return confirm ? <ConfirmView token={confirm} /> : <SignupForm />;
}

export default function RoomsSignupPage() {
  return (
    <Suspense>
      <StartPage />
    </Suspense>
  );
}
