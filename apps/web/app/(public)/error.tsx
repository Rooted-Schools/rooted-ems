"use client";

import { useEffect } from "react";
import Link from "next/link";
import { LocaleProvider, useLocale } from "@/lib/i18n/locale-context";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { IconAlertTriangle } from "@/components/ui/icons";

/**
 * Public error boundary. Every route in this group does a live Supabase
 * read with no error.tsx above it previously, so any failed query (a
 * transient DB blip, a bad campus row) crashed straight to Next's default
 * error screen with no branding, no language, and no way back in.
 * Next requires error.tsx to be a Client Component, and it receives
 * {error, reset} straight from the framework — no server-fetched props.
 */
export default function PublicError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[public/error]", error);
  }, [error]);

  return (
    <LocaleProvider>
      <ErrorContent reset={reset} />
    </LocaleProvider>
  );
}

function ErrorContent({ reset }: { reset: () => void }) {
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

        <div className="flex justify-center text-error mb-4">
          <IconAlertTriangle size={40} />
        </div>
        <h1 className="text-xl font-bold text-ink">{es ? "Algo salió mal" : "Something went wrong"}</h1>
        <p className="text-sm text-stone-text mt-2">
          {es
            ? "No pudimos cargar esta página. Inténtelo de nuevo."
            : "We couldn't load this page. Please try again."}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-[44px] items-center justify-center rounded-[6px] px-6 text-sm font-semibold text-white bg-rooted-green hover:bg-deep-green transition-colors"
          >
            {es ? "Intentar de nuevo" : "Try again"}
          </button>
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center justify-center rounded-[6px] border border-line bg-white px-6 text-sm font-medium text-ink hover:bg-sunken transition-colors"
          >
            {es ? "Ir al inicio" : "Go home"}
          </Link>
        </div>
      </div>
    </div>
  );
}
