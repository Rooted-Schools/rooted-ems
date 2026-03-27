import { createServerClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";
import { createEnrollment } from "./enrollment";
import { initializeRegistrationPacket } from "./registration";
import { AuditAction, logAuditEvent } from "@/lib/audit";

// ─── Types ─────────────────────────────────────────────

export interface SendOfferInput {
  application_id: string;
  campus_id: string;
  grade_level_id: string;
  lottery_entry_id?: string;
  expires_at: string; // ISO timestamp
  offered_by: string; // user_id of staff member
}

// ─── Mutations ─────────────────────────────────────────

/**
 * Send a seat offer to an applicant.
 * Transitions application status to "offered".
 */
export async function sendOffer(
  input: SendOfferInput
): Promise<MutationResult<{ id: string }>> {
  const supabase = await createServerClient();

  // Verify application is in an offerable state
  const { data: app } = await supabase
    .from("application")
    .select("status")
    .eq("id", input.application_id)
    .single();

  const offerableStatuses = ["verified", "lottery_assigned", "waitlisted"];
  if (!app || !offerableStatuses.includes(app.status)) {
    return { data: null, error: `Cannot send offer: application is in "${app?.status ?? "unknown"}" status.` };
  }

  // Create the offer record
  const { data: offer, error: offerError } = await supabase
    .from("offer")
    .insert({
      application_id: input.application_id,
      campus_id: input.campus_id,
      grade_level_id: input.grade_level_id,
      lottery_entry_id: input.lottery_entry_id ?? null,
      status: "pending",
      offered_at: new Date().toISOString(),
      expires_at: input.expires_at,
      offered_by: input.offered_by,
    })
    .select("id")
    .single();

  if (offerError) {
    console.error("[sendOffer]", offerError.message);
    return { data: null, error: "Failed to create offer." };
  }

  // Update application status to "offered"
  const { error: statusError } = await supabase
    .from("application")
    .update({ status: "offered", updated_at: new Date().toISOString() })
    .eq("id", input.application_id);

  if (statusError) {
    console.error("[sendOffer] status update", statusError.message);
  }

  await logAuditEvent({
    table_name: "offer",
    record_id: offer.id,
    action: AuditAction.Create,
    actor_id: input.offered_by,
    campus_id: input.campus_id,
    new_data: {
      application_id: input.application_id,
      status: "pending",
      expires_at: input.expires_at,
    },
    metadata: {
      from_status: app.status,
      lottery_entry_id: input.lottery_entry_id ?? null,
    },
  });

  return { data: { id: offer.id }, error: null };
}

/**
 * Accept an offer (called by family or staff on behalf of family).
 * Creates an acceptance record, transitions app status to "accepted",
 * then auto-creates enrollment + registration packet.
 */
export async function acceptOffer(
  offerId: string,
  guardianId: string
): Promise<MutationResult> {
  const supabase = await createServerClient();

  // Get the offer with full application details for enrollment creation
  const { data: offer, error: fetchError } = await supabase
    .from("offer")
    .select("id, application_id, campus_id, grade_level_id, status, expires_at")
    .eq("id", offerId)
    .single();

  if (fetchError || !offer) {
    return { data: null, error: "Offer not found." };
  }

  if (offer.status !== "pending") {
    return { data: null, error: `Offer is ${offer.status}, cannot accept.` };
  }

  // Check if offer has expired
  if (offer.expires_at && new Date(offer.expires_at) < new Date()) {
    return { data: null, error: "This offer has expired and can no longer be accepted." };
  }

  // Update offer status
  const { error: offerUpdateError } = await supabase
    .from("offer")
    .update({
      status: "accepted",
      responded_at: new Date().toISOString(),
    })
    .eq("id", offerId);

  if (offerUpdateError) {
    return { data: null, error: "Failed to update offer." };
  }

  // Create acceptance record
  const { data: acceptance, error: acceptError } = await supabase
    .from("acceptance")
    .insert({
      offer_id: offerId,
      application_id: offer.application_id,
      accepted_by: guardianId,
      accepted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (acceptError) {
    console.error("[acceptOffer] acceptance record", acceptError.message);
    return { data: null, error: "Failed to create acceptance record." };
  }

  // Update application status
  const { error: statusError } = await supabase
    .from("application")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", offer.application_id);

  if (statusError) {
    console.error("[acceptOffer] app status", statusError.message);
  }

  // ── Auto-create enrollment ──────────────────────────────
  // Fetch application for student_id and school_year (via enrollment_window)
  const { data: app } = await supabase
    .from("application")
    .select("student_id, enrollment_window:enrollment_window_id (school_year_id)")
    .eq("id", offer.application_id)
    .single();

  const schoolYearId =
    (app?.enrollment_window as unknown as Record<string, string> | null)?.school_year_id ?? "";

  if (app?.student_id) {
    const enrollResult = await createEnrollment({
      student_id: app.student_id,
      campus_id: offer.campus_id,
      grade_level_id: offer.grade_level_id,
      school_year_id: schoolYearId,
      acceptance_id: acceptance?.id,
      application_id: offer.application_id,
    });

    if (!enrollResult.error && enrollResult.data) {
      // Initialize registration packet for the new enrollment
      await initializeRegistrationPacket({
        enrollment_id: enrollResult.data.id,
        campus_id: offer.campus_id,
        school_year_id: schoolYearId,
      });
    } else if (enrollResult.error) {
      console.error("[acceptOffer] auto-enrollment", enrollResult.error);
    }
  }

  await logAuditEvent({
    table_name: "offer",
    record_id: offerId,
    action: AuditAction.StatusChange,
    actor_id: guardianId,
    campus_id: offer.campus_id,
    old_data: { status: "pending" },
    new_data: { status: "accepted" },
    metadata: {
      application_id: offer.application_id,
      acceptance_id: acceptance?.id ?? null,
    },
  });

  return { data: null, error: null };
}

/**
 * Decline an offer (called by family).
 */
export async function declineOffer(offerId: string, declinedBy?: string): Promise<MutationResult> {
  const supabase = await createServerClient();

  const { data: offer, error: fetchError } = await supabase
    .from("offer")
    .select("id, application_id, campus_id, status")
    .eq("id", offerId)
    .single();

  if (fetchError || !offer) {
    return { data: null, error: "Offer not found." };
  }

  if (offer.status !== "pending") {
    return { data: null, error: `Offer is ${offer.status}, cannot decline.` };
  }

  const { error } = await supabase
    .from("offer")
    .update({
      status: "declined",
      responded_at: new Date().toISOString(),
    })
    .eq("id", offerId);

  if (error) {
    return { data: null, error: "Failed to decline offer." };
  }

  // Update application status
  await supabase
    .from("application")
    .update({ status: "declined", updated_at: new Date().toISOString() })
    .eq("id", offer.application_id);

  await logAuditEvent({
    table_name: "offer",
    record_id: offerId,
    action: AuditAction.StatusChange,
    actor_id: declinedBy ?? null,
    campus_id: offer.campus_id ?? null,
    old_data: { status: "pending" },
    new_data: { status: "declined" },
    metadata: { application_id: offer.application_id },
  });

  return { data: null, error: null };
}

/**
 * Revoke an offer (staff action).
 */
export async function revokeOffer(
  offerId: string,
  revokedBy: string,
  reason?: string
): Promise<MutationResult> {
  const supabase = await createServerClient();

  const { data: offer, error: fetchError } = await supabase
    .from("offer")
    .select("id, application_id, campus_id, status")
    .eq("id", offerId)
    .single();

  if (fetchError || !offer) {
    return { data: null, error: "Offer not found." };
  }

  if (offer.status !== "pending") {
    return { data: null, error: `Offer is ${offer.status}, cannot revoke.` };
  }

  const { error } = await supabase
    .from("offer")
    .update({
      status: "revoked",
      revoked_by: revokedBy,
      revoke_reason: reason ?? null,
      responded_at: new Date().toISOString(),
    })
    .eq("id", offerId);

  if (error) {
    return { data: null, error: "Failed to revoke offer." };
  }

  // Revert application to the status it had before "offered"
  // Look up the most recent status history entry where to_status = 'offered'
  const { data: history } = await supabase
    .from("application_status_history")
    .select("from_status")
    .eq("application_id", offer.application_id)
    .eq("to_status", "offered")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const revertStatus = history?.from_status ?? "verified";

  await supabase
    .from("application")
    .update({ status: revertStatus, updated_at: new Date().toISOString() })
    .eq("id", offer.application_id);

  await logAuditEvent({
    table_name: "offer",
    record_id: offerId,
    action: AuditAction.StatusChange,
    actor_id: revokedBy,
    campus_id: offer.campus_id ?? null,
    old_data: { status: "pending" },
    new_data: { status: "revoked", revoke_reason: reason ?? null },
    metadata: {
      application_id: offer.application_id,
      reverted_app_status: revertStatus,
    },
  });

  return { data: null, error: null };
}

/**
 * Expire an offer (called by cron or manual staff action).
 */
export async function expireOffer(offerId: string): Promise<MutationResult> {
  const supabase = await createServerClient();

  // First check the offer is actually pending before expiring
  const { data: offer, error: fetchError } = await supabase
    .from("offer")
    .select("id, application_id, campus_id, status")
    .eq("id", offerId)
    .single();

  if (fetchError || !offer) {
    return { data: null, error: "Offer not found." };
  }

  if (offer.status !== "pending") {
    return { data: null, error: `Offer is ${offer.status}, cannot expire.` };
  }

  const { error } = await supabase
    .from("offer")
    .update({
      status: "expired",
      responded_at: new Date().toISOString(),
    })
    .eq("id", offerId)
    .eq("status", "pending");

  if (error) {
    return { data: null, error: "Failed to expire offer." };
  }

  // Update application status to expired
  await supabase
    .from("application")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("id", offer.application_id);

  await logAuditEvent({
    table_name: "offer",
    record_id: offerId,
    action: AuditAction.StatusChange,
    actor_id: null, // cron-driven — no human actor
    campus_id: offer.campus_id ?? null,
    old_data: { status: "pending" },
    new_data: { status: "expired" },
    metadata: { application_id: offer.application_id, triggered_by: "cron" },
  });

  return { data: null, error: null };
}
