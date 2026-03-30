"use server";

import { revalidatePath } from "next/cache";
import { createEnrollment, withdrawEnrollment, syncEnrollmentSIS } from "@/lib/mutations";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { notifyFamilyStudentEnrolled } from "@/lib/notify";

export async function staffCreateEnrollment(
  studentId: string,
  campusId: string,
  gradeLevelId: string,
  schoolYearId: string,
  acceptanceId?: string,
  applicationId?: string
) {
  const result = await createEnrollment({
    student_id: studentId,
    campus_id: campusId,
    grade_level_id: gradeLevelId,
    school_year_id: schoolYearId,
    acceptance_id: acceptanceId,
    application_id: applicationId,
  });

  if (!result.error) {
    revalidatePath("/staff/enrollment");
    revalidatePath("/staff/applications");
    revalidatePath("/staff/dashboard");
  }

  return result;
}

export async function staffWithdrawEnrollment(
  enrollmentId: string,
  reason: string
) {
  const result = await withdrawEnrollment(enrollmentId, reason);

  if (!result.error) {
    revalidatePath("/staff/enrollment");
    revalidatePath("/staff/applications");
    revalidatePath("/staff/seats");
    revalidatePath("/staff/dashboard");
  }

  return result;
}

export async function staffSyncSIS(
  enrollmentId: string,
  sisStudentId: string
) {
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

  const { error } = await supabase
    .from("enrollment")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", enrollmentId)
    .eq("status", "pending");

  if (error) return { data: null, error: error.message };

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
  revalidatePath("/family/dashboard");

  return { data: null, error: null };
}
