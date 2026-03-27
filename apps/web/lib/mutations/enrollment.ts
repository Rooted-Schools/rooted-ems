import { createServerClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";
import { AuditAction, logAuditEvent } from "@/lib/audit";

// ─── Types ─────────────────────────────────────────────

export interface CreateEnrollmentInput {
  student_id: string;
  campus_id: string;
  grade_level_id: string;
  school_year_id: string;
  acceptance_id?: string;
  application_id?: string;
}

// ─── Mutations ─────────────────────────────────────────

/**
 * Create an enrollment record (final step in the pipeline).
 * Transitions application status to "registered".
 */
export async function createEnrollment(
  input: CreateEnrollmentInput
): Promise<MutationResult<{ id: string }>> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("enrollment")
    .insert({
      student_id: input.student_id,
      campus_id: input.campus_id,
      grade_level_id: input.grade_level_id,
      school_year_id: input.school_year_id,
      acceptance_id: input.acceptance_id ?? null,
      application_id: input.application_id ?? null,
      status: "active",
      enrolled_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("[createEnrollment]", error.message);
    return { data: null, error: "Failed to create enrollment." };
  }

  // Update application status to registered
  if (input.application_id) {
    await supabase
      .from("application")
      .update({ status: "registered", updated_at: new Date().toISOString() })
      .eq("id", input.application_id);
  }

  await logAuditEvent({
    table_name: "enrollment",
    record_id: data.id,
    action: AuditAction.Create,
    actor_id: null, // system-generated during acceptOffer flow
    campus_id: input.campus_id,
    new_data: {
      student_id: input.student_id,
      campus_id: input.campus_id,
      grade_level_id: input.grade_level_id,
      school_year_id: input.school_year_id,
      status: "active",
    },
    metadata: {
      application_id: input.application_id ?? null,
      acceptance_id: input.acceptance_id ?? null,
    },
  });

  return { data: { id: data.id }, error: null };
}

/**
 * Withdraw an enrolled student.
 */
export async function withdrawEnrollment(
  enrollmentId: string,
  reason: string,
  withdrawnBy?: string
): Promise<MutationResult> {
  const supabase = await createServerClient();

  // Fetch the enrollment to get the linked application_id and campus
  const { data: enrollment, error: fetchError } = await supabase
    .from("enrollment")
    .select("application_id, campus_id, student_id")
    .eq("id", enrollmentId)
    .single();

  if (fetchError || !enrollment) {
    return { data: null, error: "Enrollment not found." };
  }

  const { error } = await supabase
    .from("enrollment")
    .update({
      status: "withdrawn",
      withdrawn_at: new Date().toISOString(),
      withdrawal_reason: reason,
    })
    .eq("id", enrollmentId);

  if (error) {
    return { data: null, error: "Failed to withdraw enrollment." };
  }

  // Also update the linked application status to withdrawn
  if (enrollment.application_id) {
    await supabase
      .from("application")
      .update({ status: "withdrawn", updated_at: new Date().toISOString() })
      .eq("id", enrollment.application_id);
  }

  await logAuditEvent({
    table_name: "enrollment",
    record_id: enrollmentId,
    action: AuditAction.StatusChange,
    actor_id: withdrawnBy ?? null,
    campus_id: (enrollment.campus_id as string) ?? null,
    old_data: { status: "active" },
    new_data: { status: "withdrawn", withdrawal_reason: reason },
    metadata: {
      application_id: enrollment.application_id ?? null,
      student_id: enrollment.student_id ?? null,
    },
  });

  return { data: null, error: null };
}

/**
 * Record a SIS sync for an enrolled student.
 */
export async function syncEnrollmentSIS(
  enrollmentId: string,
  sisStudentId: string
): Promise<MutationResult> {
  const supabase = await createServerClient();

  const { error } = await supabase
    .from("enrollment")
    .update({
      sis_student_id: sisStudentId,
      sis_synced_at: new Date().toISOString(),
    })
    .eq("id", enrollmentId);

  if (error) {
    return { data: null, error: "Failed to sync SIS ID." };
  }

  return { data: null, error: null };
}

/**
 * Transfer an enrolled student to a different campus/grade.
 */
export async function transferEnrollment(
  enrollmentId: string,
  newCampusId: string,
  newGradeLevelId: string,
  transferredBy?: string
): Promise<MutationResult> {
  const supabase = await createServerClient();

  // Mark current enrollment as transferred
  const { data: current, error: fetchError } = await supabase
    .from("enrollment")
    .select("student_id, campus_id, grade_level_id, school_year_id, acceptance_id, application_id")
    .eq("id", enrollmentId)
    .single();

  if (fetchError || !current) {
    return { data: null, error: "Enrollment not found." };
  }

  const { error: updateError } = await supabase
    .from("enrollment")
    .update({ status: "transferred" })
    .eq("id", enrollmentId);

  if (updateError) {
    return { data: null, error: "Failed to update enrollment status." };
  }

  // Create new enrollment at new campus/grade
  const { error: insertError } = await supabase
    .from("enrollment")
    .insert({
      student_id: current.student_id,
      campus_id: newCampusId,
      grade_level_id: newGradeLevelId,
      school_year_id: current.school_year_id,
      acceptance_id: current.acceptance_id,
      application_id: current.application_id,
      status: "active",
      enrolled_at: new Date().toISOString(),
    });

  if (insertError) {
    return { data: null, error: "Failed to create transfer enrollment." };
  }

  // Update the linked application's campus_id to reflect the transfer
  if (current.application_id) {
    await supabase
      .from("application")
      .update({
        campus_id: newCampusId,
        grade_level_id: newGradeLevelId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.application_id);
  }

  await logAuditEvent({
    table_name: "enrollment",
    record_id: enrollmentId,
    action: AuditAction.StatusChange,
    actor_id: transferredBy ?? null,
    campus_id: current.campus_id ?? null,
    old_data: { status: "active", campus_id: current.campus_id, grade_level_id: current.grade_level_id },
    new_data: { status: "transferred", new_campus_id: newCampusId, new_grade_level_id: newGradeLevelId },
    metadata: {
      student_id: current.student_id,
      application_id: current.application_id ?? null,
    },
  });

  return { data: null, error: null };
}
