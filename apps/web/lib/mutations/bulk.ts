import { createServiceRoleClient } from "@rooted-ems/database/server";
import { isValidTransition, type ApplicationStatusValue } from "@rooted-ems/utils";
import { AuditAction, logAuditEvent } from "@/lib/audit";
import { requireStaffSession } from "@/lib/auth/get-session";
import { sendOffer } from "./offers";
import {
  notifyFamilyApplicationVerified,
  notifyFamilyNeedsInfo,
  notifyFamilyApplicationWaitlisted,
} from "@/lib/notify";

// ─── Types ─────────────────────────────────────────────

/** Outcome of one item inside a bulk operation. */
export interface BulkItemResult {
  id: string;
  ok: boolean;
  /** Present when ok is false — explains why this item was skipped or failed. */
  error?: string;
}

/**
 * Hard cap on bulk batch size. The staff applications page loads at most 500
 * rows, so a legitimate "select all" can never exceed this.
 */
export const MAX_BULK_ITEMS = 500;

function dedupeAndValidateIds(applicationIds: string[]): string[] {
  const ids = [...new Set(applicationIds)].filter(
    (id) => typeof id === "string" && id.length > 0
  );
  if (ids.length === 0) {
    throw new Error("No applications selected.");
  }
  if (ids.length > MAX_BULK_ITEMS) {
    throw new Error(`Bulk operations are limited to ${MAX_BULK_ITEMS} items.`);
  }
  return ids;
}

// ─── Bulk Status Change ────────────────────────────────

/**
 * Change the status of many applications at once. Staff only.
 *
 * Semantics (mirrors updateApplicationStatus, applied per item):
 *   - The state machine is validated per item — items whose current status
 *     cannot legally transition to `newStatus` are SKIPPED and reported,
 *     never forced.
 *   - Items are processed sequentially; one failure never aborts the rest.
 *   - An audit_event row is written per successfully changed item, same
 *     shape as the single-item action.
 *   - Family notifications fire per item (fire-and-forget), matching the
 *     single-item behavior for verified / needs_info / waitlisted.
 */
export async function bulkChangeApplicationStatus(
  applicationIds: string[],
  newStatus: string,
  reason?: string
): Promise<BulkItemResult[]> {
  const session = await requireStaffSession();
  const ids = dedupeAndValidateIds(applicationIds);
  const supabase = createServiceRoleClient();

  const results: BulkItemResult[] = [];

  for (const applicationId of ids) {
    try {
      const { data: app } = await supabase
        .from("application")
        .select("id, status, campus_id")
        .eq("id", applicationId)
        .single();

      if (!app) {
        results.push({ id: applicationId, ok: false, error: "Application not found" });
        continue;
      }

      // ── State machine validation — skip, never force ──────────────────────
      const transition = isValidTransition(
        app.status as ApplicationStatusValue,
        newStatus as ApplicationStatusValue
      );
      if (!transition.allowed) {
        results.push({
          id: applicationId,
          ok: false,
          error: transition.reason ?? "Invalid status transition",
        });
        continue;
      }

      // ── Update payload — same shape as updateApplicationStatus ────────────
      const now = new Date().toISOString();
      const updates: Record<string, unknown> = {
        status: newStatus,
        updated_at: now,
      };
      if (newStatus === "verified" || newStatus === "needs_info") {
        updates.reviewed_by = session.user_id;
        updates.reviewed_at = now;
        if (reason) updates.review_notes = reason;
      }

      const { error } = await supabase
        .from("application")
        .update(updates)
        .eq("id", applicationId);

      if (error) {
        console.error("[bulkChangeApplicationStatus]", applicationId, error.message);
        results.push({ id: applicationId, ok: false, error: "Failed to update status" });
        continue;
      }

      // ── Audit log per item — same shape as the single-item action ─────────
      await logAuditEvent({
        table_name: "application",
        record_id: applicationId,
        action: AuditAction.StatusChange,
        actor_id: session.user_id,
        campus_id: (app.campus_id as string) ?? null,
        old_data: { status: app.status },
        new_data: { status: newStatus },
        metadata: { bulk: true, ...(reason ? { reason } : {}) },
      });

      // ── Family notification per item — fire and forget ────────────────────
      const campusId = app.campus_id as string | undefined;
      if (newStatus === "verified") {
        notifyFamilyApplicationVerified({ applicationId, campusId }).catch(() => {});
      } else if (newStatus === "needs_info") {
        notifyFamilyNeedsInfo({
          applicationId,
          applicationIdForLink: applicationId,
          message: reason,
          campusId,
        }).catch(() => {});
      } else if (newStatus === "waitlisted") {
        notifyFamilyApplicationWaitlisted({ applicationId, campusId }).catch(() => {});
      }

      results.push({ id: applicationId, ok: true });
    } catch (err) {
      // A single bad row must never abort the remaining items.
      console.error("[bulkChangeApplicationStatus] unexpected", applicationId, err);
      results.push({ id: applicationId, ok: false, error: "Unexpected error" });
    }
  }

  return results;
}

// ─── Bulk Send Offers ──────────────────────────────────

/**
 * Send seat offers to many applications at once. Staff only.
 *
 * Per item:
 *   - Fetches campus/grade server-side (never trusts client placement data).
 *   - Pre-checks for an existing pending offer and skips with a friendly
 *     message — the production unique index on pending offers would reject
 *     the insert anyway, this just reports it cleanly. The index remains the
 *     backstop for races.
 *   - Delegates to the existing sendOffer mutation (status validation,
 *     offer insert, audit event, family notification all reused).
 *   - Sequential; one failure never aborts the rest.
 */
export async function bulkSendOffers(
  applicationIds: string[],
  expiresAt: string
): Promise<BulkItemResult[]> {
  const session = await requireStaffSession();
  const ids = dedupeAndValidateIds(applicationIds);

  if (!expiresAt || Number.isNaN(new Date(expiresAt).getTime())) {
    throw new Error("A valid offer expiration date is required.");
  }

  const supabase = createServiceRoleClient();
  const results: BulkItemResult[] = [];

  for (const applicationId of ids) {
    try {
      const { data: app } = await supabase
        .from("application")
        .select("id, status, campus_id, grade_level_id")
        .eq("id", applicationId)
        .single();

      if (!app) {
        results.push({ id: applicationId, ok: false, error: "Application not found" });
        continue;
      }

      // Pre-check: the prod unique index forbids a second pending offer.
      // Detect it up front so the row is reported as skipped, not errored.
      const { data: existingOffer } = await supabase
        .from("offer")
        .select("id")
        .eq("application_id", applicationId)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle();

      if (existingOffer) {
        results.push({
          id: applicationId,
          ok: false,
          error: "already has a pending offer",
        });
        continue;
      }

      const result = await sendOffer({
        application_id: applicationId,
        campus_id: app.campus_id as string,
        grade_level_id: app.grade_level_id as string,
        expires_at: expiresAt,
        offered_by: session.user_id,
      });

      if (result.error) {
        results.push({ id: applicationId, ok: false, error: result.error });
      } else {
        results.push({ id: applicationId, ok: true });
      }
    } catch (err) {
      console.error("[bulkSendOffers] unexpected", applicationId, err);
      results.push({ id: applicationId, ok: false, error: "Unexpected error" });
    }
  }

  return results;
}
