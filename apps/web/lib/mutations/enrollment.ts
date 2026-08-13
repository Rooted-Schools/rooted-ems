import { createServiceRoleClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";
import { AuditAction, logAuditEvent } from "@/lib/audit";
import { requireStaffSession } from "@/lib/auth/get-session";
import { promoteNextWaitlistCandidate } from "./waitlist";

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
 * Create an enrollment record.
 *
 * The application stays at "accepted". It does NOT move to "registered" here:
 * accepting a seat is not the same as having completed a registration packet,
 * and flipping the status at acceptance made every accepted family read as
 * registered on the pipeline, in the counts, and in the nudge logic — so
 * nobody was chased for a packet they had not started. The flip to
 * "registered" belongs to packet submission.
 */
export async function createEnrollment(
  input: CreateEnrollmentInput
): Promise<MutationResult<{ id: string }>> {
  const supabase = createServiceRoleClient();

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
  await requireStaffSession();
  const supabase = createServiceRoleClient();

  // Fetch the enrollment to get the linked application_id, campus, grade, and
  // school year — the last two are what a waitlist is keyed on.
  const { data: enrollment, error: fetchError } = await supabase
    .from("enrollment")
    .select("application_id, campus_id, student_id, grade_level_id, school_year_id")
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

    // Stop the keep_the_seat (and any other) marketing journey for this
    // family — without this a withdrawn student's family keeps receiving
    // "keep the seat" nurture touches for a seat they no longer hold.
    const { exitJourneysByApplication } = await import("./journeys");
    await exitJourneysByApplication(enrollment.application_id as string, "manual");
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

  // A withdrawal vacates a real seat, exactly like a declined or revoked
  // offer. Without this the seat sat empty while families waited on the
  // waitlist for it. Promotion failure never fails the withdrawal.
  if (enrollment.campus_id && enrollment.grade_level_id) {
    try {
      await promoteNextWaitlistCandidate({
        campusId: enrollment.campus_id as string,
        gradeLevelId: enrollment.grade_level_id as string,
        schoolYearId: (enrollment.school_year_id as string | null) ?? null,
        vacatedApplicationId: (enrollment.application_id as string | null) ?? null,
      });
    } catch (err) {
      console.error("[withdrawEnrollment] waitlist promotion failed", err, { enrollmentId });
    }
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
  await requireStaffSession();
  const supabase = createServiceRoleClient();

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
  await requireStaffSession();
  const supabase = createServiceRoleClient();

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
