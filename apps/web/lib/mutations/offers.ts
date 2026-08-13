import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";
import { createEnrollment } from "./enrollment";
import { initializeRegistrationPacket } from "./registration";
import { promoteNextWaitlistCandidate } from "./waitlist";
import { AuditAction, logAuditEvent } from "@/lib/audit";
import type { DeclineReason } from "@/lib/decline-reasons";
import { notifyFamilyOfOffer, notifyStaffOfferAccepted, notifyStaffOfferDeclined } from "@/lib/notify";
import { requireStaffSession } from "@/lib/auth/get-session";

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

export interface OfferActorOptions {
  /**
   * The staff member acting on a family's behalf. Set ONLY by the staff server
   * actions in app/staff/offers/actions.ts, after requireRoleOnCampus has
   * gated the offer's real campus. Its presence switches off the family
   * ownership check, which a staff user can never satisfy — that check is why
   * accept-on-behalf and decline-on-behalf failed for every staff member.
   *
   * It never changes WHO is recorded as accepting: acceptance.accepted_by is
   * always the guardian on the offer. It only records who did the clicking.
   */
  actingStaffUserId?: string;
}

/** The guardian attached to an offer, read from the offer itself. */
interface OfferGuardian {
  id: string;
  user_id: string | null;
}

async function getOfferGuardian(
  supabase: ReturnType<typeof createServiceRoleClient>,
  offerId: string
): Promise<OfferGuardian | null> {
  const { data } = await supabase
    .from("offer")
    .select("id, application:application_id (guardian:guardian_id (id, user_id))")
    .eq("id", offerId)
    .single();
  const guardian =
    (data?.application as unknown as { guardian: OfferGuardian | null } | null)?.guardian ?? null;
  return guardian?.id ? guardian : null;
}

/**
 * Accept an offer (called by family or staff on behalf of family).
 * Creates an acceptance record, transitions app status to "accepted",
 * then auto-creates enrollment + registration packet.
 *
 * `guardianId` is accepted for signature compatibility and is IGNORED. The
 * guardian recorded on the acceptance is derived from the offer itself, so a
 * client cannot name someone else as the person who accepted a seat.
 */
export async function acceptOffer(
  offerId: string,
  guardianId?: string,
  options?: OfferActorOptions
): Promise<MutationResult> {
  const ownerCheck = createServiceRoleClient();

  const offerGuardian = await getOfferGuardian(ownerCheck, offerId);
  if (!offerGuardian) {
    return { data: null, error: "Not authorized" };
  }

  const actingStaffUserId = options?.actingStaffUserId ?? null;

  if (!actingStaffUserId) {
    // Family path: the signed-in user must be the guardian on the offer.
    const authClient = await createServerClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated" };
    if (!offerGuardian.user_id || offerGuardian.user_id !== user.id) {
      return { data: null, error: "Not authorized" };
    }
  }

  // Derived, never taken from the caller. See the note on `guardianId`.
  const acceptingGuardianId = offerGuardian.id;

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
      accepted_by: acceptingGuardianId,
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
    // Who performed the action. A staff acceptance on a family's behalf is
    // recorded as that staff member, not as the family.
    actor_id: actingStaffUserId ?? acceptingGuardianId,
    campus_id: offer.campus_id,
    old_data: { status: "pending" },
    new_data: { status: "accepted" },
    metadata: {
      application_id: offer.application_id,
      acceptance_id: acceptance?.id ?? null,
      accepted_by_guardian_id: acceptingGuardianId,
      on_behalf_of_family: !!actingStaffUserId,
    },
  });

  // LG-2: accepting a seat starts Keep-the-Seat (melt prevention) and ends
  // any lingering pre-application drip.
  if (offer.application_id) {
    const { enrollByApplication, exitJourneysByApplication } = await import("./journeys");
    await exitJourneysByApplication(offer.application_id, "applied");
    await enrollByApplication(offer.application_id, "keep_the_seat");
  }

  if (offer.campus_id && offer.application_id) {
    notifyStaffOfferAccepted({
      campusId: offer.campus_id,
      applicationId: offer.application_id,
    }).catch(() => {});
  }

  return { data: null, error: null };
}

export interface DeclineOptions {
  /**
   * Playbook s15 refusal tracking. Deliberately optional: a family that just
   * wants out must never be blocked behind a required survey, and a staff
   * member logging a phone decline may not have asked.
   */
  reason?: DeclineReason;
  /** Free text alongside the reason. Never required. */
  note?: string;
  /**
   * The staff member declining on a family's behalf. Set ONLY by the staff
   * server actions after requireRoleOnCampus. See OfferActorOptions.
   */
  actingStaffUserId?: string;
}

/**
 * Decline an offer (called by family, or by staff on a family's behalf).
 */
export async function declineOffer(
  offerId: string,
  declinedBy?: string,
  options?: DeclineOptions
): Promise<MutationResult> {
  const ownerCheck = createServiceRoleClient();

  const offerGuardian = await getOfferGuardian(ownerCheck, offerId);
  if (!offerGuardian) {
    return { data: null, error: "Not authorized" };
  }

  const actingStaffUserId = options?.actingStaffUserId ?? null;

  if (!actingStaffUserId) {
    // Family path: the signed-in user must be the guardian on the offer.
    const authClient = await createServerClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated" };
    if (!offerGuardian.user_id || offerGuardian.user_id !== user.id) {
      return { data: null, error: "Not authorized" };
    }
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
      // Written only when supplied. An unsupplied reason stays NULL rather
      // than defaulting to 'other', so reports can tell "we never asked" apart
      // from "the family said other".
      ...(options?.reason ? { decline_reason: options.reason } : {}),
      ...(options?.note?.trim() ? { decline_note: options.note.trim() } : {}),
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
    actor_id: actingStaffUserId ?? declinedBy ?? offerGuardian.id,
    campus_id: offer.campus_id ?? null,
    old_data: { status: "pending" },
    new_data: { status: "declined" },
    metadata: {
      application_id: offer.application_id,
      decline_reason: options?.reason ?? null,
      on_behalf_of_family: !!actingStaffUserId,
    },
  });

  // Seat is now available — immediately promote the next waitlist candidate
  // so families don't wait until the nightly cron to hear the good news.
  // Scoped to the school year this offer belonged to, never campus + grade
  // alone.
  if (offer.campus_id && offer.grade_level_id) {
    await promoteNextWaitlistCandidate({
      campusId: offer.campus_id,
      gradeLevelId: offer.grade_level_id,
      vacatedApplicationId: offer.application_id,
    });
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

  // Seat is now available — immediately promote next waitlist candidate,
  // scoped to this offer's school year.
  if (offer.campus_id && offer.grade_level_id) {
    await promoteNextWaitlistCandidate({
      campusId: offer.campus_id,
      gradeLevelId: offer.grade_level_id,
      vacatedApplicationId: offer.application_id,
    });
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
