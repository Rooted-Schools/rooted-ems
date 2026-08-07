/**
 * Re-enrollment intent pulse — queries.
 *
 * Spring re-enrollment is treated as a first-class campaign with its own
 * lightweight signal, separate from the heavier "staff sends a formal seat
 * offer" flow that already exists (see app/staff/enrollment/re-enrollment-actions.ts
 * and app/family/reenrollment/actions.ts). Before that formal offer goes out,
 * families with an active enrollment in the CURRENT school year are asked a
 * one-tap question — are you coming back next year? — and staff get a real,
 * denominator-honest read on where the network stands plus a follow-up queue
 * for families who haven't answered.
 *
 * Intent lives directly on enrollment (reenrollment_intent /
 * reenrollment_intent_at / reenrollment_pulse_sent_at — see migration 00038).
 * There is no dedicated intent table: the current-year active enrollment IS
 * the record being asked about.
 */

import { createServiceRoleClient } from "@rooted-ems/database/server";

export const REENROLLMENT_PULSE_THROTTLE_DAYS = 7;

// ─── Shared: current + next school year ───────────────────────────────────

interface SchoolYearRef {
  id: string;
  name: string;
}

/**
 * Resolves the current school year (is_current = true) and, when one exists,
 * the next chronological school year (earliest start_date after the current
 * year's). The "next" year is informational only (label in the UI) — the
 * pulse itself is asked against the current year's active enrollment and
 * does not require a next-year window to already exist.
 */
