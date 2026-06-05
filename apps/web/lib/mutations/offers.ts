import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";
import { createEnrollment } from "./enrollment";
import { initializeRegistrationPacket } from "./registration";
import { promoteFromWaitlist } from "./waitlist";
import { AuditAction, logAuditEvent } from "@/lib/audit";
import { notifyFamilyOfOffer, notifyStaffOfferAccepted, notifyStaffOfferDeclined } from "@/lib/notify";
import { requireStaffSession } from "@/lib/auth/get-session";

// ─── Shared helper ─────────────────────────────────────────────────────────

/**
 * After a seat is vacated (offer declined, revoked, or expired) attempt to
 * immediately promote the next eligible waitlist candidate for the same
 * campus + grade.  Called synchronously so the family hears within minutes
 * rather than waiting for the nightly cron job.
 *
 * Failures are logged but never propagated — the primary operation has
 * already succeeded and must not be rolled back over a waitlist issue.
 */
async function promoteNextWaitlistCandidate(
  campusId: string,
  gradeLevelId: string
): Promise<void> {
  const supabase = createServiceRoleClient();

  // Resolve the waitlist for this campus + grade
  const { data: waitlistRows } = await supabase
    .from("waitlist")
    .select("id")
    .eq("campus_id", campusId)
    .eq("grade_level_id", gradeLevelId)
    .limit(1);

  const waitlistId = waitlistRows?.[0]?.id as string | undefined;
  if (!waitlistId) return;

  const { data: posRows } = await supabase
    .from("waitlist_position")
    .select("id")
    .eq("waitlist_id", waitlistId)
    .is("removed_at", null)
    .is("promoted_at", null)
    .order("position_number", { ascending: true })
    .limit(1);

  const nextPositionId = posRows?.[0]?.id as string | undefined;
  if (!nextPositionId) return;

  // Atomically claim this position before promoting — prevents two concurrent
  // callers (e.g. inline decline + nightly cron) from both promoting the same
  // candidate.  Only the process that wins the UPDATE proceeds.
  const { data: claimed, error: claimError } = await supabase
    .from("waitlist_position")
    .update({ promoted_at: new Date().toISOString() })
    .eq("id", nextPositionId)
    .is("promoted_at", null) // only claim if not already promoted
    .select("id")
    .single();

  if (claimError || !claimed) {
    // Another process already claimed this position — skip silently
    return;
  }

  // Give the promoted candidate 7 days to respond
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const result = await promoteFromWaitlist(nextPositionId, "system", expiresAt);
  if (result.error) {
    console.error("[promoteNextWaitlistCandidate]", result.error);
  }
}

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
  await requireStaffSession();
  const supabase = createServiceRoleClient();

  // Verify application is in an offerable state
  const { data: app } = await supabase
    .from("application")
    .select("status")
    .eq("id", input.application_id)
    .single();

  const offerableStatuses = ["verified", "lottery_assigned", "waitlisted", "needs_info", "offered"];
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
    console.error("[sendOffer] application status update", statusError.message);
    return { data: null, error: "Failed to update application status." };
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

  // Alert the family so they know to respond — campus name resolved by helper
  await notifyFamilyOfOffer({
    applicationId: input.application_id,
    offerId: offer.id,
    expiresAt: input.expires_at,
    campusId: input.campus_id,
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
  // Auth check
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  // Ownership check — verify the offer belongs to this user's guardian
  const ownerCheck = createServiceRoleClient();
  const { data: offerCheck } = await ownerCheck
    .from("offer")
    .select("id, application:application_id (guardian:guardian_id (user_id))")
    .eq("id", offerId)
    .single();
  const offerGuardian = (offerCheck?.application as unknown as { guardian: { user_id: string } } | null)?.guardian ?? null;
  if (!offerGuardian || offerGuardian.user_id !== user.id) {
    return { data: null, error: "Not authorized" };
  }

  const supabase = ownerCheck;

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

  if (!schoolYearId) {
    console.error("[acceptOffer] missing schoolYearId for offer", offerId);
    return { data: null, error: "Could not resolve school year. Please contact support." };
  }

  if (app?.student_id) {
    const enrollResult = await createEnrollment({
      student_id: app.student_id,
      campus_id: offer.campus_id,
      grade_level_id: offer.grade_level_id,
      school_year_id: schoolYearId,
      acceptance_id: acceptance?.id,
      application_id: offer.application_id,
    });

    if (enrollResult.error || !enrollResult.data) {
      console.error("[acceptOffer] enrollment creation", enrollResult.error);
      return { data: null, error: "Enrollment creation failed. Please contact support." };
    }

    // Initialize registration packet for the new enrollment
    await initializeRegistrationPacket({
      enrollment_id: enrollResult.data.id,
      campus_id: offer.campus_id,
      school_year_id: schoolYearId,
    });
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

  if (offer.campus_id && offer.application_id) {
    notifyStaffOfferAccepted({
      campusId: offer.campus_id,
      applicationId: offer.application_id,
    }).catch(() => {});
  }

  return { data: null, error: null };
}

/**
 * Decline an offer (called by family).
 */
export async function declineOffer(offerId: string, declinedBy?: string): Promise<MutationResult> {
  // Auth check
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  // Ownership check — verify the offer belongs to this user's guardian
  const ownerCheck = createServiceRoleClient();
  const { data: offerCheck } = await ownerCheck
    .from("offer")
    .select("id, application:application_id (guardian:guardian_id (user_id))")
    .eq("id", offerId)
    .single();
  const offerGuardian = (offerCheck?.application as unknown as { guardian: { user_id: string } } | null)?.guardian ?? null;
  if (!offerGuardian || offerGuardian.user_id !== user.id) {
    return { data: null, error: "Not authorized" };
  }

  const supabase = ownerCheck;

  const { data: offer, error: fetchError } = await supabase
    .from("offer")
    .select("id, application_id, campus_id, grade_level_id, status")
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

  // Seat is now available — immediately promote the next waitlist candidate
  // so families don't wait until the nightly cron to hear the good news.
  if (offer.campus_id && offer.grade_level_id) {
    await promoteNextWaitlistCandidate(offer.campus_id, offer.grade_level_id);
  }

  if (offer.campus_id && offer.application_id) {
    notifyStaffOfferDeclined({
      campusId: offer.campus_id,
      applicationId: offer.application_id,
    }).catch(() => {});
  }

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
  await requireStaffSession();
  const supabase = createServiceRoleClient();

  const { data: offer, error: fetchError } = await supabase
    .from("offer")
    .select("id, application_id, campus_id, grade_level_id, status")
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

  // Seat is now available — immediately promote next waitlist candidate
  if (offer.campus_id && offer.grade_level_id) {
    await promoteNextWaitlistCandidate(offer.campus_id, offer.grade_level_id);
  }

  return { data: null, error: null };
}

/**
 * Expire an offer (called by cron or manual staff action).
 */
export async function expireOffer(offerId: string): Promise<MutationResult> {
  const supabase = createServiceRoleClient();

  // Atomically transition from pending → expired in a single statement.
  // If two cron runs overlap, only one will find status='pending' and win
  // the UPDATE; the other gets no row back and exits cleanly.
  const { data: updatedOffer, error: updateError } = await supabase
    .from("offer")
    .update({
      status: "expired",
      responded_at: new Date().toISOString(),
    })
    .eq("id", offerId)
    .eq("status", "pending") // atomic guard — only succeeds if still pending
    .select("id, application_id, campus_id, grade_level_id")
    .single();

  if (updateError || !updatedOffer) {
    // Either already processed by another runner or doesn't exist — not an error worth propagating
    return { data: null, error: null };
  }

  // Update application status to expired
  await supabase
    .from("application")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("id", updatedOffer.application_id);

  await logAuditEvent({
    table_name: "offer",
    record_id: offerId,
    action: AuditAction.StatusChange,
    actor_id: null, // cron-driven — no human actor
    campus_id: updatedOffer.campus_id ?? null,
    old_data: { status: "pending" },
    new_data: { status: "expired" },
    metadata: { application_id: updatedOffer.application_id, triggered_by: "cron" },
  });

  return { data: null, error: null };
}
