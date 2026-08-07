import { Card, CardContent } from "@/components/ui/card";
import { createServerClient } from "@rooted-ems/database/server";
import { redirect } from "next/navigation";
import { getLocale } from "@/lib/i18n/get-locale";
import { tx } from "@/lib/i18n/translations";
import { AccountClient } from "./account-client";

export const dynamic = "force-dynamic";

/**
 * Light Account page (UX Phase 1A / 1.2) — read-only contact info, the
 * language toggle, and sign out. Replaces the header dropdown; nav item is
 * "Account" in both the desktop header and the phone bottom tab bar.
 */
export default async function FamilyAccountPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const locale = await getLocale();
  const t = (key: Parameters<typeof tx>[0]) => tx(key, locale);

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-xl font-bold text-ink">{t("account.title")}</h1>

      <div>
        <h2 className="text-sm font-semibold text-ink mb-3">{t("account.contactInfo")}</h2>
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-stone-text">{t("account.email")}</span>
              <span className="text-sm text-ink font-medium truncate">
                {user.email ?? t("account.notProvided")}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-stone-text">{t("account.phone")}</span>
              <span className="text-sm text-ink font-medium truncate">
                {user.phone ?? t("account.notProvided")}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <AccountClient />
    </div>
  );
}
