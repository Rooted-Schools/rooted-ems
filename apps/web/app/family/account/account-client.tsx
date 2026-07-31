"use client";

import { useMemo } from "react";
import { createBrowserClient } from "@rooted-ems/database";
import { useLocale } from "@/lib/i18n/locale-context";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Language toggle + sign out — the only interactive bits of the Account page. */
export function AccountClient() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const { t } = useLocale();

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <>
      <Card>
        <CardContent className="p-6 flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-ink">{t("account.language")}</span>
          <LanguageToggle />
        </CardContent>
      </Card>

      <Button variant="outline" className="w-full" onClick={handleSignOut}>
        {t("nav.signOut")}
      </Button>
    </>
  );
}
