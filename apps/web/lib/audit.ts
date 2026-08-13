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
 * ALSO IN THIS FILE: the status-history attribution helpers at the bottom.
 * They belong to the same question — "who did this" — but write to
 * application_status_history rather than audit_event. See the block comment
 * above them for why that column needs application-layer help at all.
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

// ─── Status-history attribution ──────────────────────────────────────────────
//
// application_status_history.changed_by is the column this codebase's own
// comments call the authoritative record of who changed an application's
// status, and the staff Audit Trail renders it. It is written in exactly one
// place: the database trigger fn_track_status_change (00010_rls_triggers.sql),
// which fills it with auth.uid().
//
// Every write in this app goes through the service-role Supabase client, which
// carries no user JWT — so auth.uid() is NULL inside that trigger and
// changed_by is NULL for essentially every real status change in production.
// The Audit Trail then attributes real human enrollment decisions to "System".
//
// The fix is application-layer on purpose. The trigger cannot see the acting
// user, and PostgREST gives no reliable way to set a Postgres session variable
// for it to read. So after a status change is written, the caller stamps the
// acting user onto the history row the trigger just created.
//
// The whole design question is how to be sure the row we stamp is the row our
// own change produced. A wrong name on an enrollment record is worse than an
// honest blank, so the selection is deliberately narrow and every uncertainty
// resolves to "leave it blank":
//
//   1. WATERMARK. The caller reads the newest existing history timestamp for
//      that application BEFORE writing, and only rows created after it are
//      eligible. Both timestamps come from the database clock (created_at
//      DEFAULT NOW()), so no app-server clock skew is involved. If the write
//      turns out not to change the status at all — a no-op update, a status
//      something else already set — no new row exists, nothing is stamped, and
//      an older identical transition is never re-attributed to today's actor.
//      A watermark that cannot be read at all is `known: false`, and no stamp
//      is attempted.
//   2. TRANSITION MATCH. Only a row whose to_status (and, when the caller
//      knows it, from_status) matches the change just made is eligible.
//   3. STILL UNATTRIBUTED. Only rows with changed_by IS NULL are candidates,
//      and the UPDATE repeats that condition, so it is a compare-and-set: a
//      concurrent stamp that got there first wins and this one no-ops rather
//      than overwriting an actor already on the record.
//   4. NO TIE-BREAKING. If two candidate rows share the newest timestamp, the
//      row that belongs to this actor cannot be told from the row that belongs
//      to someone else, so neither is stamped.
//
// Never throws, and never reports failure: a stamp that does not land leaves
// changed_by NULL, which is exactly the state the system is in today.

/** Columns needed to decide whether a history row is the one we just caused. */
export interface StatusHistoryRow {
  id: string;
  created_at: string;
  changed_by: string | null;
  from_status: string | null;
  to_status: string;
}

/**
 * The newest history timestamp for an application before a status change.
 * `known: false` means the read failed — the caller must not stamp, because
 * without the lower bound it cannot tell a row it caused from an old one.
 */
export interface StatusHistoryWatermark {
  known: boolean;
  /** null when the application has no history yet — no lower bound needed. */
  at: string | null;
}

/** How many recent unattributed rows to consider. Ours is the newest of them. */
const STAMP_CANDIDATE_LIMIT = 10;

/**
 * Choose the history row a status change just created, or null when no
 * candidate can be identified with certainty. Pure — the whole attribution
 * rule lives here so it can be tested without a database.
 */
export function pickStampableHistoryRow(
  rows: StatusHistoryRow[],
  criteria: {
    toStatus: string;
    /** Omit (or pass null) when the caller does not know the prior status. */
    fromStatus?: string | null;
    /** Lower bound from the watermark. Rows at or before it are not ours. */
    after: string | null;
  }
): StatusHistoryRow | null {
  const afterMs = criteria.after === null ? null : Date.parse(criteria.after);
  if (afterMs !== null && Number.isNaN(afterMs)) return null;

  const candidates = rows.filter((row) => {
    if (row.changed_by !== null) return false;
    if (row.to_status !== criteria.toStatus) return false;
    if (criteria.fromStatus != null && row.from_status !== criteria.fromStatus) return false;
    const createdMs = Date.parse(row.created_at);
    if (Number.isNaN(createdMs)) return false;
    return afterMs === null || createdMs > afterMs;
  });

  if (candidates.length === 0) return null;

  const newest = candidates.reduce((best, row) =>
    Date.parse(row.created_at) > Date.parse(best.created_at) ? row : best
  );

  // Two rows at the same instant: one of them may belong to someone else, and
  // there is nothing here that says which. Blank beats a guess.
  const tied = candidates.filter(
    (row) => Date.parse(row.created_at) === Date.parse(newest.created_at)
  );
  return tied.length === 1 ? newest : null;
}

