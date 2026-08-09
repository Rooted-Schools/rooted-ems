"use server";

import { revalidatePath } from "next/cache";
import { requireMinRole } from "@/lib/auth/get-session";
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
 */

export async function staffSendOffer(
  applicationId: string,
  campusId: string,
  gradeLevelId: string,
  expiresAt: string,
  _offeredBy?: string
) {
  const session = await requireMinRole("enrollment_manager");
  const result = await sendOffer({
    application_id: applicationId,
    campus_id: campusId,
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
  const session = await requireMinRole("enrollment_manager");
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
  await requireMinRole("enrollment_manager");
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

export async function staffAcceptOfferOnBehalf(
  offerId: string,
  guardianId: string
) {
  await requireMinRole("enrollment_manager");
  const result = await acceptOffer(offerId, guardianId);

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
  await requireMinRole("enrollment_manager");
  // Staff record most declines by phone, so this is the path where a reason is
  // most likely known and least likely captured. Still optional.
  const result = await declineOffer(offerId, undefined, {
    reason: isDeclineReason(reason) ? reason : undefined,
    note,
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
  await requireMinRole("enrollment_manager");
  const result = await createEnrollment({
    student_id: studentId,
    campus_id: campusId,
    grade_level_id: gradeLevelId,
    school_year_id: schoolYearId,
    application_id: applicationId,
  });

  if (!result.error && result.data) {
    // Initialize registration packet
    await initializeRegistrationPacket({
      enrollment_id: result.data.id,
      campus_id: campusId,
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
  const session = await requireMinRole("enrollment_manager");
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
  await requireMinRole("enrollment_manager");
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