async function resolveTransitionYears(): Promise<{
  current: SchoolYearRef | null;
  next: SchoolYearRef | null;
}> {
  const supabase = createServiceRoleClient();

  const { data: currentYear, error: currentErr } = await supabase
    .from("school_year")
    .select("id, name, start_date")
    .eq("is_current", true)
    .maybeSingle();

  if (currentErr) {
    console.error("[resolveTransitionYears] current", currentErr.message);
    return { current: null, next: null };
  }
  if (!currentYear) return { current: null, next: null };

  const current = { id: currentYear.id as string, name: currentYear.name as string };

  const { data: nextYear, error: nextErr } = await supabase
    .from("school_year")
    .select("id, name")
    .eq("is_current", false)
    .gt("start_date", currentYear.start_date as string)
    .order("start_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (nextErr) console.error("[resolveTransitionYears] next", nextErr.message);

  return {
    current,
    next: nextYear ? { id: nextYear.id as string, name: nextYear.name as string } : null,
  };
}

// ─── Family: pulse candidates ──────────────────────────────────────────────

export interface ReenrollmentPulseCandidate {
  enrollmentId: string;
  studentName: string;
  campusName: string;
  grade: string;
  schoolYearName: string;
  intent: "yes" | "undecided" | "no" | null;
  intentSetAt: string | null;
}

/**
 * Active, current-school-year enrollments for this guardian's students that
 * are eligible for the one-tap intent pulse. Excludes any student who
 * already has a formal re-enrollment seat offer pending (source =
 * 'reenrollment', status = 'offered') — that flow already asks the
 * accept/decline question and takes precedence over the earlier pulse.
 */
export async function getFamilyReenrollmentPulseCandidates(
  userId: string
): Promise<ReenrollmentPulseCandidate[]> {
  const supabase = createServiceRoleClient();

  const { data: guardians } = await supabase
    .from("guardian")
    .select("id")
    .eq("user_id", userId);
  if (!guardians || guardians.length === 0) return [];
  const guardianIds = (guardians as Array<{ id: string }>).map((g) => g.id);

  const { current } = await resolveTransitionYears();
  if (!current) return [];

  const { data, error } = await supabase
    .from("enrollment")
    .select(
      `
      id,
      student_id,
      reenrollment_intent,
      reenrollment_intent_at,
      student:student_id (first_name, last_name),
      campus:campus_id (name),
      grade_level:grade_level_id (grade),
      application:application_id!inner (guardian_id)
    `
    )
    .eq("status", "active")
    .eq("school_year_id", current.id)
    .in("application.guardian_id", guardianIds);

  if (error) {
    console.error("[getFamilyReenrollmentPulseCandidates]", error.message);
    return [];
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Exclude students who already have a pending formal re-enrollment offer —
  // they see that in the offers list above and shouldn't also see the pulse.
  const studentIds = rows.map((r: Record<string, unknown>) => r.student_id as string);
  const { data: offeredApps } = await supabase
    .from("application")
    .select("student_id")
    .in("guardian_id", guardianIds)
    .in("student_id", studentIds)
    .eq("status", "offered")
    .eq("source", "reenrollment");
  const alreadyOfferedStudentIds = new Set(
    (offeredApps ?? []).map((r: Record<string, unknown>) => r.student_id as string)
  );

  return rows
    .filter((row: Record<string, unknown>) => !alreadyOfferedStudentIds.has(row.student_id as string))
    .map((row: Record<string, unknown>) => {
      const student = row.student as Record<string, string> | null;
      const campus = row.campus as Record<string, string> | null;
      const gradeLevel = row.grade_level as Record<string, string> | null;
      return {
        enrollmentId: row.id as string,
        studentName: student ? `${student.first_name} ${student.last_name}` : "Unknown Student",
        campusName: campus?.name ?? "Unknown School",
        grade: gradeLevel?.grade ?? "",
        schoolYearName: current.name,
        intent: (row.reenrollment_intent as "yes" | "undecided" | "no" | null) ?? null,
        intentSetAt: (row.reenrollment_intent_at as string | null) ?? null,
      };
    });
}

// ─── Staff: network-wide pulse stats ───────────────────────────────────────

export interface ReenrollmentStats {
  schoolYearName: string | null;
  nextSchoolYearName: string | null;
  /** Active current-year enrollments in scope — the transition-eligible base. */
  eligible: number;
  respondedYes: number;
  respondedDeciding: number;
  respondedNo: number;
  noResponse: number;
}

const EMPTY_STATS: ReenrollmentStats = {
  schoolYearName: null,
  nextSchoolYearName: null,
  eligible: 0,
  respondedYes: 0,
  respondedDeciding: 0,
  respondedNo: 0,
  noResponse: 0,
};

/** Real counts, honest denominators — no invented rates when there's no data yet. */
export async function getReenrollmentStats(campusIds?: string[]): Promise<ReenrollmentStats> {
  const supabase = createServiceRoleClient();
  const { current, next } = await resolveTransitionYears();
  if (!current) return EMPTY_STATS;

  let query = supabase
    .from("enrollment")
    .select("reenrollment_intent")
    .eq("status", "active")
    .eq("school_year_id", current.id);
  if (campusIds && campusIds.length > 0) query = query.in("campus_id", campusIds);

  const { data, error } = await query;
  if (error) {
    console.error("[getReenrollmentStats]", error.message);
    return { ...EMPTY_STATS, schoolYearName: current.name, nextSchoolYearName: next?.name ?? null };
  }

  const rows = data ?? [];
  let respondedYes = 0;
  let respondedDeciding = 0;
  let respondedNo = 0;
  for (const row of rows as Array<{ reenrollment_intent: string | null }>) {
    if (row.reenrollment_intent === "yes") respondedYes++;
    else if (row.reenrollment_intent === "undecided") respondedDeciding++;
    else if (row.reenrollment_intent === "no") respondedNo++;
  }

  return {
    schoolYearName: current.name,
    nextSchoolYearName: next?.name ?? null,
    eligible: rows.length,
    respondedYes,
    respondedDeciding,
    respondedNo,
    noResponse: rows.length - respondedYes - respondedDeciding - respondedNo,
  };
}

// ─── Staff: follow-up queue (no response) ──────────────────────────────────

export interface ReenrollmentFollowUpRow {
  enrollmentId: string;
  campusId: string;
  studentName: string;
  campusName: string;
  grade: string;
  guardianName: string | null;
  guardianPhone: string | null;
  lastPulsedAt: string | null;
  /** false when pulsed within REENROLLMENT_PULSE_THROTTLE_DAYS — mirrors the server-side check in staffSendReenrollmentPulse. */
  canPulse: boolean;
}

export async function getReenrollmentFollowUpQueue(
  campusIds?: string[]
): Promise<ReenrollmentFollowUpRow[]> {
  const supabase = createServiceRoleClient();
  const { current } = await resolveTransitionYears();
  if (!current) return [];

  let query = supabase
    .from("enrollment")
    .select(
      `
      id, campus_id, reenrollment_pulse_sent_at,
      student:student_id (first_name, last_name),
      campus:campus_id (name),
      grade_level:grade_level_id (grade),
      application:application_id (
        guardian:guardian_id (first_name, last_name, phone)
      )
    `
    )
    .eq("status", "active")
    .eq("school_year_id", current.id)
    .is("reenrollment_intent", null)
    .order("reenrollment_pulse_sent_at", { ascending: true, nullsFirst: true });
  if (campusIds && campusIds.length > 0) query = query.in("campus_id", campusIds);

  const { data, error } = await query;
  if (error) {
    console.error("[getReenrollmentFollowUpQueue]", error.message);
    return [];
  }

  const throttleMs = REENROLLMENT_PULSE_THROTTLE_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();

  return (data ?? []).map((row: Record<string, unknown>) => {
    const student = row.student as Record<string, string> | null;
    const campus = row.campus as Record<string, string> | null;
    const gradeLevel = row.grade_level as Record<string, string> | null;
    const application = row.application as Record<string, unknown> | null;
    const guardian = application?.guardian as Record<string, string> | null;
    const lastPulsedAt = (row.reenrollment_pulse_sent_at as string | null) ?? null;
    const canPulse = !lastPulsedAt || now - new Date(lastPulsedAt).getTime() >= throttleMs;

    return {
      enrollmentId: row.id as string,
      campusId: row.campus_id as string,
      studentName: student ? `${student.first_name} ${student.last_name}` : "Unknown Student",
      campusName: campus?.name ?? "Unknown School",
      grade: gradeLevel?.grade ?? "",
      guardianName: guardian ? `${guardian.first_name} ${guardian.last_name}` : null,
      guardianPhone: guardian?.phone ?? null,
      lastPulsedAt,
      canPulse,
    };
  });
}