/**
 * Reduce history rows to the newest created_at per application. Pure, so the
 * batch watermark used by bulk operations is testable on its own.
 */
export function latestCreatedAtByApplication(
  rows: Array<{ application_id: string; created_at: string }>
): Map<string, string> {
  const latest = new Map<string, string>();
  for (const row of rows) {
    const current = latest.get(row.application_id);
    if (current === undefined || Date.parse(row.created_at) > Date.parse(current)) {
      latest.set(row.application_id, row.created_at);
    }
  }
  return latest;
}

/**
 * Read the watermark for one application. Call this BEFORE the status write.
 */
export async function readStatusHistoryWatermark(
  applicationId: string
): Promise<StatusHistoryWatermark> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("application_status_history")
      .select("created_at")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("[audit] status history watermark failed", error.message, { applicationId });
      return { known: false, at: null };
    }
    const rows = (data ?? []) as Array<{ created_at: string }>;
    return { known: true, at: rows[0]?.created_at ?? null };
  } catch (err) {
    console.error("[audit] status history watermark threw", err);
    return { known: false, at: null };
  }
}

/**
 * Batch form for bulk operations — one query for the whole selection instead
 * of one per item. Applications with no history yet are absent from the map
 * and read as `{ known: true, at: null }`; a failed read makes every id
 * unknown, so a bulk run never stamps on a bound it does not have.
 */
export async function readStatusHistoryWatermarks(
  applicationIds: string[]
): Promise<Map<string, StatusHistoryWatermark>> {
  const result = new Map<string, StatusHistoryWatermark>();
  if (applicationIds.length === 0) return result;

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("application_status_history")
      .select("application_id, created_at")
      .in("application_id", applicationIds);

    if (error) {
      console.error("[audit] status history watermarks failed", error.message);
      for (const id of applicationIds) result.set(id, { known: false, at: null });
      return result;
    }

    const latest = latestCreatedAtByApplication(
      (data ?? []) as Array<{ application_id: string; created_at: string }>
    );
    for (const id of applicationIds) {
      result.set(id, { known: true, at: latest.get(id) ?? null });
    }
    return result;
  } catch (err) {
    console.error("[audit] status history watermarks threw", err);
    for (const id of applicationIds) result.set(id, { known: false, at: null });
    return result;
  }
}

/**
 * Stamp the acting user onto the history row a status change just created.
 * Call this AFTER the status write, with the watermark taken before it.
 *
 * Best-effort by contract: it never throws and never returns a failure, so no
 * caller can be tempted to fail a real status change because the attribution
 * did not land.
 */
export async function stampStatusHistoryActor(input: {
  applicationId: string;
  /** The real acting user. Null (an unauthenticated system path) stamps nothing. */
  actorId: string | null;
  toStatus: string;
  fromStatus?: string | null;
  watermark: StatusHistoryWatermark;
}): Promise<void> {
  if (!input.actorId) return;
  if (!input.watermark.known) return;

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("application_status_history")
      .select("id, created_at, changed_by, from_status, to_status")
      .eq("application_id", input.applicationId)
      .is("changed_by", null)
      .order("created_at", { ascending: false })
      .limit(STAMP_CANDIDATE_LIMIT);

    if (error) {
      console.error("[audit] status history lookup failed", error.message, {
        applicationId: input.applicationId,
      });
      return;
    }

    const row = pickStampableHistoryRow((data ?? []) as StatusHistoryRow[], {
      toStatus: input.toStatus,
      fromStatus: input.fromStatus ?? null,
      after: input.watermark.at,
    });
    if (!row) return;

    const { error: updateError } = await supabase
      .from("application_status_history")
      .update({ changed_by: input.actorId })
      .eq("id", row.id)
      // Compare-and-set: never overwrite an actor another path already wrote.
      .is("changed_by", null);

    if (updateError) {
      console.error("[audit] status history stamp failed", updateError.message, {
        applicationId: input.applicationId,
        historyId: row.id,
      });
    }
  } catch (err) {
    console.error("[audit] status history stamp threw", err);
  }
}
