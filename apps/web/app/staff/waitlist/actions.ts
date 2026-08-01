"use server";

import { revalidatePath } from "next/cache";
import { promoteFromWaitlist, removeFromWaitlist } from "@/lib/mutations";
import { requireStaffSession } from "@/lib/auth/get-session";

export async function staffPromoteFromWaitlist(
  waitlistPositionId: string,
  offeredBy: string,
  expiresAt: string
) {
  await requireStaffSession();
  const result = await promoteFromWaitlist(waitlistPositionId, offeredBy, expiresAt);

  if (!result.error) {
    revalidatePath("/staff/waitlist");
    revalidatePath("/staff/offers");
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
  await requireStaffSession();
  const result = await removeFromWaitlist(waitlistPositionId, reason);

  if (!result.error) {
    revalidatePath("/staff/waitlist");
    revalidatePath("/staff/applications");
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/today");
  }

  return result;
}
