"use server";

import { revalidatePath } from "next/cache";
import { requireStaffSession } from "@/lib/auth/get-session";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { notifyFamilyStudentEnrolled } from "@/lib/notify";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReenrollmentResult {
  data: { application_id: string; enrollment_id: string } | null;
  error: string | null;
}

interface BulkReenrollmentResult {
  succeeded: number;
  failed: number;
  errors: string[];
}

// ─── Single Re-enrollment ─────────────────────────────────────────────────────

/**
 * Staff-initiated re-enrollment.
 *
 * Bypasses the normal application flow by creating an application at status
 * "offered" and a new enrollment at status "pending".  The family then accepts
 * or declines via /family/reenrollment.
 *
 * Strategy for enrollment_window_id:
 *   1. Look for an open/active window for the campus + new school year.
 *   2. Fall back to any window for that campus + year regardless of status.
 *   3. If none exists the action returns an error — staff must create a window
 *      in settings before initiating re-enrollment.
 */
export async function staffInitiateReenrollment(
  enrollmentId: string,
  newSchoolYearId: string,
  newGradeLevelId: string
): Promise<ReenrollmentResult> {
  await requireStaffSession();
  const supabase = createServiceRoleClient();

  // 1. Fetch the source enrollment to get student/campus/guardian
  const { data: enrollment, error: enrollErr } = await supabase
    .from("enrollment")
    .select(
      `
      id,
      student_id,
      campus_id,
      application_id,
      application:application_id (guardian_id, student:student_id (first_name, last_name))
    `
    )
    .eq("id", enrollmentId)
    .single();

  if (enrollErr || !enrollment) {
    return { data: null, error: enrollErr?.message ?? "Enrollment not found." };
  }

  const row = enrollment as unknown as {
    id: string;
    student_id: string;
    campus_id: string;
    application_id: string | null;
    application: {
      guardian_id: string;
      student: { first_name: string; last_name: string } | null;
    } | null;
  };

  const guardianId = row.application?.guardian_id ?? null;
  if (!guardianId) {
    return {
      data: null,
      error:
        "Cannot initiate re-enrollment: no guardian linked to this enrollment's application.",
    };
  }

  const studentName = row.application?.student
    ? `${row.application.student.first_name} ${row.application.student.last_name}`
    : undefined;

  // 2. Resolve enrollment window for the target campus + school year
  const { data: windowRows } = await supabase
    .from("enrollment_window")
    .select("id, status")
    .eq("campus_id", row.campus_id)
    .eq("school_year_id", newSchoolYearId)
    .order("status", { ascending: true }); // 'open' sorts before 'draft'/'closed'

  const windowRow = (windowRows ?? []).find(
    (w: Record<string, string>) => w.status === "open"
  ) ?? windowRows?.[0] ?? null;

  if (!windowRow) {
    return {
      data: null,
      error:
        "No enrollment window found for this campus and school year. Create one in Settings before re-enrolling.",
    };
  }

  const enrollmentWindowId = (windowRow as Record<string, string>).id;

  // 3. Create a new application at status "offered" — bypasses the normal flow
  const now = new Date().toISOString();
  const { data: newApp, error: appErr } = await supabase
    .from("application")
    .insert({
      enrollment_window_id: enrollmentWindowId,
      student_id: row.student_id,
      campus_id: row.campus_id,
      grade_level_id: newGradeLevelId,
      guardian_id: guardianId,
      status: "offered",
      submitted_at: now,
      source: "reenrollment",
    })
    .select("id")
    .single();

  if (appErr || !newApp) {
    return { data: null, error: appErr?.message ?? "Failed to create application." };
  }

  const applicationId = (newApp as { id: string }).id;

  // 4. Create the new enrollment at "pending" — becomes "active" when family accepts
  const { data: newEnrollment, error: enrollInsertErr } = await supabase
    .from("enrollment")
    .insert({
      student_id: row.student_id,
      campus_id: row.campus_id,
      grade_level_id: newGradeLevelId,
      school_year_id: newSchoolYearId,
      application_id: applicationId,
      status: "pending",
    })
    .select("id")
    .single();

  if (enrollInsertErr || !newEnrollment) {
    // Roll back the application
    await supabase.from("application").delete().eq("id", applicationId);
    return {
      data: null,
      error: enrollInsertErr?.message ?? "Failed to create enrollment.",
    };
  }

  const newEnrollmentId = (newEnrollment as { id: string }).id;

  // 5. Notify the family — non-blocking
  notifyFamilyStudentEnrolled({
    applicationId,
    studentName,
    campusId: row.campus_id,
  }).catch(() => {});

  revalidatePath("/staff/enrollment");
  revalidatePath("/staff/dashboard");
    revalidatePath("/staff/today");

  return {
    data: { application_id: applicationId, enrollment_id: newEnrollmentId },
    error: null,
  };
}

