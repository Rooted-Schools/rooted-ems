import { createServerClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";

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

  return { data: { id: data.id }, error: null };
}

/**
 * Withdraw an enrolled student.
 */
export async function withdrawEnrollment(
  enrollmentId: string,
  reason: string
): Promise<MutationResult> {
  const supabase = await createServerClient();

  // Fetch the enrollment to get the linked application_id
  const { data: enrollment, error: fetchError } = await supabase
    .from("enrollment")
    .select("application_id")
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
  newGradeLevelId: string
): Promise<MutationResult> {
  const supabase = await createServerClient();

  // Mark current enrollment as transferred
  const { data: current, error: fetchError } = await supabase
    .from("enrollment")
    .select("student_id, school_year_id, acceptance_id, application_id")
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

  return { data: null, error: null };
}
