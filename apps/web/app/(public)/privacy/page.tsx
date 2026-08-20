import { LocaleProvider } from "@/lib/i18n/locale-context";
import { getLocaleCookie } from "@/lib/i18n/get-locale";
import { PrivacyClient } from "./privacy-client";

export const metadata = {
  title: "Privacy Policy — Rooted Schools",
  description:
    "How Rooted Schools collects, uses, and protects family and student information in the enrollment system.",
};

// Reads the locale cookie so the page renders in the family's chosen language.
export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const initialLocale = await getLocaleCookie();
  return (
    <LocaleProvider initialLocale={initialLocale}>
      <PrivacyClient />
    </LocaleProvider>
  );
}