// ─── Bulk Re-enrollment ───────────────────────────────────────────────────────

/**
 * Initiate re-enrollment for multiple active enrollments at once.
 * Grade level is automatically inferred as +1 from the student's current grade.
 */
export async function staffBulkInitiateReenrollment(
  enrollmentIds: string[],
  newSchoolYearId: string
): Promise<BulkReenrollmentResult> {
  await requireStaffSession();
  const supabase = createServiceRoleClient();

  const result: BulkReenrollmentResult = {
    succeeded: 0,
    failed: 0,
    errors: [],
  };

  // Fetch enrollments with their grade info so we can compute next grade
  const { data: enrollments, error: fetchErr } = await supabase
    .from("enrollment")
    .select(
      `
      id,
      student_id,
      campus_id,
      grade_level_id,
      grade_level:grade_level_id (grade)
    `
    )
    .in("id", enrollmentIds)
    .eq("status", "active");

  if (fetchErr || !enrollments || enrollments.length === 0) {
    return {
      succeeded: 0,
      failed: enrollmentIds.length,
      errors: [fetchErr?.message ?? "Failed to fetch enrollments or no active enrollments found."],
    };
  }

  // Fetch all grade levels for the new school year (to map current grade → next grade)
  const campusIds = [
    ...new Set(
      (enrollments as Array<Record<string, unknown>>).map(
        (e) => e.campus_id as string
      )
    ),
  ];

  const { data: gradeLevelRows } = await supabase
    .from("grade_level")
    .select("id, campus_id, grade")
    .in("campus_id", campusIds)
    .eq("school_year_id", newSchoolYearId);

  // Build a lookup: campusId + grade → grade_level_id
  const gradeLookup = new Map<string, string>();
  for (const gl of gradeLevelRows ?? []) {
    const g = gl as Record<string, string>;
    gradeLookup.set(`${g.campus_id}::${g.grade}`, g.id);
  }

  const GRADE_PROGRESSION: Record<string, string> = {
    "6": "7",
    "7": "8",
    "8": "9",
    "9": "10",
    "10": "11",
    "11": "12",
  };

  for (const enrollment of enrollments as Array<Record<string, unknown>>) {
    const gradeLevel = enrollment.grade_level as Record<string, string> | null;
    const currentGrade = gradeLevel?.grade ?? null;

    if (!currentGrade) {
      result.failed++;
      result.errors.push(
        `Enrollment ${enrollment.id as string}: could not determine current grade.`
      );
      continue;
    }

    const nextGrade = GRADE_PROGRESSION[currentGrade] ?? null;
    if (!nextGrade) {
      result.failed++;
      result.errors.push(
        `Enrollment ${enrollment.id as string}: student is in grade 12 — no next grade to re-enroll into.`
      );
      continue;
    }

    const nextGradeLevelId = gradeLookup.get(
      `${enrollment.campus_id as string}::${nextGrade}`
    );

    if (!nextGradeLevelId) {
      result.failed++;
      result.errors.push(
        `Enrollment ${enrollment.id as string}: no grade level record found for grade ${nextGrade} in the target school year.`
      );
      continue;
    }

    const { error } = await staffInitiateReenrollment(
      enrollment.id as string,
      newSchoolYearId,
      nextGradeLevelId
    );

    if (error) {
      result.failed++;
      result.errors.push(`Enrollment ${enrollment.id as string}: ${error}`);
    } else {
      result.succeeded++;
    }
  }

  // Track failed enrollments not present in the active query
  const foundIds = new Set(
    (enrollments as Array<Record<string, unknown>>).map((e) => e.id as string)
  );
  for (const id of enrollmentIds) {
    if (!foundIds.has(id)) {
      result.failed++;
      result.errors.push(
        `Enrollment ${id}: not found or not in active status.`
      );
    }
  }

  return result;
}
