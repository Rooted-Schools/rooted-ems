import { FamilyLoginForm } from "@/components/auth/family-login-form";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { LocaleProvider } from "@/lib/i18n/locale-context";
import { getLocale } from "@/lib/i18n/get-locale";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export const metadata = {
  title: "Family Login | Rooted EMS",
};

export default async function LoginPage() {
  // Single provider wraps both the toggle and the form so switching
  // language re-renders the login form immediately.
  const initialLocale = await getLocale();

  return (
    <LocaleProvider initialLocale={initialLocale}>
      <div className="min-h-screen flex items-center justify-center bg-warm-white px-4">
        {/* Language toggle — top-right, visible before login */}
        <div className="fixed top-4 right-4 z-50">
          <LanguageToggle />
        </div>
        <FamilyLoginForm />
      </div>
    </LocaleProvider>
  );
}
