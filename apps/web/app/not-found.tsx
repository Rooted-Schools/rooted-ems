"use client";

import Link from "next/link";
import { LocaleProvider, useLocale } from "@/lib/i18n/locale-context";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { IconSearch } from "@/components/ui/icons";

/**
 * App-wide 404. These URLs end up on printed flyers and QR codes, so a
 * mistyped or stale campus slug used to hit Next's bare unbranded English
 * 404 with no way back in.
 *
 * This lives at the app root, NOT under (public), on purpose. A nested
 * not-found boundary renders with a 200 status: Next only returns a real
 * 404 from the root one. The e2e smoke suite asserts that status, because
 * a soft 404 tells search engines and link checkers that a dead campus URL
 * is a live page.
 *
 * No initialLocale: this boundary can render for any request, so the
 * language toggle detects the saved preference client-side after
 * hydration, same as the ISR-cached landing pages.
 */
export default function NotFound() {
  return (
    <LocaleProvider>
      <NotFoundContent />
    </LocaleProvider>
  );
}

function NotFoundContent() {
  const { locale } = useLocale();
  const es = locale === "es";

  return (
    <div className="min-h-screen bg-gradient-to-b from-rooted-green/5 to-warm-white flex flex-col items-center justify-center px-4 py-12 text-center">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between mb-8">
          <span className="text-xl tracking-wide">
            <span className="text-rooted-green font-bold">rooted</span><span className="text-ink font-medium">schools</span>
          </span>
          <LanguageToggle />
        </div>

        <div className="flex justify-center text-stone mb-4">
          <IconSearch size={40} />
        </div>
        <h1 className="text-xl font-bold text-ink">{es ? "Página no encontrada" : "Page not found"}</h1>
        <p className="text-sm text-stone-text mt-2">
          {es
            ? "Esta página no existe. Es posible que el enlace esté desactualizado o mal escrito."
            : "This page does not exist. The link may be outdated or mistyped."}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center justify-center rounded-[6px] px-6 text-sm font-semibold text-white bg-rooted-green hover:bg-deep-green transition-colors"
          >
            {es ? "Ir al inicio" : "Go home"}
          </Link>
          <Link
            href="/inquire"
            className="inline-flex min-h-[44px] items-center justify-center rounded-[6px] border border-line bg-white px-6 text-sm font-medium text-ink hover:bg-sunken transition-colors"
          >
            {es ? "Solicitar información" : "Request info"}
          </Link>
        </div>
      </div>
    </div>
  );
}
