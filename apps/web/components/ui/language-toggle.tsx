"use client";

import { useLocale } from "@/lib/i18n/locale-context";
import type { Locale } from "@/lib/i18n/translations";

const LOCALES: { value: Locale; label: string; ariaLabel: string }[] = [
  { value: "en", label: "EN", ariaLabel: "Switch to English" },
  { value: "es", label: "ES", ariaLabel: "Cambiar a español" },
];

export function LanguageToggle() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="flex items-center gap-0.5 text-xs font-medium rounded-md overflow-hidden border border-stone/20">
      {LOCALES.map(({ value, label, ariaLabel }) => (
        <button
          key={value}
          type="button"
          onClick={() => setLocale(value)}
          className={`px-2 py-1 transition-colors ${
            locale === value
              ? "bg-rooted-green text-white"
              : "text-stone hover:text-ink hover:bg-rooted-gray"
          }`}
          aria-pressed={locale === value}
          aria-label={ariaLabel}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
