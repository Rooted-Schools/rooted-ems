export const dynamic = "force-dynamic";

import Link from "next/link";
import { headers } from "next/headers";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { IconCheckCircle, IconHelpCircle } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getLocaleCookie } from "@/lib/i18n/get-locale";
import { tx, type Locale, type TranslationKey } from "@/lib/i18n/translations";
import { INTEREST_FOCUS_OPTIONS, isInterestFocusKey, type InterestFocusKey } from "@/lib/lead-interest-survey";
import { submitInterestDetails } from "./actions";

export const metadata = { title: "What matters most? — Rooted Schools" };

const TOKEN_RE = /^[0-9a-f-]{36}$/i;

/**
 * Same best-effort Accept-Language fallback as the unsubscribe page — this
 * link is also reached cold from an email, often with no NEXT_LOCALE cookie
 * set yet.
 */
function resolveLocaleFromAcceptLanguage(header: string | null): Locale | undefined {
  const primary = header?.split(",")[0]?.trim().toLowerCase();
  if (!primary) return undefined;
  if (primary.startsWith("es")) return "es";
  if (primary.startsWith("en")) return "en";
  return undefined;
}

/** interest_focus key → the translation key for its family-facing label. */
const OPTION_LABEL_KEYS: Record<InterestFocusKey, TranslationKey> = {
  career_connected: "interest.optionCareerConnected",
  hbcu_authorized: "interest.optionHbcuAuthorized",
  career_majors: "interest.optionCareerMajors",
  financial_literacy: "interest.optionFinancialLiteracy",
  other: "interest.optionOther",
};

/**
 * Public, unauthenticated one-question interest survey (LG-0.2 style — same
 * shape as /unsubscribe). Reached from a link in the first nurture email:
 * `?t=<survey_token>&c=<choice>`. The token is the only capability, no login,
 * and survey_token is intentionally never the same value as unsubscribe_token
 * (see 00067_lead_interest_survey.sql) — clicking or forwarding this link
 * must never be able to silence the family's recruitment email.
 *
 * An unknown/invalid token, and an unknown/missing choice, are both treated
 * as "nothing to write yet" rather than an error: the page always renders
 * the same way regardless of whether the token maps to a real lead, so it
 * never reveals whether a given token exists. Only a real lead + a valid
 * choice ever results in a write.
 */
export default async function InterestPage({
  searchParams,
}: {
  searchParams: { t?: string; c?: string; saved?: string };
}) {
  const token = searchParams?.t;
  const tokenLooksValid = typeof token === "string" && TOKEN_RE.test(token);
  const choice = isInterestFocusKey(searchParams?.c) ? searchParams.c : null;
  const justSaved = searchParams?.saved === "1";

  if (tokenLooksValid && choice) {
    const supabase = createServiceRoleClient();
    const { data: lead } = await supabase
      .from("lead")
      .select("id")
      .eq("survey_token", token)
      .maybeSingle();

    if (lead) {
      // Always write on a valid (token, choice) pair — re-picking the same
      // option or a different one both re-stamp answered_at, since a family
      // changing their mind later is legitimate, not an error.
      await supabase
        .from("lead")
        .update({
          interest_focus: choice,
          interest_focus_answered_at: new Date().toISOString(),
          // Clear a stale "other" note when the family switches to a
          // different option, so it doesn't linger under the new choice.
          ...(choice === "other" ? {} : { interest_focus_other: null }),
        })
        .eq("id", lead.id);
    }
    // No `else`: an unknown token silently does nothing and falls through to
    // exactly the same confirmation render as a real one.
  }

  const cookieLocale = await getLocaleCookie();
  const h = await headers();
  const locale: Locale | undefined = cookieLocale ?? resolveLocaleFromAcceptLanguage(h.get("accept-language"));

  const answered = Boolean(choice);
  const showOtherField = choice === "other";

  function renderQuestion(loc: Locale) {
    return (
      <>
        <h1 className="text-xl font-bold text-ink">{tx("interest.questionTitle", loc)}</h1>
        <p className="text-sm text-ink/70">{tx("interest.questionBody", loc)}</p>
        <div className="space-y-2 pt-2 text-left">
          {INTEREST_FOCUS_OPTIONS.map((o) => (
            <Link
              key={o.key}
              href={`/interest?t=${encodeURIComponent(token ?? "")}&c=${o.key}`}
              className="block w-full rounded-[6px] border border-stone/30 bg-white px-4 py-3 text-sm font-medium text-ink hover:border-rooted-green hover:bg-rooted-gray-light"
            >
              {tx(OPTION_LABEL_KEYS[o.key], loc)}
            </Link>
          ))}
        </div>
      </>
    );
  }

  function renderThanks(loc: Locale) {
    return (
      <>
        <h1 className="text-xl font-bold text-ink">{tx("interest.thanksTitle", loc)}</h1>
        <p className="text-sm text-ink/70">{tx("interest.thanksBody", loc)}</p>
        <form action={submitInterestDetails} className="space-y-3 pt-2 text-left">
          <input type="hidden" name="t" value={token ?? ""} />
          <input type="hidden" name="c" value={choice ?? ""} />
          <div>
            <label htmlFor={`studentFirstName-${loc}`} className="block text-xs text-stone mb-1">
              {tx("interest.studentNameLabel", loc)}
            </label>
            <Input id={`studentFirstName-${loc}`} name="studentFirstName" maxLength={100} />
          </div>
          {showOtherField && (
            <div>
              <label htmlFor={`otherText-${loc}`} className="block text-xs text-stone mb-1">
                {tx("interest.otherLabel", loc)}
              </label>
              <textarea
                id={`otherText-${loc}`}
                name="otherText"
                maxLength={500}
                rows={3}
                className="flex w-full rounded-[6px] border border-stone/30 bg-white px-3 py-2 text-sm placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-rooted-green focus:border-transparent"
              />
            </div>
          )}
          <Button type="submit" size="sm">
            {tx("interest.saveButton", loc)}
          </Button>
        </form>
      </>
    );
  }

  const render = answered ? renderThanks : renderQuestion;

  return (
    <div className="min-h-screen bg-warm-white flex items-center justify-center px-4 py-10">
      <div className="max-w-md w-full text-center bg-white border border-stone/20 rounded-xl px-6 py-10 space-y-4">
        <div className="flex justify-center text-rooted-green">
          {answered ? <IconCheckCircle size={40} /> : <IconHelpCircle size={40} />}
        </div>
        {locale ? (
          render(locale)
        ) : (
          // No cookie and no usable Accept-Language signal — show both
          // languages rather than guess wrong for a family reached cold
          // from an email link.
          <>
            {render("en")}
            <hr className="border-stone/20 my-4" />
            {render("es")}
          </>
        )}
        {justSaved && (
          <p className="text-xs text-rooted-green pt-2">
            {tx("interest.savedNote", locale ?? "en")}
          </p>
        )}
        <Link href="/" className="text-sm text-rooted-green hover:underline block pt-2">
          rootedschool.org
        </Link>
      </div>
    </div>
  );
}
