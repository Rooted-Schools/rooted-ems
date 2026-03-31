"use server";

import { revalidatePath } from "next/cache";
import {
  completeRegistrationItem,
  submitRegistrationPacket,
} from "@/lib/mutations";
import { requireSession } from "@/lib/auth/get-session";

/**
 * Family completes a single registration item (e.g., emergency contact form, handbook ack).
 */
export async function familyCompleteRegistrationItem(
  itemId: string,
  data?: Record<string, unknown>
) {
  await requireSession();
  const result = await completeRegistrationItem({ item_id: itemId, data });

  if (!result.error) {
    revalidatePath("/family/registration");
    revalidatePath("/family/dashboard");
  }

  return result;
}

/**
 * Family submits the entire registration packet (after all items are completed).
 */
export async function familySubmitRegistrationPacket(enrollmentId: string) {
  await requireSession();
  const result = await submitRegistrationPacket(enrollmentId);

  if (!result.error) {
    revalidatePath("/family/registration");
    revalidatePath("/family/dashboard");
    revalidatePath("/family/applications");
  }

  return result;
}
