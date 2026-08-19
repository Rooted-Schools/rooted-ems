"use server";

import { revalidatePath } from "next/cache";
import { requireRoleOnCampus } from "@/lib/auth/get-session";
import { createEnrollment, withdrawEnrollment, syncEnrollmentSIS } from "@/lib/mutations";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { notifyFamilyStudentEnrolled } from "@/lib/notify";

/**
 * These actions previously only checked requireStaffSession() — any staff
 * account, on any campus, could act on any enrollment/application id the
 * client supplied. They now resolve the record's real campus_id (via the
 * linked application when one exists, since that is the more trustworthy
 * source than a client-supplied campusId) and require the caller hold at
 * least the lowest recognized role ON that campus — the same bar
 * requireStaffSession implied ("some staff role"), just scoped to the right
 * campus instead of any.
 */

export async function staffCreateEnrollment(
  studentId: string,
  campusId: string,
  gradeLevelId: string,
  schoolYearId: string,
  acceptanceId?: string,
  applicationId?: string
) {
  let realCampusId: string | undefined = campusId;
  if (applicationId) {
    const supabase = createServiceRoleClient();
    const { data: app } = await supabase
      .from("application")
      .select("campus_id")
      .eq("id", applicationId)
      .single();
    if (app?.campus_id) realCampusId = app.campus_id as string;
  }

  await requireRoleOnCampus(realCampusId, "enrollment_manager");

  const result = await createEnrollment({
    student_id: studentId,
    campus_id: realCampusId ?? campusId,
    grade_level_id: gradeLevelId,
    school_year_id: schoolYearId,
    acceptance_id: acceptanceId,
    application_id: applicationId,
  });

  if (!result.error) {
    revalidatePath("/staff/enrollment");
    revalidatePath("/staff/applications");
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/today");
  }

  return result;
}

export async function staffWithdrawEnrollment(
  enrollmentId: string,
  reason: string
) {
  const supabase = createServiceRoleClient();
  const { data: enrollment } = await supabase
    .from("enrollment")
    .select("campus_id")
    .eq("id", enrollmentId)
    .single();

  await requireRoleOnCampus(enrollment?.campus_id as string | undefined, "enrollment_manager");
  const result = await withdrawEnrollment(enrollmentId, reason);

  if (!result.error) {
    revalidatePath("/staff/enrollment");
    revalidatePath("/staff/applications");
    revalidatePath("/staff/seats");
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/today");
  }

  return result;
}

export async function staffSyncSIS(
  enrollmentId: string,
  sisStudentId: string
) {
  const supabase = createServiceRoleClient();
  const { data: enrollment } = await supabase
    .from("enrollment")
    .select("campus_id")
    .eq("id", enrollmentId)
    .single();

  await requireRoleOnCampus(enrollment?.campus_id as string | undefined, "enrollment_staff");
  const result = await syncEnrollmentSIS(enrollmentId, sisStudentId);

  if (!result.error) {
    revalidatePath("/staff/enrollment");
  }

  return result;
}

// ─── Activate a stuck pending enrollment ───────────────────────────────────────

export async function staffActivateEnrollment(
  enrollmentId: string,
  applicationId?: string | null
): Promise<{ data: null; error: string | null }> {
  const supabase = createServiceRoleClient();
  const { data: enrollmentForAuth } = await supabase
    .from("enrollment")
    .select("campus_id")
    .eq("id", enrollmentId)
    .single();

  await requireRoleOnCampus(enrollmentForAuth?.campus_id as string | undefined, "enrollment_manager");

  // Compare-and-set: only a still-pending row flips to active. Returning the
  // changed rows (matching the pattern in offers.ts expireOffer) lets us tell
  // "activated" apart from "matched nothing" — without this, a non-pending row
  // matched zero rows, returned error:null, and the code below still flipped
  // the application to enrolled and emailed the family about an activation that
  // never happened. enrolled_at is stamped here (the row was pending, so it had
  // no earlier real date to overwrite) — it is the date an authorizer reads.
  const { data: activated, error } = await supabase
    .from("enrollment")
    .update({
      status: "active",
      enrolled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", enrollmentId)
    .eq("status", "pending")
    .select("id");

  if (error) return { data: null, error: error.message };
  if (!activated || activated.length === 0) {
    return { data: null, error: "This enrollment is no longer pending." };
  }

  // Also sync application status to enrolled if linked
  if (applicationId) {
    await supabase
      .from("application")
      .update({ status: "enrolled", updated_at: new Date().toISOString() })
      .eq("id", applicationId)
      .in("status", ["accepted", "registered", "placement_review"]);

    // Fire enrollment notification (non-blocking)
    notifyFamilyStudentEnrolled({ applicationId }).catch(() => {});
  }

  revalidatePath("/staff/enrollment");
  revalidatePath("/staff/applications");
  revalidatePath("/staff/dashboard");
    revalidatePath("/staff/today");
  revalidatePath("/family/dashboard");

  return { data: null, error: null };
}
