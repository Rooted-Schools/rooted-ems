"use server";

import { revalidatePath } from "next/cache";
import { sendOffer, acceptOffer, declineOffer, revokeOffer, expireOffer } from "@/lib/mutations";

export async function staffSendOffer(
  applicationId: string,
  campusId: string,
  gradeLevelId: string,
  expiresAt: string,
  offeredBy: string
) {
  const result = await sendOffer({
    application_id: applicationId,
    campus_id: campusId,
    grade_level_id: gradeLevelId,
    expires_at: expiresAt,
    offered_by: offeredBy,
  });

  if (!result.error) {
    revalidatePath("/staff/offers");
    revalidatePath("/staff/applications");
    revalidatePath("/staff/dashboard");
  }

  return result;
}

export async function staffRevokeOffer(
  offerId: string,
  revokedBy: string,
  reason?: string
) {
  const result = await revokeOffer(offerId, revokedBy, reason);

  if (!result.error) {
    revalidatePath("/staff/offers");
    revalidatePath("/staff/applications");
  }

  return result;
}

export async function staffExpireOffer(offerId: string) {
  const result = await expireOffer(offerId);

  if (!result.error) {
    revalidatePath("/staff/offers");
    revalidatePath("/staff/applications");
  }

  return result;
}

export async function staffAcceptOfferOnBehalf(
  offerId: string,
  guardianId: string
) {
  const result = await acceptOffer(offerId, guardianId);

  if (!result.error) {
    revalidatePath("/staff/offers");
    revalidatePath("/staff/enrollment");
    revalidatePath("/staff/applications");
  }

  return result;
}

export async function staffDeclineOfferOnBehalf(offerId: string) {
  const result = await declineOffer(offerId);

  if (!result.error) {
    revalidatePath("/staff/offers");
    revalidatePath("/staff/waitlist");
    revalidatePath("/staff/applications");
  }

  return result;
}
