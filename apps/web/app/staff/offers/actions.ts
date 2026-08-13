"use server";

import { revalidatePath } from "next/cache";
import { requireRoleOnCampus } from "@/lib/auth/get-session";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { isDeclineReason } from "@/lib/decline-reasons";
import {
  sendOffer,
  acceptOffer,
  declineOffer,
  revokeOffer,
  expireOffer,
  createEnrollment,
  initializeRegistrationPacket,
  promoteFromWaitlist,
  removeFromWaitlist,
} from "@/lib/mutations";

/**
 * Offer and waitlist actions move seats, so they carry the same gate as the
 * page that renders them: enrollment_manager. They previously accepted the
 * acting user's id as an argument — the client could name anyone as the
 * person who made or revoked an offer, which is exactly the field an audit
 * reads. The session is the only source for that now; the parameters stay in
 * the signatures for the existing callers and are ignored.
 *
 * They also previously trusted requireMinRole("enrollment_manager") ALONE —
 * that checks the caller's highest role on ANY campus, then let the action
 * mutate whatever campus-scoped record the client named. An enrollment
 * manager at Campus A could send/revoke/accept/decline an offer, or promote
 * a waitlist position, at Campus B just by supplying that record's id. Every
 * action below now resolves the record's REAL campus_id via service role
 * first, and gates on requireRoleOnCampus for that specific campus.
 */

export async function staffSendOffer(
  applicationId: string,
  campusId: string,
  gradeLevelId: string,
  expiresAt: string,
  _offeredBy?: string
) {
  const supabase = createServiceRoleClient();
  const { data: app } = await supabase
    .from("application")
    .select("campus_id")
    .eq("id", applicationId)
    .single();
  const realCampusId = app?.campus_id as string | undefined;

  const session = await requireRoleOnCampus(realCampusId, "enrollment_manager");

  // realCampusId is the source of truth for where this offer is scoped — a
  // client-supplied campusId that disagreed would mean an offer stamped with
  // a campus that isn't actually the application's.
  const result = await sendOffer({
    application_id: applicationId,
    campus_id: realCampusId ?? campusId,
    grade_level_id: gradeLevelId,
    expires_at: expiresAt,
    offered_by: session.user_id,
  });

  if (!result.error) {
    revalidatePath("/staff/offers");
    revalidatePath("/staff/applications");
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/today");
  }

  return result;
}

export async function staffRevokeOffer(
  offerId: string,
  _revokedBy: string | undefined,
  reason?: string
) {
  const supabase = createServiceRoleClient();
  const { data: offer } = await supabase
    .from("offer")
    .select("campus_id")
    .eq("id", offerId)
    .single();

  const session = await requireRoleOnCampus(offer?.campus_id as string | undefined, "enrollment_manager");
  const result = await revokeOffer(offerId, session.user_id, reason);

  if (!result.error) {
    revalidatePath("/staff/offers");
    revalidatePath("/staff/applications");
    revalidatePath("/staff/seats");
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/today");
  }

  return result;
}

export async function staffExpireOffer(offerId: string) {
  const supabase = createServiceRoleClient();
  const { data: offer } = await supabase
    .from("offer")
    .select("campus_id")
    .eq("id", offerId)
    .single();

  await requireRoleOnCampus(offer?.campus_id as string | undefined, "enrollment_manager");
  const result = await expireOffer(offerId);

  if (!result.error) {
    revalidatePath("/staff/offers");
    revalidatePath("/staff/applications");
    revalidatePath("/staff/seats");
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/today");
  }

  return result;
}

/**
 * Accept on a family's behalf. acceptOffer's default path requires the signed
 * in user to BE the guardian on the offer, which no staff member ever is — so
 * every staff acceptance failed "Not authorized" until the acting-staff flag
 * below was passed. requireRoleOnCampus above is the gate that earns it.
 *
 * The guardian recorded on the acceptance is derived from the offer inside
 * acceptOffer; `guardianId` here is vestigial and ignored.
 */
export async function staffAcceptOfferOnBehalf(
  offerId: string,
  guardianId?: string
) {
  const supabase = createServiceRoleClient();
  const { data: offer } = await supabase
    .from("offer")
    .select("campus_id")
    .eq("id", offerId)
    .single();

  const session = await requireRoleOnCampus(
    offer?.campus_id as string | undefined,
    "enrollment_manager"
  );
  const result = await acceptOffer(offerId, guardianId, {
    actingStaffUserId: session.user_id,
  });

  if (!result.error) {
    revalidatePath("/staff/offers");
    revalidatePath("/staff/enrollment");
    revalidatePath("/staff/applications");
    revalidatePath("/staff/seats");
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/today");
  }

  return result;
}

