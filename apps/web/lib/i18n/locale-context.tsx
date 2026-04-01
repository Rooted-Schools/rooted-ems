"use client";

import { createContext, useContext, useState } from "react";
import { type Locale, type TranslationKey, tx } from "./translations";
import { setLocaleCookie } from "./locale-actions";

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
  initialLocale = "en",
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  function setLocale(l: Locale) {
    setLocaleState(l); // instant UI update
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
