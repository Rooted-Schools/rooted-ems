"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { requireMinRole, hasRoleOnCampus } from "@/lib/auth/get-session";
import { pauseJourney, resumeJourney, exitEnrollment, enrollLeadInJourneyById } from "@/lib/mutations/journeys";
import { getEnrollableLeads, type EnrollableLead } from "@/lib/queries/journeys";

/**
 * Journey management actions (LG-2: "Nurture Journeys still doesn't allow me
 * to do anything"). Journeys send real, automated email to families, so
 * every mutation here is gated at enrollment_manager — one level above the
 * plain requireStaffSession() the rest of /staff/recruitment uses for read
 * access and low-stakes writes (add lead, log activity, sync sheets).
 */

export async function staffPauseJourney(journeyId: string) {
  const session = await requireMinRole("enrollment_manager");
  const result = await pauseJourney(journeyId, session.user_id);
  if (!result.error) {
    revalidatePath("/staff/recruitment");
    revalidatePath("/staff/recruitment/journeys");
    revalidatePath(`/staff/recruitment/journeys/${journeyId}`);
    revalidatePath("/staff/communications/automated-messages");
  }
  return result;
}

export async function staffResumeJourney(journeyId: string) {
  const session = await requireMinRole("enrollment_manager");
  const result = await resumeJourney(journeyId, session.user_id);
  if (!result.error) {
    revalidatePath("/staff/recruitment");
    revalidatePath("/staff/recruitment/journeys");
    revalidatePath(`/staff/recruitment/journeys/${journeyId}`);
    revalidatePath("/staff/communications/automated-messages");
  }
  return result;
}

/** Roster "Remove from journey" — exits exactly this one enrollment, reason "manual". */
export async function staffExitJourneyEnrollment(enrollmentId: string, journeyId: string) {
  const session = await requireMinRole("enrollment_manager");
  const result = await exitEnrollment(enrollmentId, session.user_id);
  if (!result.error) {
    revalidatePath("/staff/recruitment");
    revalidatePath(`/staff/recruitment/journeys/${journeyId}`);
  }
  return result;
}

export interface EnrollFamiliesResult {
  enrolled: number;
  skipped: { leadId: string; reason: string }[];
}

/**
 * Enroll many leads into one journey. Gated at enrollment_manager overall,
 * AND per-lead: a manager who only holds the role at Campus A must not be
 * able to enroll a Campus B lead just because the batch (built from a
 * multi-campus search, for CMO-level users) included that lead's id. The
 * same class of gap the offers actions fixed by resolving the record's real
 * campus_id and checking requireRoleOnCampus — here the batch can span
 * campuses, so each lead is checked individually and an out-of-access lead
 * is skipped and reported back, not silently dropped or (worse) allowed.
 */
export async function staffEnrollLeadsInJourney(
  journeyId: string,
  leadIds: string[]
): Promise<EnrollFamiliesResult> {
  const session = await requireMinRole("enrollment_manager");
  const supabase = createServiceRoleClient();

  const result: EnrollFamiliesResult = { enrolled: 0, skipped: [] };
  const uniqueIds = [...new Set(leadIds)];

  for (const leadId of uniqueIds) {
    const { data: lead } = await supabase.from("lead").select("campus_id").eq("id", leadId).maybeSingle();
    const campusId = (lead?.campus_id as string | undefined) ?? undefined;
    if (!hasRoleOnCampus(session, campusId, "enrollment_manager")) {
      result.skipped.push({ leadId, reason: "no access to this family's campus" });
      continue;
    }
    const mutationResult = await enrollLeadInJourneyById(leadId, journeyId, session.user_id);
    if (mutationResult.error) {
      result.skipped.push({ leadId, reason: mutationResult.error });
    } else if (!mutationResult.data?.enrolled) {
      result.skipped.push({ leadId, reason: mutationResult.data?.skip_reason ?? "not enrolled" });
    } else {
      result.enrolled++;
    }
  }

  if (result.enrolled > 0) {
    revalidatePath("/staff/recruitment");
    revalidatePath(`/staff/recruitment/journeys/${journeyId}`);
  }
  return result;
}

/** Search/filter candidates for the "Enroll families" dialog on the journey detail page. */
export async function staffSearchEnrollableLeads(
  journeyId: string,
  options: { search?: string; campusId?: string }
): Promise<EnrollableLead[]> {
  await requireMinRole("enrollment_manager");
  return getEnrollableLeads(journeyId, options);
}
