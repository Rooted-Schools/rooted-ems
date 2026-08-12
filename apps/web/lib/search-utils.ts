/**
 * Pure helpers for the global staff search (app/staff/search/actions.ts,
 * components/staff/global-search.tsx). Kept in their own module — not the
 * "use server" actions file itself — because Next.js requires every export
 * of a "use server" file to be an async server action; these are plain
 * synchronous functions, exported here so they're both reusable and directly
 * unit-testable without spinning up a Supabase mock.
 */

/**
 * Escape LIKE metacharacters before a value reaches an `.ilike()` filter.
 * Same rule as lib/mutations/leads.ts's escapeLike / lib/inbound-email.ts's
 * duplicate of it: a literal `%` or `_` typed by staff must not act as a
 * wildcard, and a literal backslash must not escape the following character.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * PostgREST's `.or()` filter string uses commas to separate conditions and
 * parentheses to nest logical groups; a double quote closes a quoted
 * pattern early. A raw comma/paren/quote in a staff-typed search term would
 * otherwise corrupt the filter grammar rather than just fail to match, so
 * strip them before the term is embedded in an `.or()` string (same
 * approach as lib/queries/applications.ts's name-search two-step lookup).
 */
export function sanitizeForOrFilter(value: string): string {
  return value.replace(/[,()"]/g, "");
}

/** Build a `%term%` ILIKE pattern, safe to embed inside a quoted `.or()` clause. */
export function likePattern(term: string): string {
  return `%${escapeLike(sanitizeForOrFilter(term))}%`;
}

/** Strip everything but digits — the raw material for phone-tail matching. */
export function digitsOf(term: string): string {
  return term.replace(/\D/g, "");
}

/**
 * Minimum typed digits before a search term is treated as a phone-number
 * search in addition to a name/email search. Below this, a stray digit in a
 * name ("Mia2000@example.com") shouldn't trigger a full phone scan.
 */
export const MIN_PHONE_SEARCH_DIGITS = 3;

/**
 * True when a search should be scoped to specific campuses. Mirrors the
 * getAccessibleCampusIds contract used everywhere else in the app: an empty
 * array means org-wide access (system_admin with no scoped campus rows),
 * not "no campuses" — so it must NOT be used as an `.in("campus_id", [])`
 * filter, which would return zero rows instead of everything.
 */
export function scopesToCampuses(campusIds: string[]): boolean {
  return campusIds.length > 0;
}

/** Title Case a single lowercase word (e.g. lead stage) for display. */
export function capitalizeWord(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

/** Minimum characters before global search runs at all — matches the UI's honest empty state. */
export const MIN_SEARCH_QUERY_LENGTH = 2;

/** Max results returned per category (Leads / Applicants & Families / Students). */
export const RESULTS_PER_CATEGORY = 8;
