"use server";

import { revalidatePath } from "next/cache";
import { promoteFromWaitlist, removeFromWaitlist } from "@/lib/mutations";

export async function staffPromoteFromWaitlist(
  waitlistPositionId: string,
  offeredBy: string,
  expiresAt: string
) {
  const result = await promoteFromWaitlist(waitlistPositionId, offeredBy, expiresAt);

  if (!result.error) {
    revalidatePath("/staff/waitlist");
    revalidatePath("/staff/offers");
    revalidatePath("/staff/applications");
  }

  return result;
}

export async function staffRemoveFromWaitlist(
  waitlistPositionId: string,
  reason: string
) {
  const result = await removeFromWaitlist(waitlistPositionId, reason);

  if (!result.error) {
    revalidatePath("/staff/waitlist");
    revalidatePath("/staff/applications");
  }

  return result;
}
