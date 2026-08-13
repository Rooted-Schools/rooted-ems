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
 *
 * ACTOR IDS ARE user_profile IDS. audit_event.actor_id is
 * `REFERENCES user_profile(id)` (00008_comms_misc.sql). Passing anything else
 * — a guardian row id, a student id — violates the foreign key, the insert
 * fails, and because this function never throws the event is lost with only a
 * console line to show for it. Callers acting for a family must resolve
 * guardian.user_id, never guardian.id.
 *
 * METADATA: audit_event has no `metadata` column in the migrations as they
 * stand, so the insert below sends it only until the database says otherwise,
 * then remembers and stops. Anything a reader must be able to see today
 * therefore belongs in old_data / new_data, which the Audit Trail UI reads
 * directly; metadata is supporting context that starts persisting the moment
 * a migration adds the column, with no code change.
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
  /**
   * Any additional context — e.g. { from_status: "preview", to_status: "official" }.
   * Persisted only where the audit_event table has a metadata column; see the
   * note at the top of this file. Never put a fact a reader needs here alone.
   */
  metadata?: Record<string, unknown>;
}

// ─── Metadata column detection ───────────────────────────────────────────────
//
// Same graceful-absence discipline as the lottery governance columns
// (isMissingRelation in lib/queries/lottery-policy.ts): try the richer write,
// fall back on the specific "no such column" codes, and remember the answer so
// the fallback costs one extra round trip per process rather than one per
// event. Any other error is a real failure and is never retried — a retry on,
// say, a foreign-key violation would just write the same broken row twice.

const MISSING_COLUMN_CODES = new Set([
  "PGRST204", // PostgREST: column not found in the schema cache
  "42703", // Postgres: undefined_column
]);

/** null = not yet known, false = column absent, true = column present. */
let metadataColumnPresent: boolean | null = null;

/**
 * True only for a failure caused by the metadata column not existing.
 *
 * Deliberately narrow. The retry below re-inserts the same event, so widening
 * this to "any error" would turn a network timeout that committed anyway into
 * a duplicate audit row — a trail that overstates what happened is as bad as
 * one that understates it. The message check exists because PostgREST reports
 * a schema-cache miss with its own code rather than the Postgres one, and it
 * names the column when it does.
 */
function isMissingMetadataColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code && MISSING_COLUMN_CODES.has(error.code)) return true;
  return /metadata/i.test(error.message ?? "") && /column|schema cache/i.test(error.message ?? "");
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

    const row: Record<string, unknown> = {
      table_name: payload.table_name,
      record_id: payload.record_id,
      action: payload.action,
      actor_id: payload.actor_id,
      campus_id: payload.campus_id,
      old_data: payload.old_data ?? null,
      new_data: payload.new_data ?? null,
      created_at: new Date().toISOString(),
    };

    const tryMetadata = payload.metadata !== undefined && metadataColumnPresent !== false;

    let { error } = await supabase
      .from("audit_event")
      .insert(tryMetadata ? { ...row, metadata: payload.metadata } : row);

    if (error && tryMetadata && isMissingMetadataColumn(error)) {
      // The event itself matters more than its context. Record what the schema
      // can hold and stop paying for the attempt on later writes.
      if (metadataColumnPresent === null) {
        console.warn(
          "[audit] audit_event has no metadata column — events are being written without their metadata. Add the column to keep it."
        );
      }
      metadataColumnPresent = false;
      ({ error } = await supabase.from("audit_event").insert(row));
    } else if (!error && tryMetadata) {
      metadataColumnPresent = true;
    }

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
