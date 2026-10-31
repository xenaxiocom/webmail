"use client";

// Step 96: a company without email (XenRooms) from the operator's invitation
// link: name, chat address <slug>.<XenRooms address>, the first admin with
// their own email and a password. Then straight into the chat.
import { type FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthCard, Field, Notice, PasswordField, TextField } from "@/components/xenaxio/ui";
import { errorKey, type SlugProblem, xenaxio, XenaxioApiError } from "@/lib/xenaxio/api";
import { withBasePath } from "@/lib/browser-navigation";
import { useXT } from "@/lib/xenaxio/i18n";
import { roomsStart } from "@/lib/xenaxio/portal";
import { useDocumentTitle } from "@/hooks/use-document-title";

type Status = "checking" | "valid" | "used" | "expired" | "unknown";

function StartForm() {
  const t = useXT();
  const locale = useLocale();
  const token = useSearchParams().get("token") ?? "";
  const [status, setStatus] = useState<Status>("checking");
  const [form, setForm] = useState({ companyName: "", adminName: "", email: "", password: "" });
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [domain, setDomain] = useState<string | null>(null);
  const [slugProblem, setSlugProblem] = useState<SlugProblem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  useDocumentTitle(t("rooms.start_title"), { withAccount: false });

  useEffect(() => {
    if (!token) return setStatus("unknown");
    xenaxio
      .roomsInvitation(token)
      .then((r) => {
        setDomain(r.domain);
        // A workspace invitation belongs to the Xenaxio onboarding, not here.
        setStatus(r.status === "valid" && r.product !== "rooms" ? "unknown" : r.status);
      })
      .catch(() => setStatus("unknown"));
  }, [token]);

  // The chat address, suggested from the company name until edited by hand.
  useEffect(() => {
    if (status !== "valid" || slugEdited) return;
    const name = form.companyName.trim();
    if (!name) return;
    const timer = setTimeout(() => {
      xenaxio
        .roomsSlug(token, { name })
        .then((r) => {
          setDomain(r.domain);
          if (r.suggestion) setSlug(r.suggestion);
          setSlugProblem(null);
        })
        .catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [form.companyName, slugEdited, status, token]);

  useEffect(() => {
    if (status !== "valid" || !slugEdited) return;
    if (!slug) return setSlugProblem("invalid");
    const timer = setTimeout(() => {
      xenaxio
        .roomsSlug(token, { slug })
        .then((r) => setSlugProblem(r.problem ?? null))
        .catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [slug, slugEdited, status, token]);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await xenaxio.roomsOnboard({ token, ...form, email: form.email.trim(), slug, locale: locale === "en" ? "en" : "de" });
      setForm((f) => ({ ...f, password: "" }));
      window.location.assign(withBasePath(roomsStart(locale)));
    } catch (err) {
      if (err instanceof XenaxioApiError && err.issues?.length) {
        setFieldErrors(Object.fromEntries(err.issues.map((i) => [i.path, t(`errors.${/^[a-z_]+$/.test(i.message) ? i.message : "validation"}`)])));
      }
      setError(t(errorKey(err)));
      setBusy(false);
    }
  };

  if (status !== "valid") {
    return (
      <AuthCard title={t("rooms.start_title")}>
        {status === "checking" ? <p className="text-sm text-muted-foreground">{t("onboarding.checking")}</p> : <Notice kind="error">{t(`errors.invitation_${status}`)}</Notice>}
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("rooms.start_title")} subtitle={t("rooms.start_subtitle")}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Notice kind="error">{error}</Notice>}
        <TextField label={t("onboarding.company")} value={form.companyName} onChange={set("companyName")} autoComplete="organization" error={fieldErrors.companyName} required autoFocus />
        <Field
          label={t("rooms.chat_address")}
          htmlFor="rooms-address"
          hint={slugProblem ? undefined : t("rooms.chat_address_hint")}
          error={slugProblem ? t(`errors.slug_${slugProblem}`) : fieldErrors.slug}
        >
          <div className="flex items-center gap-2">
            <Input
              id="rooms-address"
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
        <TextField label={t("onboarding.admin_name")} value={form.adminName} onChange={set("adminName")} autoComplete="name" error={fieldErrors.adminName} required />
        <TextField
          label={t("rooms.work_email")}
          hint={t("rooms.work_email_hint")}
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={set("email")}
          error={fieldErrors.email}
          required
        />
        <PasswordField label={t("onboarding.password")} hint={t("password.hint")} autoComplete="new-password" value={form.password} onChange={set("password")} error={fieldErrors.password} required />
        <Button type="submit" className="w-full" disabled={busy || !form.companyName.trim() || !slug || !!slugProblem || !form.adminName.trim() || !form.email.includes("@") || form.password.length < 10}>
          {busy ? t("onboarding.submitting") : t("rooms.start_submit")}
        </Button>
      </form>
    </AuthCard>
  );
}

export default function RoomsStartPage() {
  return (
    <Suspense>
      <StartForm />
    </Suspense>
  );
}
