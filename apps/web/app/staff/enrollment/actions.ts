"use server";

import { revalidatePath } from "next/cache";
import { createEnrollment, withdrawEnrollment, syncEnrollmentSIS } from "@/lib/mutations";

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
