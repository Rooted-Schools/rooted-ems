"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { type Locale, type TranslationKey, tx } from "./translations";
import { setLocaleCookie } from "./locale-actions";

const LOCALE_STORAGE_KEY = "NEXT_LOCALE";

function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "es";
}

/**
 * Best-effort client-side locale detection for pages that cannot read the
 * NEXT_LOCALE cookie on the server (e.g. the ISR-cached public landing page).
 * The NEXT_LOCALE cookie is httpOnly (security hardening), so document.cookie
 * usually cannot see it — setLocale mirrors the preference into localStorage
 * and we read it back here. document.cookie is still checked first in case a
 * readable cookie is ever present.
 */
function readClientLocale(): Locale | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=(en|es)(?:;|$)/);
  if (match && isLocale(match[1])) return match[1];
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // localStorage unavailable (private mode, blocked storage) — ignore
  }
  return null;
}

/**
 * First-touch fallback when nothing has ever recorded a preference (no
 * NEXT_LOCALE cookie, nothing saved locally): read the browser's own
 * language setting. Only ever consulted after readClientLocale() comes back
 * empty — an explicit past choice always wins over this guess.
 */
function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  return navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey) => string;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "en",
  setLocale: () => {},
  t: (key) => tx(key, "en"),
});

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  /**
   * Server-resolved locale (from the NEXT_LOCALE cookie). Omit on static/ISR
   * pages — the provider will then detect the saved preference on the client
   * after hydration (a brief flash of English is the accepted tradeoff for
   * keeping those pages cached).
   */
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? "en");

  useEffect(() => {
    if (initialLocale !== undefined) return; // server already seeded the locale (a cookie exists)
    const saved = readClientLocale();
    if (saved) {
      setLocaleState(saved);
      return;
    }
    // No cookie and nothing saved locally — this is a first-time visitor.
    // Read the browser's language and make it stick, the same way an
    // explicit toggle click does, so it persists (cookie + localStorage)
    // instead of re-guessing on every page load.
    setLocale(detectBrowserLocale());
  }, [initialLocale]);

  function setLocale(l: Locale) {
    setLocaleState(l); // instant UI update
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, l);
    } catch {
      // storage unavailable — cookie persistence below still applies
    }
    void setLocaleCookie(l); // persist in background — no await needed
  }

  const t = (key: TranslationKey) => tx(key, locale);

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
