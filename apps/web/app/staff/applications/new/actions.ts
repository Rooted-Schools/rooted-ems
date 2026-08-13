"use server";

import { revalidatePath } from "next/cache";
import { requireRoleOnCampus } from "@/lib/auth/get-session";
import {
  staffCreateApplication,
  staffFastTrackEnroll,
  stitchLeadToApplication,
  type CreateApplicationInput,
} from "@/lib/mutations";

/**
 * Server action: Staff creates an application on behalf of a family.
 * Returns the new application ID for redirect.
 *
 * requireStaffSession only asked "is this person staff anywhere" — which let a
 * staff member scoped to one campus file an application against another by
 * supplying that campus's id. The gate is the role on the campus named in the
 * input, and the mutation separately proves the window and grade level belong
 * to that same campus, so the id cannot be used to reach across campuses.
 */
export async function staffCreateApplicationAction(input: CreateApplicationInput) {
  await requireRoleOnCampus(input.campus_id, "enrollment_staff");
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
 *
 * Held to enrollment_manager on the named campus, not enrollment_staff: this
 * path skips the lottery and the offer and seats a student directly, which is
 * the same authority level the offer actions already require.
 */
export async function staffFastTrackEnrollAction(input: CreateApplicationInput) {
  await requireRoleOnCampus(input.campus_id, "enrollment_manager");
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
