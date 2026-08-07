import { Suspense } from "react";
import { ResetPasswordForm } from "./reset-password-form";
import { LocaleProvider } from "@/lib/i18n/locale-context";
import { getLocale } from "@/lib/i18n/get-locale";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export const metadata = {
  title: "Reset Password | Rooted EMS",
};

/**
 * Landing page for both staff and family password-reset links
 * (supabase.auth.resetPasswordForEmail redirects here). Wrapped in
 * LocaleProvider so family users who reset in Spanish see Spanish copy;
 * staff sessions default to English since the staff login form never sets
 * the NEXT_LOCALE cookie.
 */
export default async function ResetPasswordPage() {
  const initialLocale = await getLocale();

  return (
    <LocaleProvider initialLocale={initialLocale}>
      <div className="min-h-screen flex items-center justify-center bg-warm-white px-4">
        <Suspense fallback={<div className="w-full max-w-md h-80" />}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </LocaleProvider>
  );
}
