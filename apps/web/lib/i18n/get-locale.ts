import { cookies } from "next/headers";
import type { Locale } from "./translations";

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return (cookieStore.get("NEXT_LOCALE")?.value as Locale | undefined) ?? "en";
}

/**
 * Raw NEXT_LOCALE cookie read — `undefined` (not "en") when no cookie has
 * ever been set. Use this instead of `getLocale()` when the result only
 * feeds `<LocaleProvider initialLocale={...}>`: passing `undefined` lets the
 * provider fall back to detecting the browser's language client-side
 * (see lib/i18n/locale-context.tsx) instead of silently defaulting to
 * English before a first-time visitor has ever expressed a preference.
 * Server-rendered pages that read the locale directly (not just via the
 * provider) should keep using `getLocale()`, whose English default is the
 * correct first-paint fallback for text rendered outside the client context.
 */
export async function getLocaleCookie(): Promise<Locale | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get("NEXT_LOCALE")?.value as Locale | undefined;
}
