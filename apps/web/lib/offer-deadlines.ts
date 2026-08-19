/**
 * Offer response deadlines, resolved from the campus's adopted lottery policy.
 *
 * A deadline is a promise made to a family, and the board is the only body that
 * gets to set it. Every path that creates an offer must read the same adopted
 * policy: the acceptance window for a lottery or direct offer, the waitlist
 * offer window for a promotion off the waitlist. Hardcoded 7-day and 14-day
 * constants scattered across crons and staff actions gave families different
 * deadlines from the ones their school adopted and told them about.
 *
 * The fallbacks below apply ONLY when a campus has no adopted policy at all,
 * and they log that they are being used rather than substituting silently.
 */

import { createServiceRoleClient } from "@rooted-ems/database/server";
import { getAdoptedPolicyForCampus } from "@/lib/queries/lottery-policy";
import { acceptanceExpiryFrom, waitlistOfferExpiryFrom } from "@/lib/lottery-policy";

/** Used only where a campus has no adopted policy. Matches prior behavior. */
export const FALLBACK_WAITLIST_OFFER_DAYS = 7;
export const FALLBACK_ACCEPTANCE_DAYS = 14;

function daysFrom(days: number, from: Date): string {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * The campus IANA timezone (campus.timezone), or null when the campus row has
 * no timezone or cannot be read. The policy cutoff time is a wall clock in this
 * zone, so it must reach the expiry math for "4:00 PM on day N" to mean the
 * family's 4:00 PM and not the server's. A read failure is logged, never
 * thrown — a deadline still resolves (to the end-of-window instant) rather than
 * blocking an offer.
 */
export async function getCampusTimezone(
  campusId: string | null | undefined
): Promise<string | null> {
  if (!campusId) return null;
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("campus")
    .select("timezone")
    .eq("id", campusId)
    .single();
  if (error) {
    console.warn("[getCampusTimezone] could not read campus timezone", {
      campusId,
      error: error.message,
    });
    return null;
  }
  return (data as { timezone: string | null } | null)?.timezone ?? null;
}

/**
 * Response deadline for an offer created by a waitlist promotion.
 * Under the RSV policy this is a two-day window, not a week.
 */
export async function resolveWaitlistOfferExpiry(
  campusId: string | null | undefined,
  from: Date = new Date()
): Promise<string> {
  if (!campusId) {
    console.warn(
      "[resolveWaitlistOfferExpiry] no campus id — falling back to a %d day response window",
      FALLBACK_WAITLIST_OFFER_DAYS
    );
    return daysFrom(FALLBACK_WAITLIST_OFFER_DAYS, from);
  }
  const [adopted, timezone] = await Promise.all([
    getAdoptedPolicyForCampus(campusId),
    getCampusTimezone(campusId),
  ]);
  if (!adopted) {
    console.warn(
      "[resolveWaitlistOfferExpiry] no adopted lottery policy for campus — falling back to a %d day response window",
      FALLBACK_WAITLIST_OFFER_DAYS,
      { campusId }
    );
    return daysFrom(FALLBACK_WAITLIST_OFFER_DAYS, from);
  }
  return waitlistOfferExpiryFrom(adopted.config, from, timezone);
}

/**
 * Response deadline for a seat offer made off the lottery or directly by staff.
 */
export async function resolveAcceptanceExpiry(
  campusId: string | null | undefined,
  from: Date = new Date()
): Promise<string> {
  if (!campusId) {
    console.warn(
      "[resolveAcceptanceExpiry] no campus id — falling back to a %d day acceptance window",
      FALLBACK_ACCEPTANCE_DAYS
    );
    return daysFrom(FALLBACK_ACCEPTANCE_DAYS, from);
  }
  const [adopted, timezone] = await Promise.all([
    getAdoptedPolicyForCampus(campusId),
    getCampusTimezone(campusId),
  ]);
  if (!adopted) {
    console.warn(
      "[resolveAcceptanceExpiry] no adopted lottery policy for campus — falling back to a %d day acceptance window",
      FALLBACK_ACCEPTANCE_DAYS,
      { campusId }
    );
    return daysFrom(FALLBACK_ACCEPTANCE_DAYS, from);
  }
  return acceptanceExpiryFrom(adopted.config, from, timezone);
}
