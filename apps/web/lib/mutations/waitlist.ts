import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";
import { AuditAction, logAuditEvent } from "@/lib/audit";
import { notifyFamilyOfOffer, notifyWaitlistMovement } from "@/lib/notify";
import { recordWaitlistPositionHistory } from "./waitlist-history";

// ─── Types ─────────────────────────────────────────────

export interface AddToWaitlistInput {
  waitlist_id: string;
  application_id: string;
  position_number: number;
}

// ─── Mutations ─────────────────────────────────────────

/**
 * Add an application to a waitlist at a given position.
 * Updates the application status to "waitlisted".
 */
export async function addToWaitlist(
  input: AddToWaitlistInput
): Promise<MutationResult<{ id: string }>> {
  // Service role on purpose: called only from staff-gated paths (the
  // manual waitlist-add action, and completeLotteryResults which is itself
  // gated behind requireRoleOnCampus). Updates `application` directly, which
  // trips the same latent RLS recursion (application policy -> guardian
  // policy -> application policy) documented in
  // lib/queries/recruitment-intel.ts.
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("waitlist_position")
    .insert({
      waitlist_id: input.waitlist_id,
      application_id: input.application_id,
      position_number: input.position_number,
      added_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("[addToWaitlist]", error.message);
    return { data: null, error: "Failed to add to waitlist." };
  }

  // Update application status
  await supabase
    .from("application")
    .update({ status: "waitlisted", updated_at: new Date().toISOString() })
    .eq("id", input.application_id);

  // Fetch campus_id from the waitlist record for the audit event
  const { data: wl } = await supabase
    .from("waitlist")
    .select("campus_id")
    .eq("id", input.waitlist_id)
    .single();

  await logAuditEvent({
    table_name: "waitlist_position",
    record_id: data.id,
    action: AuditAction.Create,
    actor_id: null,
    campus_id: (wl?.campus_id as string) ?? null,
    new_data: {
      waitlist_id: input.waitlist_id,
      application_id: input.application_id,
      position_number: input.position_number,
    },
  });

  // First entry in this family's history ledger — the honest starting point
  // for any later "moved up from N" comparison.
  await recordWaitlistPositionHistory({
    waitlistPositionId: data.id,
    applicationId: input.application_id,
    positionNumber: input.position_number,
    changeType: "initial",
  });

  return { data: { id: data.id }, error: null };
}

/**
 * Promote a student from the waitlist — removes them and creates an offer.
 * This is the most common (and most consequential) waitlist action.
 *
 * Service role, not the user-scoped client: the auto-promotion path is the
 * expire-offers cron (app/api/cron/expire-offers/route.ts), which carries no
 * session cookies. Under RLS a user-scoped client sees zero rows there, so
 * every automatic promotion silently found "no waitlist position" and did
 * nothing. Callers are already gated — staff actions behind
 * requireStaffSession, the cron behind CRON_SECRET.
 *
 * `offeredBy` is a user id written to offer.offered_by (a UUID column).
 * Callers with no real user behind them (the cron) must pass null; a
 * sentinel string like "system" is not a UUID and fails the insert.
 */
export async function promoteFromWaitlist(
  waitlistPositionId: string,
  offeredBy: string | null,
  expiresAt: string
): Promise<MutationResult<{ offer_id: string }>> {
  const supabase = createServiceRoleClient();

  // Get the waitlist position with related data
  const { data: position, error: fetchError } = await supabase
    .from("waitlist_position")
    .select(`
      id, application_id, waitlist_id, position_number,
      waitlist:waitlist_id (campus_id, grade_level_id)
    `)
    .eq("id", waitlistPositionId)
    .is("removed_at", null)
    .single();

  if (fetchError || !position) {
    return { data: null, error: "Waitlist position not found." };
  }

  const pos = position as unknown as Record<string, unknown>;
  const wl = pos.waitlist as unknown as Record<string, string> | null;

  if (!wl) {
    return { data: null, error: "Waitlist data not found." };
  }

  // Mark position as promoted
  const { error: updateError } = await supabase
    .from("waitlist_position")
    .update({
      promoted_at: new Date().toISOString(),
      removed_at: new Date().toISOString(),
      removal_reason: "promoted",
    })
    .eq("id", waitlistPositionId);

  if (updateError) {
    return { data: null, error: "Failed to update waitlist position." };
  }

  // Record the promotion in the history ledger — this row's own change.
  // (Everyone BEHIND this position who effectively moved up gets their own
  // "recalculated" row from notifyWaitlistMovement below.)
  await recordWaitlistPositionHistory({
    waitlistPositionId: waitlistPositionId,
    applicationId: pos.application_id as string,
    positionNumber: pos.position_number as number,
    changeType: "promoted",
    reason: "Promoted to a seat offer",
  });

  // Create an offer for this student
  const { data: offer, error: offerError } = await supabase
    .from("offer")
    .insert({
      application_id: pos.application_id as string,
      campus_id: wl.campus_id,
      grade_level_id: wl.grade_level_id,
      status: "pending",
      offered_at: new Date().toISOString(),
      expires_at: expiresAt,
      offered_by: offeredBy ?? null,
    })
    .select("id")
    .single();

  if (offerError) {
    console.error("[promoteFromWaitlist] offer", offerError.message);
    return { data: null, error: "Failed to create offer." };
  }

  // Update application status to offered
  await supabase
    .from("application")
    .update({ status: "offered", updated_at: new Date().toISOString() })
    .eq("id", pos.application_id as string);

  await logAuditEvent({
    table_name: "waitlist_position",
    record_id: waitlistPositionId,
    action: AuditAction.StatusChange,
    actor_id: offeredBy ?? null,
    campus_id: wl.campus_id,
    old_data: { status: "active" },
    new_data: { removal_reason: "promoted" },
    metadata: {
      application_id: pos.application_id,
      offer_id: offer.id,
      expires_at: expiresAt,
    },
  });

  // Notify the family immediately — they may have been waiting weeks.
  // Guarded: a notification failure must never roll back the promotion.
  await notifyFamilyOfOffer({
    applicationId: pos.application_id as string,
    offerId: offer.id,
    expiresAt,
    campusId: wl.campus_id,
    viaWaitlist: true,
  }).catch((err) => console.error("[promoteFromWaitlist] notify failed", err));

  // Everyone behind the promoted student just moved up one place.
  await notifyWaitlistMovement({
    waitlistId: pos.waitlist_id as string,
    removedPositionNumber: pos.position_number as number,
    campusId: wl.campus_id,
  }).catch((err) => console.error("[promoteFromWaitlist] movement notify failed", err));

  return { data: { offer_id: offer.id }, error: null };
}

/**
 * Remove a student from the waitlist (withdrawn, no longer interested, etc.)
 */
export async function removeFromWaitlist(
  waitlistPositionId: string,
  reason: string,
  removedBy?: string
): Promise<MutationResult> {
  // Service role on purpose: called only from staff-gated paths
  // (requireStaffSession / requireRoleOnCampus in the calling actions).
  // Updates `application` directly, which trips the same latent RLS
  // recursion (application policy -> guardian policy -> application policy)
  // documented in lib/queries/recruitment-intel.ts.
  const supabase = createServiceRoleClient();

  // Fetch position to get the application_id and campus before removing
  const { data: position } = await supabase
    .from("waitlist_position")
    .select("application_id, waitlist_id, position_number, waitlist:waitlist_id (campus_id)")
    .eq("id", waitlistPositionId)
    .is("removed_at", null)
    .single();

  const { error } = await supabase
    .from("waitlist_position")
    .update({
      removed_at: new Date().toISOString(),
      removal_reason: reason,
    })
    .eq("id", waitlistPositionId)
    .is("removed_at", null);

  if (error) {
    return { data: null, error: "Failed to remove from waitlist." };
  }

  // Update application status to withdrawn since student was removed from waitlist
  if (position?.application_id) {
    await supabase
      .from("application")
      .update({ status: "withdrawn", updated_at: new Date().toISOString() })
      .eq("id", position.application_id);
  }

  const campusId =
    (position?.waitlist as unknown as Record<string, string> | null)?.campus_id ?? null;

  // Record the removal in this row's own history — before the "everyone
  // behind moved up" recalculation rows below.
  if (position?.application_id && position?.position_number != null) {
    await recordWaitlistPositionHistory({
      waitlistPositionId: waitlistPositionId,
      applicationId: position.application_id as string,
      positionNumber: position.position_number as number,
      changeType: "removed",
      reason,
    });
  }

  await logAuditEvent({
    table_name: "waitlist_position",
    record_id: waitlistPositionId,
    action: AuditAction.StatusChange,
    actor_id: removedBy ?? null,
    campus_id: campusId,
    old_data: { status: "active" },
    new_data: { removal_reason: reason },
    metadata: { application_id: position?.application_id ?? null },
  });

  // Everyone behind the removed student just moved up one place.
  if (position?.waitlist_id && position?.position_number != null) {
    await notifyWaitlistMovement({
      waitlistId: position.waitlist_id as string,
      removedPositionNumber: position.position_number as number,
      campusId: campusId ?? undefined,
    }).catch((err) => console.error("[removeFromWaitlist] movement notify failed", err));
  }

  return { data: null, error: null };
}

/**
 * Ensure a waitlist record exists for a campus/grade/school_year.
 * Returns the waitlist ID (creates if needed).
 */
export async function ensureWaitlist(
  campusId: string,
  gradeLevelId: string,
  schoolYearId: string,
  enrollmentWindowId: string
): Promise<MutationResult<{ id: string }>> {
  const supabase = await createServerClient();

  // Try to find existing
  const { data: existing } = await supabase
    .from("waitlist")
    .select("id")
    .eq("campus_id", campusId)
    .eq("grade_level_id", gradeLevelId)
    .eq("school_year_id", schoolYearId)
    .single();

  if (existing) {
    return { data: { id: existing.id }, error: null };
  }

  // Create new
  const { data, error } = await supabase
    .from("waitlist")
    .insert({
      campus_id: campusId,
      grade_level_id: gradeLevelId,
      school_year_id: schoolYearId,
      enrollment_window_id: enrollmentWindowId,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    return { data: null, error: "Failed to create waitlist." };
  }

  return { data: { id: data.id }, error: null };
}
