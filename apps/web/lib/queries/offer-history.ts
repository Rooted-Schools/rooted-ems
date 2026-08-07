import { createServiceRoleClient } from "@rooted-ems/database/server";

/**
 * Historical offer accept rates, used as decision support for over-offering on
 * the Seats page (mature enrollment offices deliberately offer more seats than
 * chairs, the way airlines overbook, because 1:1 offers guarantee
 * under-enrollment plus waitlist churn).
 *
 * Honesty notes baked into the shape here:
 *  - Every number comes from real `offer` rows. There is no blended benchmark,
 *    no network default, and no seeded prior. If a campus/grade has never
 *    resolved an offer, it gets `resolved: 0` and the caller must say so.
 *  - `acceptRate` is null when nothing has resolved, so callers cannot silently
 *    treat "no data" as 0% (or as 100%).
 *  - `resolved` is always carried alongside `acceptRate` so the denominator can
 *    be shown wherever the rate is shown.
 *  - Grades are keyed by grade CODE, not grade_level_id. `grade_level` rows are
 *    unique per (campus, school_year, grade), so a grade_level_id only ever
 *    covers one school year. Keying by code is what lets a prior year's real
 *    history inform this year's row, which is the entire point.
 *
 * Service-role read: the Seats page already gates on `requireMinRole` and
 * passes explicitly scoped campus ids.
 */

/** Offer statuses that represent a finished outcome (see offer_status enum, 00001_enums.sql). */
export const RESOLVED_OFFER_STATUSES = ["accepted", "declined", "expired", "revoked"] as const;

export interface OfferAcceptHistoryEntry {
  campus_id: string;
  /** Grade code (e.g. "9"), stable across school years. */
  grade: string;
  /** Offers with a resolved status, across all school years. */
  resolved: number;
  /** Of those, the ones accepted. */
  accepted: number;
  /** accepted / resolved as a 0–1 fraction. Null when nothing has resolved. */
  acceptRate: number | null;
}

/** Keyed by `campusId:grade` — see `offerHistoryKey`. */
export type OfferAcceptHistory = Record<string, OfferAcceptHistoryEntry>;

export function offerHistoryKey(campusId: string, grade: string): string {
  return `${campusId}:${grade}`;
}

const PAGE_SIZE = 1000;

/**
 * Per campus + grade, the real resolved/accepted offer counts across all school
 * years. Pass the already-scoped campus ids; an empty array reads all campuses
 * the caller has resolved access to.
 */
export async function getOfferAcceptHistory(campusIds: string[]): Promise<OfferAcceptHistory> {
  const supabase = createServiceRoleClient();
  const history: OfferAcceptHistory = {};

  for (let page = 0; ; page += 1) {
    let query = supabase
      .from("offer")
      .select("campus_id, status, grade_level:grade_level_id (grade)")
      .in("status", RESOLVED_OFFER_STATUSES as unknown as string[])
      .order("id")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (campusIds.length > 0) {
      query = query.in("campus_id", campusIds);
    }

    const { data, error } = await query;
    if (error || !data) break;

    for (const raw of data as Record<string, unknown>[]) {
      const campusId = raw.campus_id as string | null;
      const gradeLevel = raw.grade_level as Record<string, string> | null;
      const grade = gradeLevel?.grade ?? null;
      if (!campusId || !grade) continue;

      const key = offerHistoryKey(campusId, grade);
      const entry =
        history[key] ??
        (history[key] = { campus_id: campusId, grade, resolved: 0, accepted: 0, acceptRate: null });

      entry.resolved += 1;
      if (raw.status === "accepted") entry.accepted += 1;
    }

    if (data.length < PAGE_SIZE) break;
  }

  for (const entry of Object.values(history)) {
    entry.acceptRate = entry.resolved > 0 ? entry.accepted / entry.resolved : null;
  }

  return history;
}
