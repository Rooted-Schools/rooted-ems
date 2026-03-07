"use server";

import { revalidatePath } from "next/cache";
import {
  staffCreateApplication,
  staffFastTrackEnroll,
  type CreateApplicationInput,
} from "@/lib/mutations";

/**
 * Server action: Staff creates an application on behalf of a family.
 * Returns the new application ID for redirect.
 */
export async function staffCreateApplicationAction(
  input: CreateApplicationInput & { created_by_staff: string }
) {
  const result = await staffCreateApplication(input, { autoSubmit: true });

  if (!result.error) {
    revalidatePath("/staff/applications");
    revalidatePath("/staff/dashboard");
  }

  return result;
}

/**
 * Server action: Staff creates an application AND enrolls the student
 * in a single step (fast-track). Used when school has open seats.
 */
export async function staffFastTrackEnrollAction(
  input: CreateApplicationInput & { created_by_staff: string }
) {
  const result = await staffFastTrackEnroll(input);

  if (!result.error) {
    revalidatePath("/staff/applications");
    revalidatePath("/staff/enrollment");
    revalidatePath("/staff/offers");
    revalidatePath("/staff/dashboard");
  }

  return result;
}
