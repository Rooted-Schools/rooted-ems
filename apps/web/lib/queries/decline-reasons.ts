/**
 * Refusal tracking (playbook PB 24 v2.2 s15).
 *
 * Answers the question the funnel could never answer before: when a family
 * turns down a seat we fought to offer them, why? Every other stage of the
 * funnel tells us THAT we lost someone. This is the only place that tells us
 * what to change.
 *
 * Honesty rules, matching the equity-funnel module:
 *   - "Not captured" is reported as its own bucket, never folded into 'other'.
 *     Those two mean completely different things: one is a family telling us
 *     their reason doesn't fit our list, the other is us failing to ask. A
 *     report that merges them would hide a data-collection problem behind
 *     what looks like a finding.
 *   - Counts are raw. No rate is returned when the denominator is tiny,
 *     because "50% of declines were transportation" over two declines is a
 *     sentence that will get repeated in a board meeting and should not be.
 *   - Reads real `offer` rows only. Nothing imputed.
 */

import { createServiceRoleClient } from "@rooted-ems/database/server";
import {
  DECLINE_REASONS,
  DECLINE_REASON_STAFF_LABEL,
  isDeclineReason,
  type DeclineReason,
} from "@/lib/decline-reasons";

/** Below this many declines, percentages mislead more than they inform. */
export const RATE_SUPPRESSION_THRESHOLD = 10;

/** True when the error says a named column is absent — migration not yet applied, not a missing row. */
function isMissingColumn(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  return /column .* does not exist/i.test(error.message ?? "");
}

let warnedMissingDeclineColumns = false;
function warnMissingDeclineColumns(): void {
  if (warnedMissingDeclineColumns) return;
  warnedMissingDeclineColumns = true;
  console.warn(
    "[getDeclineReasonBreakdown] offer.decline_reason not present — migration 00040_decline_reasons.sql has not been applied. Refusal tracking is hidden until it runs."
  );
}

export interface DeclineReasonRow {
  reason: DeclineReason | "not_captured";
  label: string;
  count: number;
  /** Null when the total is under RATE_SUPPRESSION_THRESHOLD. */
  sharePct: number | null;
}

export interface DeclineReasonBreakdown {
  available: boolean;
  totalDeclines: number;
  /** Declines where nobody recorded a reason. The collection-quality signal. */
  notCaptured: number;
  rows: DeclineReasonRow[];
}

/**
 * Decline reasons for the given campuses, optionally since a date.
 *
 * @param campusIds Already scoped to the caller by the page. Empty means all.
 * @param since ISO date. Omit for all time.
 */
export async function getDeclineReasonBreakdown(
  campusIds: string[] = [],
  since?: string
): Promise<DeclineReasonBreakdown> {
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("offer")
    .select("decline_reason")
    .eq("status", "declined");

  if (campusIds.length > 0) query = query.in("campus_id", campusIds);
  if (since) query = query.gte("responded_at", since);

  const { data, error } = await query;

  if (error) {
    // The page should render without this section rather than 500 when the
    // migration hasn't run yet. Same posture as the melt queries.
    if (isMissingColumn(error)) {
      warnMissingDeclineColumns();
      return { available: false, totalDeclines: 0, notCaptured: 0, rows: [] };
    }
    throw error;
  }

  const rows = (data ?? []) as Array<{ decline_reason: string | null }>;
  const total = rows.length;

  const counts = new Map<DeclineReason | "not_captured", number>();
  for (const reason of DECLINE_REASONS) counts.set(reason, 0);
  counts.set("not_captured", 0);

  for (const row of rows) {
    const key = isDeclineReason(row.decline_reason) ? row.decline_reason : "not_captured";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const suppressed = total < RATE_SUPPRESSION_THRESHOLD;
  const share = (n: number) => (suppressed || total === 0 ? null : Math.round((n / total) * 1000) / 10);

  const reasonRows: DeclineReasonRow[] = DECLINE_REASONS.map((reason) => ({
    reason,
    label: DECLINE_REASON_STAFF_LABEL[reason],
    count: counts.get(reason) ?? 0,
    sharePct: share(counts.get(reason) ?? 0),
  })).sort((a, b) => b.count - a.count);

  const notCaptured = counts.get("not_captured") ?? 0;

  return {
    available: true,
    totalDeclines: total,
    notCaptured,
    // Kept as its own trailing row so it is visible in the UI but never
    // competes with real reasons for the top spot.
    rows: [
      ...reasonRows,
      {
        reason: "not_captured" as const,
        label: "Not captured",
        count: notCaptured,
        sharePct: share(notCaptured),
      },
    ],
  };
}
