/**
 * Pure eligibility predicate for the re-engage-leads cron
 * (app/api/cron/reengage-leads/route.ts).
 *
 * The route already filters these two cases at the Postgrest query level
 * (`.or("next_follow_up_at.is.null,next_follow_up_at.lte.<now>")` and
 * `.or("next_follow_up_reason.is.null,next_follow_up_reason.neq.wrong_number")`)
 * for efficiency — there's no reason to fetch rows the cron will never touch.
 * This function re-checks the same two conditions in plain JS as a second,
 * independently-testable gate applied to whatever the query actually
 * returns, so a future edit to the query (or a PostgREST NULL-semantics
 * mistake like `.not(col, "eq", value)`, which silently drops NULL rows too)
 * can't quietly turn into an automated touch that either overrides a
 * recruiter's promised callback time or re-contacts a number staff already
 * flagged as wrong.
 *
 * Deliberately dependency-free so it's cheap to unit test directly.
 */
export interface ReengagementCandidate {
  next_follow_up_at: string | null;
  next_follow_up_reason: string | null;
}

export function isEligibleForReengagement(
  lead: ReengagementCandidate,
  now: Date = new Date()
): boolean {
  // A human already decided this lead needs a wrong number fixed before
  // anyone (or anything) calls, emails, or texts it again.
  if (lead.next_follow_up_reason === "wrong_number") return false;

  // A future next_follow_up_at is a live promise — a "Call back later" set
  // further out than the quiet window, or any other scheduled touch. The
  // cron only ever claims work that's due now or has no date at all.
  if (lead.next_follow_up_at && new Date(lead.next_follow_up_at).getTime() > now.getTime()) {
    return false;
  }

  return true;
}
