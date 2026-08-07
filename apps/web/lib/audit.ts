/**
 * Audit Event Logger
 *
 * Writes to the audit_event table for any sensitive action in the system.
 * The audit_event table has an INSERT-only RLS policy — events can never
 * be modified or deleted once written.
 *
 * WHAT TO AUDIT:
 *   - Lottery run status changes (preview, official, archived)
 *   - Offer created, accepted, declined, expired, revoked
 *   - Waitlist promotions
 *   - Enrollment created, withdrawn
 *   - Document approved or rejected
 *   - Application status changes (also tracked by DB trigger, belt-and-suspenders)
 *
 * IMPORTANT: logAuditEvent never throws.
 *   An audit write failure must NEVER block the main operation.
 *   Audit failures are logged to the console for monitoring, but the calling
 *   mutation continues and returns success to the user.
 *
 *   If audit reliability becomes critical, switch to a background queue.
 *   For now, best-effort inline logging is the right tradeoff.
 *
 * CLIENT: service role, deliberately. The anon/cookie client carries no
 * session in a cron or webhook context, so the INSERT policy rejected the
 * write and the event vanished — silently, because this function never
 * throws. Cron-driven deletions are exactly the actions the trail exists for.
 * actor_id is always supplied by the caller, so nothing about who acted is
 * inferred from the client.
 */

import { createServiceRoleClient } from "@rooted-ems/database/server";
import { AuditAction } from "@rooted-ems/types";

// Re-export AuditAction for convenience — callers import from here
export { AuditAction };

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuditEventPayload {
  /** The database table being acted on, e.g. "lottery_run", "offer", "enrollment" */
  table_name: string;
  /** The primary key of the record being acted on */
  record_id: string | null;
  /** The type of action — create, update, delete, status_change, export */
  action: AuditAction;
  /** The user performing the action (from auth.uid()) */
  actor_id: string | null;
  /** The campus this action is scoped to (for access filtering in the audit trail) */
  campus_id: string | null;
  /** The record's data before the change. Include for update/delete actions. */
  old_data?: unknown;
  /** The record's data after the change. Include for create/update actions. */
  new_data?: unknown;
  /** Any additional context — e.g. { from_status: "preview", to_status: "official" } */
  metadata?: Record<string, unknown>;
}

// ─── Logger ──────────────────────────────────────────────────────────────────

/**
 * Write an audit event. Best-effort — never throws.
 *
 * @example
 *   await logAuditEvent({
 *     table_name: "lottery_run",
 *     record_id: runId,
 *     action: AuditAction.StatusChange,
 *     actor_id: user.id,
 *     campus_id: run.campus_id,
 *     old_data: { status: "preview" },
 *     new_data: { status: "official" },
 *     metadata: { run_number: run.run_number },
 *   });
 */
export async function logAuditEvent(payload: AuditEventPayload): Promise<void> {
  try {
    const supabase = createServiceRoleClient();

    const { error } = await supabase.from("audit_event").insert({
      table_name: payload.table_name,
      record_id: payload.record_id,
      action: payload.action,
      actor_id: payload.actor_id,
      campus_id: payload.campus_id,
      old_data: payload.old_data ?? null,
      new_data: payload.new_data ?? null,
      created_at: new Date().toISOString(),
    });

    if (error) {
      // Log but do not throw — audit failures must not block operations
      console.error("[audit] Write failed", {
        table: payload.table_name,
        action: payload.action,
        record_id: payload.record_id,
        error: error.message,
      });
    }
  } catch (err) {
    // Catch any unexpected errors (network, client init failure, etc.)
    console.error("[audit] Unexpected error", {
      table: payload.table_name,
      action: payload.action,
      record_id: payload.record_id,
      err,
    });
  }
}
