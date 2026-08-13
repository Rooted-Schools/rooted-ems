"use server";

import { revalidatePath } from "next/cache";
import {
  requireStaffSession,
  requireRoleOnCampus,
  hasRoleOnCampus,
  getAccessibleCampusIds,
} from "@/lib/auth/get-session";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { notifyFamilyReenrollmentOffer, notifyFamilyReenrollmentPulse } from "@/lib/notify";
import { createNote } from "@/lib/mutations";
import { REENROLLMENT_PULSE_THROTTLE_DAYS } from "@/lib/queries/reenrollment";

/**
 * True when Postgres says the column itself is absent (42703), i.e. migration
 * 00038_reenrollment_pulse.sql has not been applied to this database yet.
 * Mirrors the same helper in app/api/cron/event-followups/route.ts.
 */
function isMissingColumn(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  return /column .* does not exist/i.test(error.message ?? "");
}

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
 *
 * Campus gate: this creates an application AND an enrollment, so it carries
 * the same bar as the offer actions — enrollment_manager on the campus the
 * source enrollment actually belongs to. It previously ran at requireStaff
 * Session and never compared the row's campus to anything, so a staff member
 * at one campus could re-enroll another campus's students by supplying their
 * enrollment ids.
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

  // The record's real campus, resolved before anything is written.
  await requireRoleOnCampus(row.campus_id, "enrollment_manager");

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

  // 5. Notify the family — non-blocking.
  // The new application sits at "offered": nothing is settled until the
  // family accepts or declines at /family/reenrollment, so this must not be
  // the "officially enrolled" message (which is what it used to send).
  const { data: yearRow } = await supabase
    .from("school_year")
    .select("name")
    .eq("id", newSchoolYearId)
    .single();

  notifyFamilyReenrollmentOffer({
    applicationId,
    studentName,
    campusId: row.campus_id,
    nextSchoolYearName: (yearRow as { name?: string } | null)?.name ?? undefined,
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
 *
 * The campus filter here has to match staffInitiateReenrollment's gate exactly
 * (enrollment_manager on the row's campus). That gate redirects rather than
 * returning, so an unauthorized row reaching it would abort the whole batch
 * mid-run instead of being reported — rows the caller may not act on are
 * filtered out first and counted as failures with an honest reason.
 */
export async function staffBulkInitiateReenrollment(
  enrollmentIds: string[],
  newSchoolYearId: string
): Promise<BulkReenrollmentResult> {
  const session = await requireStaffSession();
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

  // ── Campus scope, per row — the id list is client-supplied ────────────────
  const permitted: Array<Record<string, unknown>> = [];
  for (const enrollment of enrollments as Array<Record<string, unknown>>) {
    if (hasRoleOnCampus(session, enrollment.campus_id as string, "enrollment_manager")) {
      permitted.push(enrollment);
      continue;
    }
    result.failed++;
    result.errors.push(
      `Enrollment ${enrollment.id as string}: you do not have access to this campus.`
    );
  }

  if (permitted.length === 0) {
    // Still account for ids that never came back as active, below.
    const foundActiveIds = new Set(
      (enrollments as Array<Record<string, unknown>>).map((e) => e.id as string)
    );
    for (const id of enrollmentIds) {
      if (!foundActiveIds.has(id)) {
        result.failed++;
        result.errors.push(`Enrollment ${id}: not found or not in active status.`);
      }
    }
    return result;
  }

  // Fetch all grade levels for the new school year (to map current grade → next grade)
  const campusIds = [...new Set(permitted.map((e) => e.campus_id as string))];

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

  for (const enrollment of permitted) {
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

// ─── Intent Pulse — Send ───────────────────────────────────────────────────

interface PulseResult {
  data: null;
  error: string | null;
}

/**
 * Staff-triggered send of the spring intent-to-return pulse to one family.
 * No automated cron sends this — spring timing is a human decision. Throttled
 * to once per REENROLLMENT_PULSE_THROTTLE_DAYS so a family isn't pulsed
 * repeatedly; the check is re-verified here (not just in the UI) using the
 * honest reenrollment_pulse_sent_at timestamp on the enrollment row.
 */
export async function staffSendReenrollmentPulse(enrollmentId: string): Promise<PulseResult> {
  const session = await requireStaffSession();
  const accessibleIds = getAccessibleCampusIds(session);
  const supabase = createServiceRoleClient();

  const { data: enrollment, error: fetchErr } = await supabase
    .from("enrollment")
    .select(
      `
      id,
      campus_id,
      status,
      reenrollment_pulse_sent_at,
      student:student_id (first_name, last_name)
    `
    )
    .eq("id", enrollmentId)
    .single();

  if (fetchErr || !enrollment) {
    // reenrollment_pulse_sent_at ships in migration 00038, which is applied by
    // hand. Until it lands, say so plainly rather than surfacing a raw
    // Postgres error to staff — and never send, because without the column
    // there is no throttle marker and every click would re-text the family.
    if (isMissingColumn(fetchErr)) {
      console.warn(
        "[staffSendReenrollmentPulse] enrollment.reenrollment_pulse_sent_at not present — migration 00038_reenrollment_pulse.sql has not been applied."
      );
      return {
        data: null,
        error: "The re-enrollment pulse isn't available yet — this database is still missing migration 00038.",
      };
    }
    console.error("[staffSendReenrollmentPulse] fetch", fetchErr?.message);
    return { data: null, error: "Enrollment not found." };
  }

  const row = enrollment as unknown as {
    id: string;
    campus_id: string;
    status: string;
    reenrollment_pulse_sent_at: string | null;
    student: { first_name: string; last_name: string } | null;
  };

  // Campus scope: the service-role client bypasses RLS, so the campus check
  // that RLS would have applied has to happen here. An empty accessibleIds
  // means CMO-level access to every campus (see getAccessibleCampusIds).
  if (accessibleIds.length > 0 && !accessibleIds.includes(row.campus_id)) {
    return { data: null, error: "Not authorized for this campus." };
  }

  if (row.status !== "active") {
    return { data: null, error: "This enrollment is no longer active." };
  }

  if (row.reenrollment_pulse_sent_at) {
    const elapsedMs = Date.now() - new Date(row.reenrollment_pulse_sent_at).getTime();
    const throttleMs = REENROLLMENT_PULSE_THROTTLE_DAYS * 24 * 60 * 60 * 1000;
    if (elapsedMs < throttleMs) {
      return {
        data: null,
        error: `A pulse was already sent within the last ${REENROLLMENT_PULSE_THROTTLE_DAYS} days.`,
      };
    }
  }

  const studentName = row.student
    ? `${row.student.first_name} ${row.student.last_name}`
    : undefined;

  // Resolve the next school year's name for the notification copy, if one exists.
  const { data: currentYear } = await supabase
    .from("school_year")
    .select("start_date")
    .eq("is_current", true)
    .maybeSingle();
  let nextSchoolYearName: string | undefined;
  if (currentYear) {
    const { data: nextYear } = await supabase
      .from("school_year")
      .select("name")
      .eq("is_current", false)
      .gt("start_date", currentYear.start_date as string)
      .order("start_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    nextSchoolYearName = (nextYear as { name: string } | null)?.name;
  }

  await notifyFamilyReenrollmentPulse({
    enrollmentId,
    studentName,
    campusId: row.campus_id,
    nextSchoolYearName,
  });

  const { error: stampErr } = await supabase
    .from("enrollment")
    .update({ reenrollment_pulse_sent_at: new Date().toISOString() })
    .eq("id", enrollmentId);

  if (stampErr) {
    // The family has already been contacted at this point. Say exactly that,
    // so nobody re-clicks and texts them twice chasing a "failed" send.
    console.error("[staffSendReenrollmentPulse] stamp", stampErr.message);
    return {
      data: null,
      error: "The pulse was sent, but we could not record it — do not resend; the family has already been contacted.",
    };
  }

  revalidatePath("/staff/enrollment");

  return { data: null, error: null };
}

// ─── Intent Pulse — Mark Contacted ─────────────────────────────────────────

/**
 * Log that staff reached a non-responding family by another channel (phone
 * call, in person). Stored as an internal note on the enrollment, same
 * pattern as application notes (lib/mutations/notes.ts) — cheap, no new
 * table, visible to any staff who open the note history for this entity.
 *
 * The campus is resolved from the enrollment row, never taken from the
 * caller: this runs on the service-role client, so a client-supplied
 * campus_id would let a note be filed against a campus the staff member
 * cannot see. The second parameter is kept only for call-site compatibility
 * and is deliberately ignored.
 */
export async function staffMarkReenrollmentContacted(
  enrollmentId: string,
  _campusId: string,
  note?: string
): Promise<PulseResult> {
  const session = await requireStaffSession();
  const accessibleIds = getAccessibleCampusIds(session);
  const supabase = createServiceRoleClient();

  const { data: enrollment, error: fetchErr } = await supabase
    .from("enrollment")
    .select("id, campus_id")
    .eq("id", enrollmentId)
    .maybeSingle();

  if (fetchErr) {
    console.error("[staffMarkReenrollmentContacted] fetch", fetchErr.message);
    return { data: null, error: "Could not load that enrollment." };
  }
  if (!enrollment) {
    return { data: null, error: "Enrollment not found." };
  }

  const campusId = (enrollment as { campus_id: string | null }).campus_id;
  if (!campusId || (accessibleIds.length > 0 && !accessibleIds.includes(campusId))) {
    return { data: null, error: "Not authorized for this campus." };
  }

  const result = await createNote({
    entity_type: "enrollment",
    entity_id: enrollmentId,
    campus_id: campusId,
    content: note?.trim() || "Contacted about re-enrollment.",
    is_internal: true,
  });

  if (result.error) {
    return { data: null, error: result.error };
  }

  revalidatePath("/staff/enrollment");

  return { data: null, error: null };
}
