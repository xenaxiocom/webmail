"use client";

// xenaxio sign-in (spec A1): the browser posts the credentials to our BFF,
// which signs in to the mail server and answers with an httpOnly session
// cookie. The password never stays in the browser. Replaces Bulwark's login
// page; the route stays /login so every existing redirect keeps working.
import { type FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { withBasePath } from "@/lib/browser-navigation";
import { Button } from "@/components/ui/button";
import { AuthCard, Notice, PasswordField, TextField } from "@/components/xenaxio/ui";
import { errorKey, errorText, type RoomsLinkInfo, xenaxio } from "@/lib/xenaxio/api";
import { clearAssistantState } from "@/lib/xenaxio/assistant";
import { useXT } from "@/lib/xenaxio/i18n";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { safeNextPath } from "@/lib/xenaxio/brand";
import { goToPortal, roomsStart, shouldHandOff, usePortal } from "@/lib/xenaxio/portal";
import { openAccount, otherCompanyPortal, roomsSignInOrigin } from "@/lib/xenaxio/accounts";

/**
 * Step 96: a link from an XenRooms email — an invitation (sign up: set a
 * password) or a password reset. Signed in right away, into the chat.
 */
function PasswordLinkForm({ kind, token }: { kind: "invite" | "reset"; token: string }) {
  const t = useXT();
  const locale = useLocale();
  const [info, setInfo] = useState<RoomsLinkInfo | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Step 96, part D: the company moved to Xenaxio – a new mailbox, then into mail.
  const mailbox = info?.kind === "mailbox";
  const title = t(mailbox ? "rooms.moved_title" : kind === "invite" ? "rooms.invite_title" : "rooms.reset_title");
  useDocumentTitle(title, { withAccount: false });

  useEffect(() => {
    xenaxio
      .roomsLink(kind, token)
      .then(setInfo)
      .catch(() => setInfo({ status: "unknown" }));
  }, [kind, token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await xenaxio.roomsUseLink(kind, token, password, locale);
      setPassword("");
      clearAssistantState();
      window.location.assign(withBasePath(mailbox ? `/${locale}/` : roomsStart(locale)));
    } catch (err) {
      setError(t(errorKey(err)));
      setBusy(false);
    }
  };

  if (!info) {
    return (
      <AuthCard title={title}>
        <p className="text-sm text-muted-foreground">{t("onboarding.checking")}</p>
      </AuthCard>
    );
  }
  if (info.status !== "valid") {
    return (
      <AuthCard title={title}>
        <Notice kind="error">{t(`rooms.link_${info.status}`)}</Notice>
        <a className="mt-4 inline-block text-sm font-medium text-primary underline" href={withBasePath(`/${locale}/login/`)}>
          {t("rooms.back_to_login")}
        </a>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={title} subtitle={t(mailbox ? "rooms.moved_subtitle" : kind === "invite" ? "rooms.invite_subtitle" : "rooms.reset_subtitle", { company: info.company ?? "" })}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Notice kind="error">{error}</Notice>}
        <TextField label={t("login.email")} type="email" autoComplete="username" value={info.email ?? ""} readOnly />
        <PasswordField label={t("rooms.new_password")} hint={t("password.hint")} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
        <Button type="submit" className="w-full" disabled={busy || password.length < 10}>
          {busy ? t("login.submitting") : t(kind === "invite" ? "rooms.invite_submit" : "rooms.reset_submit")}
        </Button>
      </form>
    </AuthCard>
  );
}

/** Step 96: "Forgot password" on XenRooms — a link to the email; the answer never tells whether it has an account. */
function ForgotForm({ onBack }: { onBack: () => void }) {
  const t = useXT();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDocumentTitle(t("rooms.forgot_title"), { withAccount: false });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await xenaxio.roomsForgot(email.trim());
      setSent(true);
    } catch (err) {
      setError(t(errorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title={t("rooms.forgot_title")} subtitle={t("rooms.forgot_subtitle")}>
      {sent ? (
        <Notice kind="success">{t("rooms.forgot_sent", { email: email.trim() })}</Notice>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <Notice kind="error">{error}</Notice>}
          <TextField label={t("login.email")} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          <Button type="submit" className="w-full" disabled={busy || !email.includes("@")}>
            {t("rooms.forgot_submit")}
          </Button>
        </form>
      )}
      <Button type="button" variant="ghost" className="mt-2 w-full" onClick={onBack}>
        {t("rooms.back_to_login")}
      </Button>
    </AuthCard>
  );
}

function LoginForm() {
  const t = useXT();
  const router = useRouter();
  const locale = useLocale();
  const params = useSearchParams();
  // Back to where sign-in was needed, e.g. the consent screen of an AI chat (step 9).
  const next = safeNextPath(params.get("next"));
  // Step 29: "Add account" in the account menu; the accounts signed in here stay.
  const add = params.get("mode") === "add-account";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Step 39: the account belongs to another company; it signs in on that portal.
  const [otherPortal, setOtherPortal] = useState<string | null>(null);
  // Step 96: a person without a mailbox signs in on XenRooms.
  const [roomsOrigin, setRoomsOrigin] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  // Step 97: whether XenRooms takes sign-ups (the link under the form).
  const [signupOpen, setSignupOpen] = useState(false);
  const portal = usePortal();
  const company = portal?.kind === "tenant" ? portal : null;
  // Step 67: XenRooms — the chat for all of a person's companies, always here.
  const rooms = portal?.kind === "rooms";
  const home = rooms ? roomsStart(locale) : `/${locale}/`;
  useEffect(() => {
    if (!rooms) return;
    void xenaxio
      .roomsSignupOpen()
      .then((r) => setSignupOpen(r.open))
      .catch(() => setSignupOpen(false));
  }, [rooms]);
  const title = rooms ? t(add ? "rooms.add_title" : "rooms.login_title") : add ? t("login.add_title") : t("login.title");
  useDocumentTitle(title, { withAccount: false });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOtherPortal(null);
    setRoomsOrigin(null);
    try {
      // Step 51: added from an AI chat's consent screen, it goes back there.
      const me = await xenaxio.login(email.trim(), password, locale, add ? { next: next ?? home } : undefined);
      setPassword("");
      // A new sign-in never inherits an assistant chat left in this tab.
      clearAssistantState();
      // Step 29: the added account opens here or on its company's portal.
      if (add && me.url) return openAccount(me.url);
      // Step 17: signed in on the shared address — continue on the company's own one
      // (not when sign-in was for something specific here, e.g. an AI chat's consent).
      const target = me.user.mustChangePassword ? `/${locale}/workspace/password/` : home;
      if (!next && !rooms && shouldHandOff(me.portalUrl, window.location.origin, window.location.pathname) && (await goToPortal(target))) return;
      // Full navigation: the mail app restores the session from the new cookie on load.
      if (me.user.mustChangePassword) router.replace("/workspace/password");
      else window.location.assign(withBasePath(next ?? home));
    } catch (err) {
      setOtherPortal(otherCompanyPortal(err));
      setRoomsOrigin(roomsSignInOrigin(err));
      // errorText fills in details such as the limit of accounts (step 98).
      setError(errorText(t, err));
      setBusy(false);
    }
  };

  if (forgot) return <ForgotForm onBack={() => setForgot(false)} />;

  return (
    <AuthCard
      title={title}
      subtitle={
        rooms
          ? t(add ? "rooms.add_subtitle" : "rooms.login_subtitle")
          : add
            ? t("login.add_subtitle")
            : company
              ? t("portal.login_subtitle", { company: company.name })
              : t("login.subtitle")
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && (
          <Notice kind="error">
            {error}
            {roomsOrigin && (
              <>
                {" "}
                <a className="font-medium underline" href={`${roomsOrigin}/${locale}/login/`}>
                  {t("rooms.sign_in_there", { host: new URL(roomsOrigin).host })}
                </a>
              </>
            )}
            {otherPortal && (
              <>
                {" "}
                <a className="font-medium underline" href={`${otherPortal}/${locale}/login/`}>
                  {t("login.other_company_link", { host: new URL(otherPortal).host })}
                </a>
              </>
            )}
          </Notice>
        )}
        <TextField
          label={t("login.email")}
          type="email"
          autoComplete="username"
          placeholder={t("login.email_placeholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
        <PasswordField
          label={t("login.password")}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" className="w-full" disabled={busy || !email || !password}>
          {busy ? t("login.submitting") : t("login.submit")}
        </Button>
        {rooms && !add && (
          <button type="button" className="block w-full text-center text-sm text-muted-foreground hover:text-foreground hover:underline" onClick={() => setForgot(true)}>
            {t("rooms.forgot_link")}
          </button>
        )}
        {/* Step 97: XenRooms Free without the operator. */}
        {rooms && !add && signupOpen && (
          <p className="text-center text-sm text-muted-foreground">
            {t("rooms.signup_no_account")}{" "}
            <a className="font-medium text-primary hover:underline" href={withBasePath(`/${locale}/start/`)}>
              {t("rooms.signup_link")}
            </a>
          </p>
        )}
        {add && (
          <Button type="button" variant="ghost" className="w-full" onClick={() => window.location.assign(withBasePath(home))}>
            {t("common.cancel")}
          </Button>
        )}
      </form>
    </AuthCard>
  );
}

/** Step 96: XenRooms links (?invite=… or ?reset=…) open their own form. */
function LoginOrLink() {
  const params = useSearchParams();
  const invite = params.get("invite");
  const reset = params.get("reset");
  if (invite) return <PasswordLinkForm kind="invite" token={invite} />;
  if (reset) return <PasswordLinkForm kind="reset" token={reset} />;
  return <LoginForm />;
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginOrLink />
    </Suspense>
  );
}
