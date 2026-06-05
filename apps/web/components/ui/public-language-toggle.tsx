"use client";

import { LocaleProvider } from "@/lib/i18n/locale-context";
import { LanguageToggle } from "@/components/ui/language-toggle";

/**
 * Standalone language toggle for pages outside the authenticated family layout
 * (e.g. the public landing page). Provides its own LocaleProvider so the
 * toggle works without the family layout wrapper.
 */
export function PublicLanguageToggle() {
  return (
    <LocaleProvider>
      <LanguageToggle />
    </LocaleProvider>
  );
}
