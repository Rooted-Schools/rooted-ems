export const dynamic = "force-dynamic";

import Link from "next/link";
import { headers } from "next/headers";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { IconCheckCircle, IconHelpCircle } from "@/components/ui/icons";
import { getLocaleCookie } from "@/lib/i18n/get-locale";
import { tx, type Locale } from "@/lib/i18n/translations";

export const metadata = { title: "Unsubscribe — Rooted Schools" };

/**
 * Best-effort locale resolution from the Accept-Language header, used only
 * as a fallback when this page is opened cold (an email link) and no
 * NEXT_LOCALE cookie has ever been set. Only the browser's top-priority
 * language tag is consulted; anything that isn't clearly "es" or "en"
 * counts as unresolved so the page falls back to showing both languages
 * rather than guessing wrong for a family.
 */
function resolveLocaleFromAcceptLanguage(header: string | null): Locale | undefined {
  const primary = header?.split(",")[0]?.trim().toLowerCase();
  if (!primary) return undefined;
  if (primary.startsWith("es")) return "es";
  if (primary.startsWith("en")) return "en";
  return undefined;
}

/**
 * One-click unsubscribe landing (LG-0.1). The token in the link is the
 * capability — no login required, matching CAN-SPAM's "functioning,
 * automatically honored opt-out" expectation. Idempotent; always renders
 * a calm confirmation rather than an error a family must parse.
 *
 * Reached cold from an email link, so there is often no NEXT_LOCALE cookie
 * yet. Locale resolution: cookie first, then the browser's Accept-Language
 * header. Only when neither resolves does the page fall back to showing
 * both languages stacked, so a family is never left guessing.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: { t?: string };
}) {
  let ok = false;
  const token = searchParams?.t;

  const cookieLocale = await getLocaleCookie();
  const h = await headers();
  const locale: Locale | undefined = cookieLocale ?? resolveLocaleFromAcceptLanguage(h.get("accept-language"));

  if (token && /^[0-9a-f-]{36}$/i.test(token)) {
    const supabase = createServiceRoleClient();
    const { data: lead } = await supabase
      .from("lead")
      .select("id, unsubscribed_at")
      .eq("unsubscribe_token", token)
      .maybeSingle();

    if (lead) {
      ok = true;
      if (!lead.unsubscribed_at) {
        await supabase
          .from("lead")
          .update({ unsubscribed_at: new Date().toISOString(), next_follow_up_at: null })
          .eq("id", lead.id);
        await supabase.from("lead_activity").insert({
          lead_id: lead.id,
          activity_type: "note",
          body: "Family unsubscribed from recruitment emails via the email link.",
        });
        // Exit any active nurture journeys immediately.
        await supabase
          .from("journey_enrollment")
          .update({ status: "exited", exit_reason: "unsubscribed", ended_at: new Date().toISOString() })
          .eq("lead_id", lead.id)
          .eq("status", "active");
      }
    }
  }

  // The success/failure distinction is a real, independently-computed fact
  // (did we find a lead for this token?) — it stays true regardless of which
  // language(s) we render below.
  const titleKey = ok ? "unsubscribe.confirmedTitle" : "unsubscribe.failedTitle";
  const bodyKey = ok ? "unsubscribe.confirmedBody" : "unsubscribe.failedBody";

  return (
    <div className="min-h-screen bg-warm-white flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center bg-white border border-stone/20 rounded-xl px-6 py-10 space-y-4">
        <div className="flex justify-center text-rooted-green">
          {ok ? <IconCheckCircle size={40} /> : <IconHelpCircle size={40} />}
        </div>
        {locale ? (
          <>
            <h1 className="text-xl font-bold text-ink">{tx(titleKey, locale)}</h1>
            <p className="text-sm text-ink/70">{tx(bodyKey, locale)}</p>
          </>
        ) : (
          // No cookie and no usable Accept-Language signal — show both
          // languages rather than guess wrong for a family reached cold
          // from an email link.
          <>
            <h1 className="text-xl font-bold text-ink">{tx(titleKey, "en")}</h1>
            <p className="text-sm text-ink/70">{tx(bodyKey, "en")}</p>
            <hr className="border-stone/20" />
            <h2 className="text-lg font-bold text-ink">{tx(titleKey, "es")}</h2>
            <p className="text-sm text-ink/70">{tx(bodyKey, "es")}</p>
          </>
        )}
        <Link href="/" className="text-sm text-rooted-green hover:underline block pt-2">
          rootedschool.org
        </Link>
      </div>
    </div>
  );
}
