/**
 * Waitlist Position History Logger
 *
 * Writes to the `waitlist_position_history` table (supabase/migrations/
 * 00034_waitlist_position_history.sql) every time a waitlist_position's
 * effective standing changes: initial placement, promotion, removal, or a
 * recalculation triggered by someone else ahead on the same waitlist leaving
 * it. This is what lets the family portal show REAL movement ("Moved up
 * from 7 to 4 on May 3") instead of inferring a prior position that was
 * never actually recorded — see lib/queries/family.ts (getWaitlistHistory)
 * and the family-facing waitlist displays that gate on row count.
 *
 * IMPORTANT: recordWaitlistPositionHistory never throws.
 *   A history-write failure must NEVER block or roll back the waitlist
 *   mutation that triggered it — mirrors the contract of lib/audit.ts's
 *   logAuditEvent exactly. Best-effort inline logging; console.error on
 *   failure for monitoring.
 *
 * Lives in its own module (not lib/mutations/waitlist.ts or lib/notify.ts)
 * so both can import it without introducing a circular dependency — waitlist.ts
 * already imports notifyWaitlistMovement from notify.ts, so notify.ts cannot
 * import back from waitlist.ts.
 */

import { createServiceRoleClient } from "@rooted-ems/database/server";

// ─── Types ─────────────────────────────────────────────

/**
 * 'initial'          — row created (addToWaitlist)
 * 'promoted'         — this row's family was promoted off the waitlist to an offer
 * 'removed'          — this row's family was removed (withdrawn, no longer interested)
 * 'recalculated'     — this row's effective rank improved because another
 *                       family ahead of it was promoted or removed
 * 'manual_adjustment'— reserved for a future staff-initiated reorder; no
 *                       mutation writes this yet
 *
 * The column itself is TEXT, not an enum, so this list can grow without a
 * migration — but keep new values documented here.
 */
export type WaitlistPositionChangeType =
  | "initial"
  | "promoted"
  | "removed"
  | "recalculated"
  | "manual_adjustment";

export interface RecordWaitlistPositionHistoryInput {
  waitlistPositionId: string;
  applicationId: string;
  /** The effective position at the moment of this change. */
  positionNumber: number;
  changeType: WaitlistPositionChangeType;
  reason?: string | null;
}

// ─── Logger ────────────────────────────────────────────

/**
 * Append one row to waitlist_position_history. Best-effort — never throws.
 * Uses the service-role client: the surrounding mutation may be running
 * under a family session (e.g. none today, but future-proof) or a staff
 * session, and history must be recorded either way.
 */
export async function recordWaitlistPositionHistory(
  input: RecordWaitlistPositionHistoryInput
): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("waitlist_position_history").insert({
      waitlist_position_id: input.waitlistPositionId,
      application_id: input.applicationId,
      position_number: input.positionNumber,
      change_type: input.changeType,
      reason: input.reason ?? null,
    });

    if (error) {
      console.error("[recordWaitlistPositionHistory]", error.message, {
        waitlistPositionId: input.waitlistPositionId,
        changeType: input.changeType,
      });
    }
  } catch (err) {
    console.error("[recordWaitlistPositionHistory] unexpected", err);
  }
}
