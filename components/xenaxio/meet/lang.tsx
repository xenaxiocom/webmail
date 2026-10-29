"use client";

// xenaxio step 78: the meeting page speaks German or English. Guests get the
// browser's language; signed-in people their saved choice. A switch on the page.
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { guestLocale } from "@/lib/xenaxio/booking";
import { translate } from "@/lib/xenaxio/i18n";

export type Lang = "de" | "en";
export type T = (key: string, values?: Record<string, string | number>) => string;

/** The language the person chose in the app (stores/locale-store.ts), if any. */
function savedLocale(): Lang | null {
  try {
    const raw = localStorage.getItem("locale-storage");
    const locale = raw ? (JSON.parse(raw) as { state?: { locale?: string } }).state?.locale : "";
    if (locale?.startsWith("de")) return "de";
    if (locale?.startsWith("en")) return "en";
  } catch {
    // No storage: the browser's language.
  }
  return null;
}

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: T } | null>(null);

export function MeetLangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => (typeof window === "undefined" ? "de" : (savedLocale() ?? guestLocale())));
  const t: T = useCallback((key, values) => translate(lang, `meet.${key}`, values), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMeetLang() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMeetLang outside MeetLangProvider");
  return ctx;
}

/** A known error code as text; anything else as the general one. */
export function meetError(t: T, code: string): string {
  const text = t(`errors.${code}`);
  return text === `meet.errors.${code}` ? t("errors.internal") : text;
}
