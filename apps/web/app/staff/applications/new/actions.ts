"use server";

import { revalidatePath } from "next/cache";
import { requireStaffSession } from "@/lib/auth/get-session";
import {
  staffCreateApplication,
  staffFastTrackEnroll,
  stitchLeadToApplication,
  type CreateApplicationInput,
} from "@/lib/mutations";

/**
 * Server action: Staff creates an application on behalf of a family.
 * Returns the new application ID for redirect.
 */
export async function staffCreateApplicationAction(
  input: CreateApplicationInput & { created_by_staff: string }
) {
  await requireStaffSession();
  const result = await staffCreateApplication(input, { autoSubmit: true });

  if (!result.error) {
    // Convert any matching recruitment lead — same automatic stitch the
    // family submit path runs (matched by guardian email + campus).
    const appId = (result.data as { id?: string } | null)?.id;
    if (appId) {
      await stitchLeadToApplication(appId, input.guardian_email ?? null, input.campus_id ?? null);
    }
    revalidatePath("/staff/applications");
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/today");
    revalidatePath("/staff/recruitment");
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
  await requireStaffSession();
  const result = await staffFastTrackEnroll(input);

  if (!result.error) {
    const appId = (result.data as { id?: string; application_id?: string } | null)?.id
      ?? (result.data as { application_id?: string } | null)?.application_id;
    if (appId) {
      await stitchLeadToApplication(appId, input.guardian_email ?? null, input.campus_id ?? null);
    }
    revalidatePath("/staff/applications");
    revalidatePath("/staff/enrollment");
    revalidatePath("/staff/offers");
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/today");
    revalidatePath("/staff/recruitment");
  }

  return result;
}
