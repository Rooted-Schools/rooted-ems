export const dynamic = "force-dynamic";

import Link from "next/link";
import { headers } from "next/headers";
import { IconCheckCircle, IconHelpCircle } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getLocaleCookie } from "@/lib/i18n/get-locale";
import { tx, type Locale, type TranslationKey } from "@/lib/i18n/translations";
import { INTEREST_FOCUS_OPTIONS, isInterestFocusKey, type InterestFocusKey } from "@/lib/lead-interest-survey";
import { confirmInterestChoice, submitInterestDetails } from "./actions";

export const metadata = { title: "What matters most? — Rooted Schools" };

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
 * `?t=<survey_token>&c=<choice>`. The token is the only capability, no login.
 *
 * IMPORTANT — this GET handler never touches the database and never writes
 * anything. Email security gateways (Microsoft Safe Links, Proofpoint,
 * Barracuda, etc.) routinely prefetch every link in an inbound message,
 * which would silently fabricate a survey answer for a family that never
 * clicked anything if a bare GET could write. Landing here from the email
 * only shows the family which option they picked and asks for one explicit
 * confirmation click, submitted as a real POST (see confirmInterestChoice in
 * ./actions) — that POST is the only thing that ever writes interest_focus.
 * This costs one extra click on a survey whose value depends on low
 * friction; that tradeoff is deliberate — integrity of the field beats
 * response rate. Keep the confirm step to a single, obvious button.
 *
 * Because this page never queries the lead table, it renders byte-for-byte
 * identically whether or not the token maps to a real lead — there is no
 * code path here that could leak whether a given token exists. Do not add
 * one; any existence check belongs (already exists) inside the server
 * action that performs the write, which is silent on an unknown token for
 * the same reason.
 */
export default async function InterestPage({
  searchParams,
}: {
  searchParams: { t?: string; c?: string; confirmed?: string; saved?: string };
}) {
  const token = searchParams?.t;
  const choice = isInterestFocusKey(searchParams?.c) ? searchParams.c : null;
  const confirmed = searchParams?.confirmed === "1";
  const justSaved = searchParams?.saved === "1";

  const cookieLocale = await getLocaleCookie();
  const h = await headers();
  const locale: Locale | undefined = cookieLocale ?? resolveLocaleFromAcceptLanguage(h.get("accept-language"));

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

  /**
   * Landed on directly from the email link: shows which option was picked
   * and asks for one explicit, no-JS-required POST before anything is
   * written. A plain <form action={serverAction}> degrades to a normal HTML
   * form submission with JavaScript disabled — families reading email on
   * locked-down or older devices still get a working confirm button.
   */
  function renderConfirm(loc: Locale) {
    return (
      <>
        <h1 className="text-xl font-bold text-ink">{tx("interest.confirmTitle", loc)}</h1>
        <p className="text-sm text-ink/70">
          {tx("interest.confirmBody", loc)}{" "}
          <span className="font-semibold text-ink">{choice ? tx(OPTION_LABEL_KEYS[choice], loc) : ""}</span>
        </p>
        <form action={confirmInterestChoice} className="pt-2">
          <input type="hidden" name="t" value={token ?? ""} />
          <input type="hidden" name="c" value={choice ?? ""} />
          <Button type="submit" size="lg" className="w-full">
            {tx("interest.confirmButton", loc)}
          </Button>
        </form>
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

  // Three states, gated only on the (client-supplied, validated-against-the-
  // fixed-option-list) `choice` and `confirmed` query params — never on
  // whether the token resolves to anything real:
  //   1. no valid choice yet            -> the picker (renderQuestion)
  //   2. valid choice, not confirmed    -> the one-click confirm screen
  //   3. valid choice, confirmed        -> the thanks screen
  const render = choice ? (confirmed ? renderThanks : renderConfirm) : renderQuestion;
  const showCheck = Boolean(choice) && confirmed;

  return (
    <div className="min-h-screen bg-warm-white flex items-center justify-center px-4 py-10">
      <div className="max-w-md w-full text-center bg-white border border-stone/20 rounded-xl px-6 py-10 space-y-4">
        <div className="flex justify-center text-rooted-green">
          {showCheck ? <IconCheckCircle size={40} /> : <IconHelpCircle size={40} />}
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
