/**
 * One-question lead interest survey: a family answers "what matters most to
 * you?" from a link in the first nurture email (public landing page at
 * app/(public)/interest), so later campaign/journey sends can be personalised
 * by what they actually care about.
 *
 * This is the single source of truth for the five allowed answers — the
 * option keys here are exactly the values the `interest_focus` CHECK
 * constraint on `lead` allows (supabase/migrations/00067_lead_interest_survey.sql).
 * A drift between the two would silently reject writes with a mismatched
 * choice; lib/__tests__/lead-interest-survey.test.ts reads the migration file
 * directly and asserts the two lists stay identical, so a change to either
 * side without the other fails CI rather than failing quietly in production.
 *
 * Deliberately dependency-free (no Supabase client, no next/headers) so it
 * can be imported by the public survey page, the campaign email template,
 * and the staff recruitment table/detail views alike — see
 * lib/lead-call-outcomes.ts for the same pattern.
 */

export const INTEREST_FOCUS_OPTIONS = [
  {
    key: "career_connected",
    label: "Career-connected learning woven throughout their education",
  },
  {
    key: "hbcu_authorized",
    label: "Being the first public charter school in the country authorized by an HBCU",
  },
  {
    key: "career_majors",
    label: "Majors in Healthcare, Information Technology, and Advanced Manufacturing",
  },
  {
    key: "financial_literacy",
    label: "Financial literacy and wealth-building woven throughout the curriculum",
  },
  { key: "other", label: "Something else" },
] as const;

export type InterestFocusKey = (typeof INTEREST_FOCUS_OPTIONS)[number]["key"];

/** key → label, for staff surfaces (lead detail, recruitment table filter). */
export const INTEREST_FOCUS_LABELS: Record<InterestFocusKey, string> = Object.fromEntries(
  INTEREST_FOCUS_OPTIONS.map((o) => [o.key, o.label])
) as Record<InterestFocusKey, string>;

/** Type guard: is `value` one of the five allowed interest_focus keys? Used
 *  both to validate the `c` query param on the public survey page (an
 *  unknown or missing value must not be written) and, symmetrically, to
 *  render a safe label for whatever a lead's stored value happens to be. */
export function isInterestFocusKey(value: string | null | undefined): value is InterestFocusKey {
  return INTEREST_FOCUS_OPTIONS.some((o) => o.key === value);
}

/**
 * Family-facing stand-in for the scholar's name when none is on file. Only 9
 * of 1,316 C.R. Neal leads had a scholar first name at import time (the
 * source never captured it), so the survey email and landing page must read
 * naturally without one — never an empty bracket or the literal word
 * "undefined". Trims first so a stray blank string behaves the same as a
 * missing name.
 */
export function scholarReference(studentFirstName?: string | null): string {
  const trimmed = studentFirstName?.trim();
  return trimmed ? trimmed : "your scholar";
}