export async function staffDeclineOfferOnBehalf(
  offerId: string,
  reason?: string,
  note?: string
) {
  const supabase = createServiceRoleClient();
  const { data: offer } = await supabase
    .from("offer")
    .select("campus_id")
    .eq("id", offerId)
    .single();

  const session = await requireRoleOnCampus(
    offer?.campus_id as string | undefined,
    "enrollment_manager"
  );
  // Staff record most declines by phone, so this is the path where a reason is
  // most likely known and least likely captured. Still optional.
  //
  // The acting staff member is named twice on purpose: actingStaffUserId is
  // what earns the bypass of the family ownership check, and the second
  // argument is the declining user for the audit trail. Both resolve to the
  // gated session, never to anything the client supplied.
  const result = await declineOffer(offerId, session.user_id, {
    reason: isDeclineReason(reason) ? reason : undefined,
    note,
    actingStaffUserId: session.user_id,
  });

  if (!result.error) {
    revalidatePath("/staff/offers");
    revalidatePath("/staff/waitlist");
    revalidatePath("/staff/applications");
  }

  return result;
}

/**
 * Convert an accepted offer to an enrollment (fallback if auto-enrollment didn't fire).
 */
export async function staffConvertToEnrollment(
  studentId: string,
  campusId: string,
  gradeLevelId: string,
  schoolYearId: string,
  applicationId: string
) {
  const supabase = createServiceRoleClient();
  const { data: app } = await supabase
    .from("application")
    .select("campus_id")
    .eq("id", applicationId)
    .single();
  const realCampusId = app?.campus_id as string | undefined;

  await requireRoleOnCampus(realCampusId, "enrollment_manager");

  const result = await createEnrollment({
    student_id: studentId,
    campus_id: realCampusId ?? campusId,
    grade_level_id: gradeLevelId,
    school_year_id: schoolYearId,
    application_id: applicationId,
  });

  if (!result.error && result.data) {
    // Initialize registration packet
    await initializeRegistrationPacket({
      enrollment_id: result.data.id,
      campus_id: realCampusId ?? campusId,
      school_year_id: schoolYearId,
    });

    revalidatePath("/staff/offers");
    revalidatePath("/staff/enrollment");
    revalidatePath("/staff/applications");
    revalidatePath("/staff/seats");
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/today");
  }

  return result;
}

/* ─── Waitlist Actions ─── */

export async function staffPromoteFromWaitlist(
  waitlistPositionId: string,
  _offeredBy: string | undefined,
  expiresAt: string
) {
  const supabase = createServiceRoleClient();
  const { data: position } = await supabase
    .from("waitlist_position")
    .select("waitlist:waitlist_id (campus_id)")
    .eq("id", waitlistPositionId)
    .single();
  const waitlistCampusId = (position?.waitlist as unknown as { campus_id: string } | null)?.campus_id;

  const session = await requireRoleOnCampus(waitlistCampusId, "enrollment_manager");
  const result = await promoteFromWaitlist(waitlistPositionId, session.user_id, expiresAt);

  if (!result.error) {
    revalidatePath("/staff/offers");
    revalidatePath("/staff/waitlist");
    revalidatePath("/staff/applications");
    revalidatePath("/staff/seats");
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/today");
  }

  return result;
}

export async function staffRemoveFromWaitlist(
  waitlistPositionId: string,
  reason: string
) {
  const supabase = createServiceRoleClient();
  const { data: position } = await supabase
    .from("waitlist_position")
    .select("waitlist:waitlist_id (campus_id)")
    .eq("id", waitlistPositionId)
    .single();
  const waitlistCampusId = (position?.waitlist as unknown as { campus_id: string } | null)?.campus_id;

  await requireRoleOnCampus(waitlistCampusId, "enrollment_manager");
  const result = await removeFromWaitlist(waitlistPositionId, reason);

  if (!result.error) {
    revalidatePath("/staff/offers");
    revalidatePath("/staff/waitlist");
    revalidatePath("/staff/applications");
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/today");
  }

  return result;
}
