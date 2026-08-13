import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";
import { PIPELINE_STAGES, prettifyType } from "@/lib/application-helpers";

// ─── Student Types ─────────────────────────────────────

export interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  grade: string;
  campus_name: string;
  status: string;
  guardian_name: string;
  guardian_email: string;
  application_id: string | null;
}

// ─── Lottery Types ──────────────────────────────────────

export interface LotteryRunRow {
  id: string;
  name: string;
  campus_name: string;
  grade: string;
  status: string;
  total_applicants: number;
  total_seats: number;
  created_at: string;
}

// ─── Offer Types ────────────────────────────────────────

export interface OfferRow {
  id: string;
  student_name: string;
  grade: string;
  campus_name: string;
  status: string;
  offered_at: string;
  expires_at: string;
  // IDs for enrollment conversion
  application_id: string;
  campus_id: string;
  grade_level_id: string;
  student_id: string;
  school_year_id: string;
  has_enrollment: boolean;
}

export interface OfferStats {
  total: number;
  pending: number;
  accepted: number;
  declined_or_expired: number;
}

// ─── Waitlist Types ─────────────────────────────────────

export interface WaitlistEntry {
  id: string;
  student_name: string;
  grade: string;
  campus_name: string;
  position: number;
  added_at: string;
}

export interface WaitlistCampusCount {
  campus_name: string;
  count: number;
}

// ─── Enrollment Types ───────────────────────────────────

export interface EnrollmentRow {
  id: string;
  application_id: string | null;
  student_name: string;
  grade: string;
  campus_name: string;
  status: string;
  enrolled_at: string | null;
  sis_id: string | null;
  packet_status: string | null; // null = no packet yet
}

export interface EnrollmentStats {
  total: number;
  active: number;
  sis_synced: number;
  withdrawn: number;
}

// ─── Communication Types ────────────────────────────────

export interface CommunicationRow {
  id: string;
  subject: string | null;
  channel: string;
  status: string;
  sent_at: string | null;
  recipient_count: number;
  recipient_address: string | null;
}

export interface CommunicationStats {
  total_sent: number;
  delivered: number;
  queued: number;
  failed: number;
}

// ─── Settings Types ─────────────────────────────────────

export interface EnrollmentWindowRow {
  id: string;
  name: string;
  open_date: string;
  close_date: string;
  /** Raw ISO timestamps, for populating an edit form's date inputs — open_date/close_date above are display-formatted. */
  open_date_iso: string;
  close_date_iso: string;
  status: string;
  campus_name: string;
}

export interface StaffUserRow {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  initials: string;
  campus_name: string;
  campus_id: string;
}

// ─── Document Queue Types & Query ───────────────────────

export interface PendingDocumentRow {
  id: string;
  document_type: string;
  file_name: string;
  file_size: number | null;
  status: string;
  created_at: string;
  student_name: string;
  guardian_name: string;
  guardian_email: string;
  campus_name: string;
  campus_id: string;
  application_id: string;
}

export interface DocumentQueueStats {
  total_pending: number;
  total_today: number;
  oldest_pending_days: number | null;
}

/**
 * Fetch all documents in pending status for staff review.
 * Scoped to the campuses the staff member can access.
 */
export async function getStaffPendingDocuments(
  campusIds?: string[]
): Promise<{ rows: PendingDocumentRow[]; stats: DocumentQueueStats }> {
  // Guard: if no campus scope is provided, refuse to return cross-campus data
  if (!campusIds || campusIds.length === 0) {
    return { rows: [], stats: { total_pending: 0, total_today: 0, oldest_pending_days: null } };
  }

  // Use service-role client so the application/campus join is not blocked by RLS
  const supabase = createServiceRoleClient();

  // Apply campus filter at the DB level via PostgREST's joined-column filter syntax
  const { data, error } = await supabase
    .from("document")
    .select(`
      id, document_type, file_name, file_size, status, created_at,
      application:application_id (
        id, campus_id,
        campus:campus_id (name),
        student:student_id (first_name, last_name),
        guardian:guardian_id (first_name, last_name, email)
      )
    `)
    .eq("status", "pending")
    .filter("application.campus_id", "in", `(${campusIds.map(id => `"${id}"`).join(",")})`)
    .order("created_at", { ascending: true }); // oldest first — FIFO queue

  if (error) {
    console.error("[getStaffPendingDocuments]", error.message);
    return { rows: [], stats: { total_pending: 0, total_today: 0, oldest_pending_days: null } };
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const rows = (data ?? [])
    // PostgREST returns rows where the join didn't match with application=null; exclude them
    .filter((row: Record<string, unknown>) => row.application !== null)
    .map((row: Record<string, unknown>) => {
      const app = row.application as unknown as Record<string, unknown> | null;
      const campus = app?.campus as unknown as Record<string, string> | null;
      const student = app?.student as Record<string, string> | null;
      const guardian = app?.guardian as Record<string, string> | null;

      return {
        id: row.id as string,
        document_type: row.document_type as string,
        file_name: row.file_name as string,
        file_size: row.file_size as number | null,
        status: row.status as string,
        created_at: row.created_at as string,
        student_name: student ? `${student.first_name} ${student.last_name}` : "Unknown",
        guardian_name: guardian ? `${guardian.first_name} ${guardian.last_name}` : "",
        guardian_email: guardian?.email ?? "",
        campus_name: campus?.name ?? "",
        campus_id: (app?.campus_id as string) ?? "",
        application_id: (app?.id as string) ?? "",
      };
    });

  // Compute stats
  const totalToday = rows.filter(
    (r) => new Date(r.created_at).getTime() >= todayStart
  ).length;

  let oldestDays: number | null = null;
  if (rows.length > 0) {
    const oldest = new Date(rows[0].created_at).getTime();
    oldestDays = Math.floor((now.getTime() - oldest) / (1000 * 60 * 60 * 24));
  }

  return {
    rows,
    stats: {
      total_pending: rows.length,
      total_today: totalToday,
      oldest_pending_days: oldestDays,
    },
  };
}

// ─── Lottery Queries ────────────────────────────────────

export async function getStaffLotteryRuns(campusIds?: string[]): Promise<LotteryRunRow[]> {
  const supabase = await createServerClient();

  let query = supabase
    .from("lottery_run")
    .select(`
      id, status, total_applicants, total_seats, created_at,
      campus:campus_id (name),
      grade_level:grade_level_id (grade),
      enrollment_window:enrollment_window_id (name)
    `)
    .order("created_at", { ascending: false });

  if (campusIds && campusIds.length > 0) {
    query = query.in("campus_id", campusIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getStaffLotteryRuns]", error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const campus = row.campus as Record<string, string> | null;
    const grade = row.grade_level as Record<string, string> | null;
    const window = row.enrollment_window as Record<string, string> | null;

    return {
      id: row.id as string,
      name: window?.name ?? "Lottery Run",
      campus_name: campus?.name ?? "",
      grade: grade?.grade ? `Grade ${grade.grade}` : "",
      status: row.status as string,
      total_applicants: (row.total_applicants as number) ?? 0,
      total_seats: (row.total_seats as number) ?? 0,
      created_at: new Date(row.created_at as string).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    };
  });
}

// ─── Lottery Detail Types ───────────────────────────────

export interface LotteryRunDetail {
  id: string;
  name: string;
  campus: string;
  grade: string;
  schoolYear: string;
  status: string;
  applicants: number;
  seats: number;
  randomSeed: string | null;
  runNumber: number;
  executedBy: string | null;
  executedAt: string | null;
  createdAt: string;
  updatedAt: string;
  ruleSet: {
    name: string;
    siblingPreference: boolean;
    priorityTiers: string[];
  };
}

export interface LotteryEntrant {
  id: string;
  applicationId: string;
  studentName: string;
  guardianName: string;
  priorityTier: number;
  randomNumber: number | null;
  finalRank: number | null;
  result: "offered" | "waitlisted" | "pending";
  siblingInSchool: boolean;
}

// ─── Lottery Detail Query ───────────────────────────────

export async function getStaffLotteryDetail(
  runId: string
): Promise<{ run: LotteryRunDetail | null; entrants: LotteryEntrant[] }> {
  // Service role on purpose: staff-only page (requireStaffSession), scoped by
  // runId. The entrants query joins lottery_entry -> application -> guardian,
  // which trips the same latent RLS recursion (application policy -> guardian
  // policy -> application policy) documented in lib/queries/recruitment-intel.ts.
  const supabase = createServiceRoleClient();

  // Fetch lottery run with related data
  const { data: runData, error: runError } = await supabase
    .from("lottery_run")
    .select(`
      id, status, run_number, random_seed,
      total_applicants, total_seats,
      executed_at, created_at, updated_at, notes,
      campus:campus_id (name),
      grade_level:grade_level_id (grade),
      enrollment_window:enrollment_window_id (name),
      rule_set:lottery_rule_set_id (name, sibling_preference, priority_tiers),
      executor:executed_by (full_name)
    `)
    .eq("id", runId)
    .single();

  if (runError || !runData) {
    console.error("[getStaffLotteryDetail]", runError?.message);
    return { run: null, entrants: [] };
  }

  const row = runData as Record<string, unknown>;
  const campus = row.campus as Record<string, string> | null;
  const grade = row.grade_level as Record<string, string> | null;
  const window = row.enrollment_window as Record<string, string> | null;
  const ruleSet = row.rule_set as unknown as Record<string, unknown> | null;
  const executor = row.executor as unknown as Record<string, string> | null;

  const priorityTiersRaw = (ruleSet?.priority_tiers ?? []) as unknown[];
  const priorityTiers: string[] = priorityTiersRaw.map((t) =>
    typeof t === "string" ? t : JSON.stringify(t)
  );

  const run: LotteryRunDetail = {
    id: row.id as string,
    name: window?.name ?? "Lottery Run",
    campus: campus?.name ?? "",
    grade: grade?.grade ? `Grade ${grade.grade}` : "",
    schoolYear: window?.name ?? "",
    status: row.status as string,
    applicants: (row.total_applicants as number) ?? 0,
    seats: (row.total_seats as number) ?? 0,
    randomSeed: (row.random_seed as string) ?? null,
    runNumber: (row.run_number as number) ?? 0,
    executedBy: executor?.full_name ?? null,
    executedAt: (row.executed_at as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    ruleSet: {
      name: (ruleSet?.name as string) ?? "Default Rules",
      siblingPreference: (ruleSet?.sibling_preference as boolean) ?? true,
      priorityTiers,
    },
  };

  // Fetch lottery entries with student + guardian info
  const { data: entryData, error: entryError } = await supabase
    .from("lottery_entry")
    .select(`
      id, priority_tier, random_number, final_rank, is_selected,
      application:application_id (
        id, has_sibling_enrolled,
        student:student_id (first_name, last_name),
        guardian:guardian_id (first_name, last_name)
      )
    `)
    .eq("lottery_run_id", runId)
    .order("final_rank", { ascending: true, nullsFirst: false });

  if (entryError) {
    console.error("[getStaffLotteryDetail:entries]", entryError.message);
    return { run, entrants: [] };
  }

  const totalSeats = run.seats;
  const entrants: LotteryEntrant[] = (entryData ?? []).map(
    (e: Record<string, unknown>) => {
      const app = e.application as unknown as Record<string, unknown> | null;
      const student = app?.student as unknown as Record<string, string> | null;
      const guardian = app?.guardian as unknown as Record<string, string> | null;
      const rank = e.final_rank as number | null;

      let result: "offered" | "waitlisted" | "pending" = "pending";
      if (rank !== null) {
        result = rank <= totalSeats ? "offered" : "waitlisted";
      }
      if (e.is_selected) result = "offered";

      return {
        id: e.id as string,
        applicationId: (app?.id as string) ?? "",
        studentName: student
          ? `${student.first_name} ${student.last_name}`
          : "Unknown",
        guardianName: guardian
          ? `${guardian.first_name} ${guardian.last_name}`
          : "",
        priorityTier: (e.priority_tier as number) ?? 0,
        randomNumber: (e.random_number as number) ?? null,
        finalRank: rank,
        result,
        siblingInSchool: (app as any)?.has_sibling_enrolled ?? false,
      };
    }
  );

  return { run, entrants };
}

// ─── Lottery Run Report ─────────────────────────────────
//
// Staff/authorizer-facing print report (LD-4). Distinct from
// getStaffLotteryDetail above because it needs campus_id (for the access
// check), finalized_at, and — most importantly — the immutable
// lottery_entry_snapshot rows rather than the live-editable lottery_entry
// table, since this report is the evidence trail handed to an authorizer.
// Snapshot rows only exist once a run has been finalized (see
// finalizeLotteryRun in lib/mutations/lottery.ts).

const DEFAULT_TIER_LABEL = "Sibling enrolled at campus";

/**
 * Defensively pull tier labels out of a rule set's priority_tiers JSONB.
 * Falls back to the single sibling-priority label when the array is
 * missing, empty, or malformed. Mirrors the extraction used in
 * app/(public)/how-the-lottery-works/page.tsx and lib/queries/family.ts.
 */
function extractTierLabels(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) return [DEFAULT_TIER_LABEL];
  const labels = raw
    .map((item) => {
      const label = (item as Record<string, unknown> | null)?.label;
      return typeof label === "string" && label.trim() ? label : null;
    })
    .filter((label): label is string => label !== null);
  return labels.length > 0 ? labels : [DEFAULT_TIER_LABEL];
}

export interface LotteryReportRun {
  id: string;
  campusId: string;
  campusName: string;
  grade: string;
  runNumber: number;
  status: string;
  totalApplicants: number;
  totalSeats: number;
  randomSeed: string | null;
  seedFingerprint: string | null;
  executedByName: string | null;
  executedAt: string | null;
  finalizedAt: string | null;
}

export interface LotteryReportEntrant {
  studentName: string;
  priorityTier: number;
  randomNumber: number;
  finalRank: number;
  isSelected: boolean;
}

export async function getStaffLotteryReport(runId: string): Promise<{
  run: LotteryReportRun | null;
  tierLabels: string[];
  entrants: LotteryReportEntrant[];
}> {
  const supabase = await createServerClient();

  const { data: runData, error: runError } = await supabase
    .from("lottery_run")
    .select(`
      id, status, run_number, random_seed,
      total_applicants, total_seats,
      campus_id, executed_at, finalized_at,
      campus:campus_id (name),
      grade_level:grade_level_id (grade),
      rule_set:lottery_rule_set_id (priority_tiers),
      executor:executed_by (full_name)
    `)
    .eq("id", runId)
    .single();

  if (runError || !runData) {
    console.error("[getStaffLotteryReport]", runError?.message);
    return { run: null, tierLabels: [], entrants: [] };
  }

  const row = runData as Record<string, unknown>;
  const campus = row.campus as Record<string, string> | null;
  const grade = row.grade_level as Record<string, string> | null;
  const ruleSet = row.rule_set as unknown as Record<string, unknown> | null;
  const executor = row.executor as unknown as Record<string, string> | null;
  const randomSeed = (row.random_seed as string) ?? null;

  const tierLabels = extractTierLabels(ruleSet?.priority_tiers);

  const run: LotteryReportRun = {
    id: row.id as string,
    campusId: row.campus_id as string,
    campusName: campus?.name ?? "",
    grade: grade?.grade ? `Grade ${grade.grade}` : "",
    runNumber: (row.run_number as number) ?? 0,
    status: row.status as string,
    totalApplicants: (row.total_applicants as number) ?? 0,
    totalSeats: (row.total_seats as number) ?? 0,
    randomSeed,
    seedFingerprint: randomSeed ? randomSeed.slice(0, 8) : null,
    executedByName: executor?.full_name ?? null,
    executedAt: (row.executed_at as string) ?? null,
    finalizedAt: (row.finalized_at as string) ?? null,
  };

  const { data: snapData, error: snapError } = await supabase
    .from("lottery_entry_snapshot")
    .select("student_name, priority_tier, random_number, final_rank, is_selected")
    .eq("lottery_run_id", runId)
    .order("final_rank", { ascending: true });

  if (snapError) {
    console.error("[getStaffLotteryReport:snapshots]", snapError.message);
    return { run, tierLabels, entrants: [] };
  }

  const entrants: LotteryReportEntrant[] = (snapData ?? []).map(
    (e: Record<string, unknown>) => ({
      studentName: (e.student_name as string) ?? "Unknown",
      priorityTier: (e.priority_tier as number) ?? 0,
      randomNumber: (e.random_number as number) ?? 0,
      finalRank: (e.final_rank as number) ?? 0,
      isSelected: (e.is_selected as boolean) ?? false,
    })
  );

  return { run, tierLabels, entrants };
}

// ─── Offer Queries ──────────────────────────────────────

export async function getStaffOffers(campusIds?: string[]): Promise<{ offers: OfferRow[]; stats: OfferStats }> {
  // Service role on purpose: staff-only page (requireStaffSession), campus-
  // scoped by campusIds. Joins offer -> application -> student, which trips
  // the same latent RLS recursion (application policy -> guardian policy ->
  // application policy) documented in lib/queries/recruitment-intel.ts.
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("offer")
    .select(`
      id, status, offered_at, expires_at,
      application_id, campus_id, grade_level_id,
      application:application_id (
        student_id,
        enrollment_window:enrollment_window_id (school_year_id),
        student:student_id (first_name, last_name)
      ),
      campus:campus_id (name),
      grade_level:grade_level_id (grade)
    `)
    .order("offered_at", { ascending: false });

  if (campusIds && campusIds.length > 0) {
    query = query.in("campus_id", campusIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getStaffOffers]", error.message);
    return { offers: [], stats: { total: 0, pending: 0, accepted: 0, declined_or_expired: 0 } };
  }

  const rows = data ?? [];

  // Check which accepted offers already have enrollments
  const acceptedAppIds = rows
    .filter((r: Record<string, unknown>) => r.status === "accepted")
    .map((r: Record<string, unknown>) => r.application_id as string);

  let enrolledAppIds = new Set<string>();
  if (acceptedAppIds.length > 0) {
    const { data: enrollments } = await supabase
      .from("enrollment")
      .select("application_id")
      .in("application_id", acceptedAppIds);
    enrolledAppIds = new Set((enrollments ?? []).map((e: Record<string, unknown>) => e.application_id as string));
  }

  const offers: OfferRow[] = rows.map((row: Record<string, unknown>) => {
    const app = row.application as unknown as Record<string, unknown> | null;
    const student = app?.student as unknown as Record<string, string> | null;
    const campus = row.campus as Record<string, string> | null;
    const grade = row.grade_level as Record<string, string> | null;

    return {
      id: row.id as string,
      student_name: student
        ? `${student.first_name} ${student.last_name}`
        : "Unknown",
      grade: grade?.grade ? `Grade ${grade.grade}` : "",
      campus_name: campus?.name ?? "",
      status: row.status as string,
      offered_at: new Date(row.offered_at as string).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      expires_at: new Date(row.expires_at as string).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      application_id: row.application_id as string,
      campus_id: row.campus_id as string,
      grade_level_id: row.grade_level_id as string,
      student_id: (app?.student_id as string) ?? "",
      school_year_id: ((app?.enrollment_window as Record<string, unknown> | null)?.school_year_id as string) ?? "",
      has_enrollment: enrolledAppIds.has(row.application_id as string),
    };
  });

  const stats: OfferStats = {
    total: rows.length,
    pending: rows.filter((r: Record<string, unknown>) => r.status === "pending").length,
    accepted: rows.filter((r: Record<string, unknown>) => r.status === "accepted").length,
    declined_or_expired: rows.filter(
      (r: Record<string, unknown>) => r.status === "declined" || r.status === "expired"
    ).length,
  };

  return { offers, stats };
}

// ─── Waitlist Queries ───────────────────────────────────

export async function getStaffWaitlist(campusIds?: string[]): Promise<{
  entries: WaitlistEntry[];
  campusCounts: WaitlistCampusCount[];
}> {
  if (!campusIds || campusIds.length === 0) {
    return { entries: [], campusCounts: [] };
  }

  // Service role on purpose: staff-only page (requireStaffSession), campus-
  // scoped by the campusIds guard above. Joins waitlist_position ->
  // application -> student, which trips the same latent RLS recursion
  // (application policy -> guardian policy -> application policy) documented
  // in lib/queries/recruitment-intel.ts.
  const supabase = createServiceRoleClient();

  // Push campus filter into the DB query via PostgREST joined-column filter
  const { data, error } = await supabase
    .from("waitlist_position")
    .select(`
      id, position_number, added_at,
      waitlist:waitlist_id (
        campus_id,
        campus:campus_id (name),
        grade_level:grade_level_id (grade)
      ),
      application:application_id (
        student:student_id (first_name, last_name)
      )
    `)
    .is("removed_at", null)
    .filter("waitlist.campus_id", "in", `(${campusIds.map(id => `"${id}"`).join(",")})`)
    .order("position_number", { ascending: true });

  if (error) {
    console.error("[getStaffWaitlist]", error.message);
    return { entries: [], campusCounts: [] };
  }

  // PostgREST returns rows where the join didn't match with waitlist=null; exclude them
  const rows = (data ?? []).filter(
    (row: Record<string, unknown>) => row.waitlist !== null
  );

  const entries: WaitlistEntry[] = rows.map((row: Record<string, unknown>) => {
    const wl = row.waitlist as unknown as Record<string, unknown> | null;
    const campus = wl?.campus as unknown as Record<string, string> | null;
    const grade = wl?.grade_level as unknown as Record<string, string> | null;
    const app = row.application as unknown as Record<string, unknown> | null;
    const student = app?.student as unknown as Record<string, string> | null;

    return {
      id: row.id as string,
      student_name: student
        ? `${student.first_name} ${student.last_name}`
        : "Unknown",
      grade: grade?.grade ? `Grade ${grade.grade}` : "",
      campus_name: campus?.name ?? "",
      position: (row.position_number as number) ?? 0,
      added_at: new Date(row.added_at as string).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    };
  });

  // Aggregate counts by campus
  const countMap: Record<string, number> = {};
  for (const e of entries) {
    countMap[e.campus_name] = (countMap[e.campus_name] ?? 0) + 1;
  }

  // Get accessible campuses so we show zeros too
  let campusQuery = supabase.from("campus").select("name").order("name");
  if (campusIds && campusIds.length > 0) {
    campusQuery = campusQuery.in("id", campusIds);
  }
  const { data: campuses } = await campusQuery;

  const campusCounts: WaitlistCampusCount[] = (campuses ?? []).map(
    (c: Record<string, string>) => ({
      campus_name: c.name,
      count: countMap[c.name] ?? 0,
    })
  );

  return { entries, campusCounts };
}

// ─── Enrollment Queries ─────────────────────────────────

export async function getStaffEnrollments(campusIds?: string[]): Promise<{
  enrollments: EnrollmentRow[];
  stats: EnrollmentStats;
}> {
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("enrollment")
    .select(`
      id, status, enrolled_at, sis_student_id, application_id,
      student:student_id (first_name, last_name),
      campus:campus_id (name),
      grade_level:grade_level_id (grade),
      registration_packet (status)
    `)
    .order("enrolled_at", { ascending: false, nullsFirst: false });

  if (campusIds && campusIds.length > 0) {
    query = query.in("campus_id", campusIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getStaffEnrollments]", error.message);
    return {
      enrollments: [],
      stats: { total: 0, active: 0, sis_synced: 0, withdrawn: 0 },
    };
  }

  const rows = data ?? [];

  const enrollments: EnrollmentRow[] = rows.map((row: Record<string, unknown>) => {
    const student = row.student as unknown as Record<string, string> | null;
    const campus = row.campus as Record<string, string> | null;
    const grade = row.grade_level as Record<string, string> | null;
    const packet = row.registration_packet as Array<Record<string, string>> | Record<string, string> | null;
    // Supabase returns 1:1 FK joins as object or array depending on RLS; handle both
    const packetObj = Array.isArray(packet) ? packet[0] : packet;

    return {
      id: row.id as string,
      application_id: (row.application_id as string) ?? null,
      student_name: student
        ? `${student.first_name} ${student.last_name}`
        : "Unknown",
      grade: grade?.grade ? `Grade ${grade.grade}` : "",
      campus_name: campus?.name ?? "",
      status: row.status as string,
      enrolled_at: row.enrolled_at
        ? new Date(row.enrolled_at as string).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : null,
      sis_id: (row.sis_student_id as string) ?? null,
      packet_status: packetObj?.status ?? null,
    };
  });

  const stats: EnrollmentStats = {
    total: rows.length,
    active: rows.filter((r: Record<string, unknown>) => r.status === "active").length,
    sis_synced: rows.filter((r: Record<string, unknown>) => !!(r.sis_student_id as string)).length,
    withdrawn: rows.filter((r: Record<string, unknown>) => r.status === "withdrawn").length,
  };

  return { enrollments, stats };
}

// ─── Registration Packet Types & Queries ───────────────

export interface RegistrationItemRow {
  id: string;
  item_type: string;
  status: string; // pending | submitted | verified
  signed_at: string | null;
  verified_at: string | null;
  verified_by: string | null;       // UUID
  verified_by_name: string | null;  // resolved full name from user_profile
  data: Record<string, unknown>;
}

export interface RegistrationPacketDetail {
  packet_id: string;
  packet_status: string; // pending | in_progress | submitted | complete
  started_at: string | null;
  submitted_at: string | null;
  verified_at: string | null;
  items: RegistrationItemRow[];
}

/**
 * Fetch the registration packet for a given application (via enrollment).
 * Returns null if no enrollment or packet exists yet.
 */
export async function getRegistrationPacketForApplication(
  applicationId: string
): Promise<RegistrationPacketDetail | null> {
  const supabase = createServiceRoleClient();

  // Find enrollment for this application
  const { data: enrollment, error: enrollError } = await supabase
    .from("enrollment")
    .select("id")
    .eq("application_id", applicationId)
    .maybeSingle();

  if (enrollError) {
    console.error("[getRegistrationPacketForApplication] enrollment", enrollError.message);
    return null;
  }
  if (!enrollment) return null;

  // Fetch packet
  const { data: packet, error: packetError } = await supabase
    .from("registration_packet")
    .select("id, status, started_at, submitted_at, verified_at")
    .eq("enrollment_id", enrollment.id)
    .maybeSingle();

  if (packetError) {
    console.error("[getRegistrationPacketForApplication] packet", packetError.message);
    return null;
  }
  if (!packet) return null;

  // Fetch items — join verified_by to user_profile for display name
  const { data: items, error: itemsError } = await supabase
    .from("registration_item")
    .select("id, item_type, status, signed_at, verified_at, verified_by, data, verifier:verified_by(full_name)")
    .eq("enrollment_id", enrollment.id)
    .order("item_type");

  if (itemsError) {
    console.error("[getRegistrationPacketForApplication] items", itemsError.message);
    return null;
  }

  return {
    packet_id: packet.id as string,
    packet_status: packet.status as string,
    started_at: (packet.started_at as string) ?? null,
    submitted_at: (packet.submitted_at as string) ?? null,
    verified_at: (packet.verified_at as string) ?? null,
    items: (items ?? []).map((row: Record<string, unknown>) => {
      const verifier = row.verifier as Record<string, unknown> | null;
      return {
        id: row.id as string,
        item_type: row.item_type as string,
        status: row.status as string,
        signed_at: (row.signed_at as string) ?? null,
        verified_at: (row.verified_at as string) ?? null,
        verified_by: (row.verified_by as string) ?? null,
        verified_by_name: (verifier?.full_name as string) ?? null,
        data: (row.data as Record<string, unknown>) ?? {},
      };
    }),
  };
}

// ─── Message Template Types ─────────────────────────────

export interface MessageTemplateRow {
  id: string;
  name: string;
  subject: string | null;
  body: string;
  channel: string;
  merge_fields: string[];
  is_active: boolean;
}

// ─── Communication Queries ──────────────────────────────

export async function getStaffMessageTemplates(): Promise<MessageTemplateRow[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("message_template")
    .select("id, name, subject, body, channel, merge_fields, is_active")
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error("[getStaffMessageTemplates]", error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name: row.name as string,
    subject: (row.subject as string) ?? null,
    body: row.body as string,
    channel: row.channel as string,
    merge_fields: (row.merge_fields as string[]) ?? [],
    is_active: (row.is_active as boolean) ?? true,
  }));
}

export async function getNotificationRecipients(
  campusIds?: string[],
  statusFilter?: string
): Promise<
  { userId: string; name: string; email: string; status: string; campus: string; smsEligible: boolean }[]
> {
  // Service role on purpose: staff-only page (requireStaffSession), campus-
  // scoped by campusIds. Joins application -> guardian directly, the exact
  // recursive pair (application policy -> guardian policy -> application
  // policy) documented in lib/queries/recruitment-intel.ts.
  const supabase = createServiceRoleClient();
  const hasCampusFilter = campusIds && campusIds.length > 0;

  // Get all families with active applications (those who have a user_profile via guardian)
  let query = supabase
    .from("application")
    .select(`
      status,
      guardian:guardian_id (
        user_id,
        first_name,
        last_name,
        email,
        phone,
        sms_consent
      ),
      campus:campus_id (name)
    `)
    .not("status", "eq", "draft");

  if (hasCampusFilter) query = query.in("campus_id", campusIds);
  if (statusFilter && statusFilter !== "all") query = query.eq("status", statusFilter);

  const { data, error } = await query;

  if (error) {
    console.error("[getNotificationRecipients]", error.message);
    return [];
  }

  // Deduplicate by user_id
  const seen = new Set<string>();
  const recipients: { userId: string; name: string; email: string; status: string; campus: string; smsEligible: boolean }[] = [];

  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const guardian = row.guardian as unknown as Record<string, unknown> | null;
    const campus = row.campus as Record<string, string> | null;
    const userId = guardian?.user_id as string | undefined;
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);

    recipients.push({
      userId,
      name: `${(guardian?.first_name as string) ?? ""} ${(guardian?.last_name as string) ?? ""}`.trim(),
      email: (guardian?.email as string) ?? "",
      status: row.status as string,
      campus: campus?.name ?? "",
      // Real send-time eligibility (phone on file AND opted in) — not just
      // "has a phone" — so the UI's reach count doesn't overstate itself.
      smsEligible: Boolean(guardian?.phone) && guardian?.sms_consent === true,
    });
  }

  return recipients;
}

export async function getStaffCommunications(campusIds?: string[]): Promise<{
  messages: CommunicationRow[];
  stats: CommunicationStats;
}> {
  const supabase = await createServerClient();

  let q = supabase
    .from("communication_log")
    .select("id, subject, channel, status, sent_at, recipient_address, recipient_count")
    .order("created_at", { ascending: false })
    .limit(100);

  if (campusIds && campusIds.length > 0) {
    // Use .or() so rows where campus_id IS NULL (system-generated) are always visible
    q = q.or(`campus_id.in.(${campusIds.join(",")}),campus_id.is.null`);
  }

  const { data, error } = await q;

  if (error) {
    console.error("[getStaffCommunications]", error.message);
    return {
      messages: [],
      stats: { total_sent: 0, delivered: 0, queued: 0, failed: 0 },
    };
  }

  const rows = data ?? [];

  const messages: CommunicationRow[] = rows.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    subject: (row.subject as string) ?? null,
    channel: row.channel as string,
    status: row.status as string,
    sent_at: row.sent_at
      ? new Date(row.sent_at as string).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null,
    recipient_count: (row.recipient_count as number) ?? 1,
    recipient_address: (row.recipient_address as string) ?? null,
  }));

  const stats: CommunicationStats = {
    total_sent: rows.filter(
      (r: Record<string, unknown>) => r.status === "sent" || r.status === "delivered"
    ).length,
    delivered: rows.filter((r: Record<string, unknown>) => r.status === "delivered").length,
    queued: rows.filter((r: Record<string, unknown>) => r.status === "queued").length,
    failed: rows.filter(
      (r: Record<string, unknown>) => r.status === "failed" || r.status === "bounced"
    ).length,
  };

  return { messages, stats };
}

// ─── Inbound Email ──────────────────────────────────────

export interface InboundEmailRow {
  id: string;
  from_email: string;
  to_email: string | null;
  subject: string | null;
  body_text: string | null;
  received_at: string;
  forwarded_at: string | null;
  campus_id: string | null;
  campus_name: string | null;
  matched: "guardian" | "lead" | "none";
  family_name: string | null;
  /** /staff/applications/{id} for a matched guardian, /staff/recruitment/{id}
   *  for a matched lead, null when unmatched or the matched guardian has no
   *  application on file yet. */
  family_link: string | null;
}

/**
 * Read-only feed of everything stored in inbound_email (migration 00046) —
 * the surface staff actually need after lib/inbound-email.ts's unmatched
 * notification link was pointing at /staff/messages, a route with nothing
 * to open. inbound_email's own RLS policy is deliberately network-wide
 * (an unmatched reply has no campus to scope to), so the campus scoping a
 * real staff view needs happens here in app code — service role on purpose,
 * same reasoning as getStaffWorkQueue.
 *
 * accessibleCampusIds: from getAccessibleCampusIds(session). An empty array
 * means org-wide access (system_admin with no scoped campus rows) — every
 * row is returned regardless of includeUnmatched.
 * includeUnmatched: whether campus_id IS NULL rows (nobody matched, or a
 * matched guardian whose application had no campus yet) are visible to this
 * caller. Org-wide callers always see them; scoped staff only when they hold
 * system_admin on at least one of their campuses.
 */
export async function getInboundEmails(
  accessibleCampusIds: string[],
  includeUnmatched: boolean
): Promise<InboundEmailRow[]> {
  if (accessibleCampusIds.length === 0 && !includeUnmatched) {
    // Contract says empty accessibleCampusIds is always org-wide (and org-wide
    // always includes unmatched) — this combination shouldn't occur from the
    // page, but showing nothing is the safe fallback rather than everything.
    return [];
  }

  const supabase = createServiceRoleClient();

  let query = supabase
    .from("inbound_email")
    .select(
      `
      id, from_email, to_email, subject, body_text, received_at, forwarded_at, campus_id,
      lead:matched_lead_id ( id, first_name, last_name ),
      guardian:matched_guardian_id ( id, first_name, last_name ),
      campus:campus_id ( name )
    `
    )
    .order("received_at", { ascending: false })
    .limit(100);

  if (accessibleCampusIds.length > 0) {
    query = includeUnmatched
      ? query.or(`campus_id.in.(${accessibleCampusIds.join(",")}),campus_id.is.null`)
      : query.in("campus_id", accessibleCampusIds);
  }
  // else: accessibleCampusIds is empty and includeUnmatched is true (org-wide) — no filter.

  const { data, error } = await query;
  if (error) {
    console.error("[getInboundEmails]", error.message);
    return [];
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;

  // Batch-resolve each matched guardian's latest application, the same
  // record lib/inbound-email.ts attaches the reply to as an internal note —
  // that's the family record to link to, since there's no standalone
  // guardian detail page.
  const guardianIds = Array.from(
    new Set(
      rows
        .map((r) => (r.guardian as { id?: string } | null)?.id)
        .filter((id): id is string => Boolean(id))
    )
  );
  const guardianLatestAppId = new Map<string, string>();
  if (guardianIds.length > 0) {
    const { data: apps, error: appsError } = await supabase
      .from("application")
      .select("id, guardian_id, created_at")
      .in("guardian_id", guardianIds)
      .order("created_at", { ascending: false });
    if (appsError) {
      console.error("[getInboundEmails] application lookup failed", appsError.message);
    } else {
      for (const app of (apps ?? []) as Array<{ id: string; guardian_id: string }>) {
        if (!guardianLatestAppId.has(app.guardian_id)) {
          guardianLatestAppId.set(app.guardian_id, app.id);
        }
      }
    }
  }

  return rows.map((row) => {
    const lead = row.lead as { id?: string; first_name?: string; last_name?: string } | null;
    const guardian = row.guardian as { id?: string; first_name?: string; last_name?: string } | null;
    const campus = row.campus as { name?: string } | null;

    let matched: InboundEmailRow["matched"] = "none";
    let familyName: string | null = null;
    let familyLink: string | null = null;

    if (guardian?.id) {
      matched = "guardian";
      familyName = [guardian.first_name, guardian.last_name].filter(Boolean).join(" ") || null;
      const appId = guardianLatestAppId.get(guardian.id);
      familyLink = appId ? `/staff/applications/${appId}` : null;
    } else if (lead?.id) {
      matched = "lead";
      familyName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || null;
      familyLink = `/staff/recruitment/${lead.id}`;
    }

    return {
      id: row.id as string,
      from_email: row.from_email as string,
      to_email: (row.to_email as string) ?? null,
      subject: (row.subject as string) ?? null,
      body_text: (row.body_text as string) ?? null,
      received_at: row.received_at as string,
      forwarded_at: (row.forwarded_at as string) ?? null,
      campus_id: (row.campus_id as string) ?? null,
      campus_name: campus?.name ?? null,
      matched,
      family_name: familyName,
      family_link: familyLink,
    };
  });
}

// ─── Settings Queries ───────────────────────────────────

export async function getStaffEnrollmentWindows(
  campusId?: string
): Promise<EnrollmentWindowRow[]> {
  const supabase = await createServerClient();

  let query = supabase
    .from("enrollment_window")
    .select("id, name, open_date, close_date, status, campus:campus_id (name)")
    .order("open_date", { ascending: false });

  if (campusId) {
    query = query.eq("campus_id", campusId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getStaffEnrollmentWindows]", error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const campus = row.campus as Record<string, string> | null;
    return {
      id: row.id as string,
      name: (row.name as string) ?? "",
      // open_date / close_date are DATE columns, so `new Date("2026-10-26")`
      // parses as UTC midnight. Formatting without timeZone: "UTC" renders it
      // in the server's local zone, which is behind UTC for every US campus —
      // Settings showed every enrollment window opening and closing a day
      // early. Format in UTC to get the date that is actually stored.
      open_date: new Date(row.open_date as string).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }),
      close_date: new Date(row.close_date as string).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }),
      open_date_iso: row.open_date as string,
      close_date_iso: row.close_date as string,
      status: row.status as string,
      campus_name: campus?.name ?? "",
    };
  });
}

// ─── Work Queue Types ──────────────────────────────────

export interface WorkQueueItem {
  id: string;
  type: "new_submission" | "needs_info" | "pending_verification" | "expiring_offer" | "pending_enrollment";
  title: string;
  description: string;
  campus_name: string;
  created_at: string;
  link: string;
  priority: "high" | "medium" | "low";
}

// ─── Work Queue Queries ────────────────────────────────

export async function getStaffWorkQueue(campusIds?: string[]): Promise<WorkQueueItem[]> {
  // Service role on purpose: staff-only, campus-scoped by campusIds. Queries
  // application directly (several shapes below) and offer -> application ->
  // student, which trips the same latent RLS recursion (application policy ->
  // guardian policy -> application policy) documented in
  // lib/queries/recruitment-intel.ts. (Currently unwired — no page calls this
  // yet — fixed proactively so the first caller doesn't inherit a known crash.)
  const supabase = createServiceRoleClient();
  const items: WorkQueueItem[] = [];
  const hasCampusFilter = campusIds && campusIds.length > 0;

  // Build all 5 query objects without awaiting — they are fully independent

  // 1. New submissions needing review
  let submittedQuery = supabase
    .from("application")
    .select(`
      id, created_at,
      student:student_id (first_name, last_name),
      campus:campus_id (name),
      grade_level:grade_level_id (grade)
    `)
    .eq("status", "submitted")
    .order("created_at", { ascending: true })
    .limit(20);
  if (hasCampusFilter) submittedQuery = submittedQuery.in("campus_id", campusIds);

  // 2. Applications needing info follow-up
  let needsInfoQuery = supabase
    .from("application")
    .select(`
      id, updated_at,
      student:student_id (first_name, last_name),
      campus:campus_id (name)
    `)
    .eq("status", "needs_info")
    .order("updated_at", { ascending: true })
    .limit(20);
  if (hasCampusFilter) needsInfoQuery = needsInfoQuery.in("campus_id", campusIds);

  // 3. Verified apps ready for next step
  let verifiedQuery = supabase
    .from("application")
    .select(`
      id, reviewed_at,
      student:student_id (first_name, last_name),
      campus:campus_id (name)
    `)
    .eq("status", "verified")
    .order("reviewed_at", { ascending: true })
    .limit(20);
  if (hasCampusFilter) verifiedQuery = verifiedQuery.in("campus_id", campusIds);

  // 4. Offers expiring soon (within 7 days)
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  let offersQuery = supabase
    .from("offer")
    .select(`
      id, expires_at,
      application:application_id (
        id,
        student:student_id (first_name, last_name),
        campus:campus_id (name)
      )
    `)
    .eq("status", "pending")
    .lte("expires_at", sevenDaysFromNow)
    .order("expires_at", { ascending: true })
    .limit(20);
  if (hasCampusFilter) offersQuery = offersQuery.in("campus_id", campusIds);

  // 5. Accepted apps pending enrollment
  let pendingEnrollQuery = supabase
    .from("application")
    .select(`
      id, updated_at,
      student:student_id (first_name, last_name),
      campus:campus_id (name)
    `)
    .eq("status", "accepted")
    .order("updated_at", { ascending: true })
    .limit(20);
  if (hasCampusFilter) pendingEnrollQuery = pendingEnrollQuery.in("campus_id", campusIds);

  // Fire all 5 queries in parallel
  const [
    { data: submitted },
    { data: needsInfo },
    { data: verified },
    { data: expiringOffers },
    { data: pendingEnroll },
  ] = await Promise.all([
    submittedQuery,
    needsInfoQuery,
    verifiedQuery,
    offersQuery,
    pendingEnrollQuery,
  ]);

  for (const row of (submitted ?? []) as Record<string, unknown>[]) {
    const student = row.student as unknown as Record<string, string> | null;
    const campus = row.campus as Record<string, string> | null;
    const grade = row.grade_level as Record<string, string> | null;
    items.push({
      id: `sub-${row.id}`,
      type: "new_submission",
      title: `Review application: ${student?.first_name} ${student?.last_name}`,
      description: `${grade?.grade ? `Grade ${grade.grade}` : ""} application needs initial review.`,
      campus_name: campus?.name ?? "",
      created_at: row.created_at as string,
      link: `/staff/applications/${row.id}`,
      priority: "high",
    });
  }

  for (const row of (needsInfo ?? []) as Record<string, unknown>[]) {
    const student = row.student as unknown as Record<string, string> | null;
    const campus = row.campus as Record<string, string> | null;
    items.push({
      id: `info-${row.id}`,
      type: "needs_info",
      title: `Follow up: ${student?.first_name} ${student?.last_name}`,
      description: "Waiting on additional information from family.",
      campus_name: campus?.name ?? "",
      created_at: row.updated_at as string,
      link: `/staff/applications/${row.id}`,
      priority: "medium",
    });
  }

  for (const row of (verified ?? []) as Record<string, unknown>[]) {
    const student = row.student as unknown as Record<string, string> | null;
    const campus = row.campus as Record<string, string> | null;
    items.push({
      id: `ver-${row.id}`,
      type: "pending_verification",
      title: `Assign to lottery: ${student?.first_name} ${student?.last_name}`,
      description: "Verified and ready for lottery assignment or direct offer.",
      campus_name: campus?.name ?? "",
      created_at: (row.reviewed_at as string) ?? "",
      link: `/staff/applications/${row.id}`,
      priority: "medium",
    });
  }

  for (const row of (expiringOffers ?? []) as Record<string, unknown>[]) {
    const app = row.application as unknown as Record<string, unknown> | null;
    const student = app?.student as unknown as Record<string, string> | null;
    const campus = app?.campus as Record<string, string> | null;
    const expiresAt = new Date(row.expires_at as string);
    const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    items.push({
      id: `exp-${row.id}`,
      type: "expiring_offer",
      title: `Offer expiring: ${student?.first_name} ${student?.last_name}`,
      description: `Offer expires ${daysLeft <= 0 ? "today" : `in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}.`,
      campus_name: campus?.name ?? "",
      created_at: row.expires_at as string,
      link: "/staff/offers",
      priority: daysLeft <= 2 ? "high" : "medium",
    });
  }

  for (const row of (pendingEnroll ?? []) as Record<string, unknown>[]) {
    const student = row.student as unknown as Record<string, string> | null;
    const campus = row.campus as Record<string, string> | null;
    items.push({
      id: `enr-${row.id}`,
      type: "pending_enrollment",
      title: `Complete enrollment: ${student?.first_name} ${student?.last_name}`,
      description: "Offer accepted — ready for registration.",
      campus_name: campus?.name ?? "",
      created_at: row.updated_at as string,
      link: `/staff/applications/${row.id}`,
      priority: "medium",
    });
  }

  // Sort by priority then date
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => {
    const p = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (p !== 0) return p;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  return items;
}

// ─── Student Queries ───────────────────────────────────

export async function getStaffStudents(campusIds?: string[]): Promise<StudentRow[]> {
  // Service role on purpose: staff-only, campus-scoped by campusIds. Joins
  // application -> student and application -> guardian, the exact recursive
  // pair (application policy -> guardian policy -> application policy)
  // documented in lib/queries/recruitment-intel.ts. (Currently unwired — no
  // page calls this yet, students/page.tsx runs its own inline service-role
  // query — fixed proactively so the first caller doesn't inherit a known
  // crash.)
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("application")
    .select(`
      id, status,
      student:student_id (id, first_name, last_name),
      campus:campus_id (name),
      grade_level:grade_level_id (grade),
      guardian:guardian_id (first_name, last_name, email)
    `)
    .not("status", "eq", "draft")
    .order("created_at", { ascending: false });

  if (campusIds && campusIds.length > 0) {
    query = query.in("campus_id", campusIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getStaffStudents]", error.message);
    return [];
  }

  // Deduplicate by student ID — a student may have multiple applications
  const seen = new Set<string>();
  const results: StudentRow[] = [];

  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    const student = r.student as unknown as Record<string, string> | null;
    const studentId = student?.id ?? "";
    if (!studentId || seen.has(studentId)) continue;
    seen.add(studentId);

    const campus = r.campus as Record<string, string> | null;
    const grade = r.grade_level as Record<string, string> | null;
    const guardian = r.guardian as unknown as Record<string, string> | null;

    results.push({
      id: studentId,
      first_name: student?.first_name ?? "",
      last_name: student?.last_name ?? "",
      grade: grade?.grade ? `Grade ${grade.grade}` : "",
      campus_name: campus?.name ?? "",
      status: r.status as string,
      guardian_name: guardian
        ? `${guardian.first_name} ${guardian.last_name}`
        : "",
      guardian_email: guardian?.email ?? "",
      application_id: r.id as string,
    });
  }

  return results;
}

export async function getStaffUsers(campusId?: string): Promise<StaffUserRow[]> {
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("user_campus_role")
    .select(`
      id, role, campus_id,
      user:user_id (id, full_name, email),
      campus:campus_id (name)
    `);

  if (campusId) {
    query = query.eq("campus_id", campusId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getStaffUsers]", error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const user = row.user as unknown as Record<string, string> | null;
    const campus = row.campus as unknown as Record<string, string> | null;
    const fullName = user?.full_name ?? "Unknown";
    const initials = fullName
      .split(" ")
      .map((w: string) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    return {
      id: row.id as string,
      user_id: user?.id ?? "",
      full_name: fullName,
      email: user?.email ?? "",
      role: (row.role as string) ?? "enrollment_staff",
      initials,
      campus_name: campus?.name ?? "",
      campus_id: (row.campus_id as string) ?? "",
    };
  });
}

// ─── Packet Requirement Types ─────────────────────────

export interface PacketRequirementRow {
  id: string;
  campus_id: string;
  school_year_id: string;
  item_type: string;
  name: string;
  description: string | null;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
}

// ─── Get Packet Requirements ──────────────────────────

export async function getStaffPacketRequirements(
  campusId?: string,
  schoolYearId?: string
): Promise<PacketRequirementRow[]> {
  const supabase = await createServerClient();

  let query = supabase
    .from("packet_requirement")
    .select("id, campus_id, school_year_id, item_type, name, description, is_required, sort_order, is_active")
    .order("sort_order", { ascending: true });

  if (campusId) {
    query = query.eq("campus_id", campusId);
  }
  if (schoolYearId) {
    query = query.eq("school_year_id", schoolYearId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getStaffPacketRequirements]", error.message);
    return [];
  }

  return (data ?? []) as PacketRequirementRow[];
}

// ═══════════════════════════════════════════════════════
//  Staff "Today" exception queue — Phase 2
//  All four queries below are campus-scoped and read only
//  tables that already exist. None fabricate data: an
//  exception class with no real backing rows returns an
//  empty array so the corresponding row simply never renders.
// ═══════════════════════════════════════════════════════

// ─── Expiring Offers ────────────────────────────────────

export interface ExpiringOfferRow {
  id: string;
  application_id: string;
  student_name: string;
  grade: string;
  campus_id: string;
  campus_name: string;
  expires_at: string;
  hours_left: number;
  guardian_phone: string | null;
  guardian_sms_consent: boolean;
}

/**
 * Pending offers expiring within `hours` (default 5 days). Used to build the
 * "N offers expire <day>" row. Red-vs-amber urgency is decided by the caller
 * from `hours_left` (red only inside 72h, per the design handoff).
 */
export async function getExpiringOffers(
  hours: number = 120,
  campusIds?: string[]
): Promise<ExpiringOfferRow[]> {
  const supabase = createServiceRoleClient();
  const cutoff = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from("offer")
    .select(`
      id, application_id, campus_id, expires_at,
      application:application_id (
        student:student_id (first_name, last_name),
        guardian:guardian_id (phone, sms_consent)
      ),
      campus:campus_id (name),
      grade_level:grade_level_id (grade)
    `)
    .eq("status", "pending")
    .lte("expires_at", cutoff)
    .order("expires_at", { ascending: true });

  if (campusIds && campusIds.length > 0) {
    query = query.in("campus_id", campusIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getExpiringOffers]", error.message);
    return [];
  }

  const now = Date.now();

  return (data ?? []).map((row: Record<string, unknown>) => {
    const app = row.application as unknown as Record<string, unknown> | null;
    const student = app?.student as unknown as Record<string, string> | null;
    const guardian = app?.guardian as unknown as Record<string, unknown> | null;
    const campus = row.campus as Record<string, string> | null;
    const grade = row.grade_level as Record<string, string> | null;
    const expiresAt = row.expires_at as string;
    const hoursLeft = Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / (1000 * 60 * 60)));

    return {
      id: row.id as string,
      application_id: row.application_id as string,
      student_name: student ? `${student.first_name} ${student.last_name}` : "Unknown",
      grade: grade?.grade ? `Grade ${grade.grade}` : "",
      campus_id: row.campus_id as string,
      campus_name: campus?.name ?? "",
      expires_at: expiresAt,
      hours_left: hoursLeft,
      guardian_phone: (guardian?.phone as string) ?? null,
      guardian_sms_consent: guardian?.sms_consent === true,
    };
  });
}

// ─── Stalled Registrations ──────────────────────────────

export interface StalledRegistrationRow {
  application_id: string;
  enrollment_id: string;
  student_name: string;
  campus_id: string;
  campus_name: string;
  days_stalled: number;
  /** item_type values still pending (not yet submitted) for this family */
  outstanding_item_types: string[];
}

export interface StalledRegistrationsResult {
  rows: StalledRegistrationRow[];
  /** The most common outstanding item_type across the whole stalled set, and
   *  its display name (from packet_requirement.name where resolvable) — this
   *  is the "modal blocking requirement" the cause-grouping sentence names. */
  modalItemType: { item_type: string; name: string; count: number } | null;
}

/**
 * Registrations (registration_packet still pending/in_progress) whose last
 * activity is `days` or older. "Last activity" is registration_packet.updated_at,
 * which is bumped whenever a registration_item under it changes (see
 * lib/mutations/registration.ts completeRegistrationItem) — a reasonable proxy
 * for "the family or staff hasn't touched this in N days."
 */
export async function getStalledRegistrations(
  days: number = 5,
  campusIds?: string[]
): Promise<StalledRegistrationsResult> {
  const supabase = createServiceRoleClient();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let packetQuery = supabase
    .from("registration_packet")
    .select(`
      id, enrollment_id, updated_at, status,
      enrollment:enrollment_id (
        id, campus_id, application_id, school_year_id,
        student:student_id (first_name, last_name),
        campus:campus_id (name)
      )
    `)
    .in("status", ["pending", "in_progress"])
    .lte("updated_at", cutoff)
    .order("updated_at", { ascending: true });

  const { data: packets, error } = await packetQuery;

  if (error) {
    console.error("[getStalledRegistrations] packets", error.message);
    return { rows: [], modalItemType: null };
  }

  // Filter by campus in application code — the enrollment join's campus_id
  // isn't filterable via a top-level `.in()` on registration_packet.
  const scoped = (packets ?? []).filter((row: Record<string, unknown>) => {
    if (!campusIds || campusIds.length === 0) return true;
    const enrollment = row.enrollment as unknown as Record<string, unknown> | null;
    return enrollment ? campusIds.includes(enrollment.campus_id as string) : false;
  });

  if (scoped.length === 0) {
    return { rows: [], modalItemType: null };
  }

  const enrollmentIds = scoped
    .map((row: Record<string, unknown>) => (row.enrollment as Record<string, unknown> | null)?.id as string)
    .filter(Boolean);

  const { data: items, error: itemsError } = await supabase
    .from("registration_item")
    .select("enrollment_id, item_type")
    .in("enrollment_id", enrollmentIds)
    .eq("status", "pending");

  if (itemsError) {
    console.error("[getStalledRegistrations] items", itemsError.message);
  }

  const itemsByEnrollment = new Map<string, string[]>();
  const itemTypeCounts = new Map<string, number>();
  for (const item of (items ?? []) as Record<string, unknown>[]) {
    const enrollmentId = item.enrollment_id as string;
    const itemType = item.item_type as string;
    if (!itemsByEnrollment.has(enrollmentId)) itemsByEnrollment.set(enrollmentId, []);
    itemsByEnrollment.get(enrollmentId)!.push(itemType);
    itemTypeCounts.set(itemType, (itemTypeCounts.get(itemType) ?? 0) + 1);
  }

  const now = Date.now();
  const rows: StalledRegistrationRow[] = scoped.map((row: Record<string, unknown>) => {
    const enrollment = row.enrollment as unknown as Record<string, unknown> | null;
    const student = enrollment?.student as unknown as Record<string, string> | null;
    const campus = enrollment?.campus as unknown as Record<string, string> | null;
    const enrollmentId = (enrollment?.id as string) ?? "";
    const daysStalled = Math.floor((now - new Date(row.updated_at as string).getTime()) / (1000 * 60 * 60 * 24));

    return {
      application_id: (enrollment?.application_id as string) ?? "",
      enrollment_id: enrollmentId,
      student_name: student ? `${student.first_name} ${student.last_name}` : "Unknown",
      campus_id: (enrollment?.campus_id as string) ?? "",
      campus_name: campus?.name ?? "",
      days_stalled: daysStalled,
      outstanding_item_types: itemsByEnrollment.get(enrollmentId) ?? [],
    };
  });

  let modalItemType: StalledRegistrationsResult["modalItemType"] = null;
  if (itemTypeCounts.size > 0) {
    let bestType = "";
    let bestCount = -1;
    for (const [type, count] of itemTypeCounts.entries()) {
      if (count > bestCount) {
        bestType = type;
        bestCount = count;
      }
    }

    // Resolve a human name from packet_requirement where available; fall back
    // to a prettified item_type ("emergency_contact" -> "Emergency Contact").
    const { data: reqRow } = await supabase
      .from("packet_requirement")
      .select("name")
      .eq("item_type", bestType)
      .limit(1)
      .maybeSingle();

    const prettified = bestType
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    modalItemType = {
      item_type: bestType,
      name: (reqRow?.name as string) ?? prettified,
      count: bestCount,
    };
  }

  return { rows, modalItemType };
}

// ─── Releasable Seats ───────────────────────────────────

export interface ReleasableSeatGroup {
  campus_id: string;
  campus_name: string;
  grade_level_id: string;
  grade: string;
  /** Seats currently open (total capacity minus everything actively holding a seat) */
  open_seats: number;
  /** min(open_seats, waitlist demand) — the number actually actionable right now */
  releasable: number;
  /** Next-in-line waitlist entries, ordered by position, capped to `releasable` */
  next_in_line: Array<{ waitlist_position_id: string; student_name: string; position: number }>;
}

/**
 * Seats that are open (capacity not currently held by an active enrollment or
 * a live offer) AND have families waiting for them on the waitlist. This is
 * computed directly from enrollment/offer/waitlist rows — not from
 * capacity_plan's manually-maintained counters — so it reflects real declines
 * and withdrawals rather than a staff-updated snapshot.
 */
export async function getReleasableSeats(campusIds?: string[]): Promise<ReleasableSeatGroup[]> {
  const supabase = createServiceRoleClient();

  const { data: currentYear } = await supabase
    .from("school_year")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();

  if (!currentYear) return [];

  let planQuery = supabase
    .from("capacity_plan")
    .select(`
      total_seats, campus_id, grade_level_id,
      campus:campus_id (name),
      grade_level:grade_level_id (grade)
    `)
    .eq("school_year_id", currentYear.id as string)
    .gt("total_seats", 0);

  if (campusIds && campusIds.length > 0) {
    planQuery = planQuery.in("campus_id", campusIds);
  }

  const { data: plans, error: planError } = await planQuery;

  if (planError) {
    console.error("[getReleasableSeats] capacity_plan", planError.message);
    return [];
  }
  if (!plans || plans.length === 0) return [];

  const results: ReleasableSeatGroup[] = [];

  for (const plan of plans as Record<string, unknown>[]) {
    const campusId = plan.campus_id as string;
    const gradeLevelId = plan.grade_level_id as string;
    const total = (plan.total_seats as number) ?? 0;

    const [{ count: heldEnrollment }, { count: heldOffers }, { data: waitlist }] = await Promise.all([
      supabase
        .from("enrollment")
        .select("id", { count: "exact", head: true })
        .eq("campus_id", campusId)
        .eq("grade_level_id", gradeLevelId)
        .eq("school_year_id", currentYear.id as string)
        .in("status", ["pending", "active"]),
      supabase
        .from("offer")
        .select("id", { count: "exact", head: true })
        .eq("campus_id", campusId)
        .eq("grade_level_id", gradeLevelId)
        .eq("status", "pending"),
      supabase
        .from("waitlist")
        .select(`
          id,
          waitlist_position (
            id, position_number, removed_at,
            application:application_id (student:student_id (first_name, last_name))
          )
        `)
        .eq("campus_id", campusId)
        .eq("grade_level_id", gradeLevelId)
        .eq("school_year_id", currentYear.id as string)
        .maybeSingle(),
    ]);

    const held = (heldEnrollment ?? 0) + (heldOffers ?? 0);
    const openSeats = Math.max(0, total - held);

    if (openSeats === 0) continue;

    const positions = ((waitlist as unknown as Record<string, unknown> | null)?.waitlist_position ?? []) as Record<string, unknown>[];
    const activePositions = positions
      .filter((p) => !p.removed_at)
      .sort((a, b) => (a.position_number as number) - (b.position_number as number));

    if (activePositions.length === 0) continue;

    const releasable = Math.min(openSeats, activePositions.length);

    const campus = plan.campus as Record<string, string> | null;
    const grade = plan.grade_level as Record<string, string> | null;

    results.push({
      campus_id: campusId,
      campus_name: campus?.name ?? "",
      grade_level_id: gradeLevelId,
      grade: grade?.grade ? `Grade ${grade.grade}` : "",
      open_seats: openSeats,
      releasable,
      next_in_line: activePositions.slice(0, releasable).map((p) => {
        const app = p.application as unknown as Record<string, unknown> | null;
        const student = app?.student as unknown as Record<string, string> | null;
        return {
          waitlist_position_id: p.id as string,
          student_name: student ? `${student.first_name} ${student.last_name}` : "Unknown",
          position: p.position_number as number,
        };
      }),
    });
  }

  return results;
}

// ─── Duplicate Suspects ─────────────────────────────────

export interface DuplicateSuspectRow {
  phone: string;
  guardians: Array<{ guardian_id: string; name: string; household_id: string }>;
}

/**
 * Guardians in different households who share a normalized phone number but
 * spell their name differently — a real, schema-backed signal (guardian.phone
 * + guardian.household_id both already exist; no new table needed). Scoped to
 * campuses by restricting to guardians who have at least one application at
 * an accessible campus.
 */
export async function getDuplicateSuspects(campusIds?: string[]): Promise<DuplicateSuspectRow[]> {
  const supabase = createServiceRoleClient();

  // Resolve the set of guardian_ids in scope via their applications' campus_id.
  let guardianIdQuery = supabase.from("application").select("guardian_id");
  if (campusIds && campusIds.length > 0) {
    guardianIdQuery = guardianIdQuery.in("campus_id", campusIds);
  }
  const { data: scopedApps, error: appError } = await guardianIdQuery;
  if (appError) {
    console.error("[getDuplicateSuspects] applications", appError.message);
    return [];
  }
  const scopedGuardianIds = [...new Set((scopedApps ?? []).map((r: Record<string, unknown>) => r.guardian_id as string))];
  if (scopedGuardianIds.length === 0) return [];

  const { data: guardians, error } = await supabase
    .from("guardian")
    .select("id, household_id, first_name, last_name, phone")
    .in("id", scopedGuardianIds)
    .not("phone", "is", null);

  if (error) {
    console.error("[getDuplicateSuspects] guardians", error.message);
    return [];
  }

  const byPhone = new Map<string, Record<string, unknown>[]>();
  for (const g of (guardians ?? []) as Record<string, unknown>[]) {
    const digits = ((g.phone as string) ?? "").replace(/\D/g, "");
    if (digits.length < 10) continue;
    const normalized = digits.slice(-10); // compare by last 10 digits (US numbers)
    if (!byPhone.has(normalized)) byPhone.set(normalized, []);
    byPhone.get(normalized)!.push(g);
  }

  const suspects: DuplicateSuspectRow[] = [];
  for (const [phone, group] of byPhone.entries()) {
    // Only a real duplicate signal when the phone spans more than one household
    // AND the name spelling actually differs (otherwise it's just a shared
    // family phone for the same guardian across siblings' applications).
    const distinctHouseholds = new Set(group.map((g) => g.household_id as string));
    if (distinctHouseholds.size < 2) continue;

    const distinctNames = new Set(
      group.map((g) => `${(g.first_name as string).trim().toLowerCase()} ${(g.last_name as string).trim().toLowerCase()}`)
    );
    if (distinctNames.size < 2) continue;

    suspects.push({
      phone,
      guardians: group.map((g) => ({
        guardian_id: g.id as string,
        name: `${g.first_name} ${g.last_name}`,
        household_id: g.household_id as string,
      })),
    });
  }

  return suspects;
}

// ═══════════════════════════════════════════════════════
//  Pipeline (Phase 3) — stage tab counts + per-row
//  "what it needs", computed in batch (no N+1).
// ═══════════════════════════════════════════════════════

/**
 * Live, campus-scoped counts for each Pipeline stage tab. Reads every real
 * application_status value in one query (mirrors getApplicationStats' shape)
 * and folds them into the 6 stages defined in PIPELINE_STAGES — no fabricated
 * numbers, a stage with zero matching applications just returns 0.
 */
export async function getPipelineStageCounts(
  campusIds?: string[],
  grade?: string
): Promise<Record<string, number>> {
  const supabase = createServiceRoleClient();

  // grade_level joined with !inner so an optional grade filter can apply to
  // the joined column (application.grade_level_id is NOT NULL, so the inner
  // join never drops a real row when no grade filter is set).
  let query = supabase.from("application").select("status, grade_level:grade_level_id!inner (grade)");
  if (campusIds && campusIds.length > 0) {
    query = query.in("campus_id", campusIds);
  }
  if (grade) {
    query = query.eq("grade_level.grade", grade);
  }

  const { data, error } = await query;

  const counts: Record<string, number> = {};
  for (const stage of PIPELINE_STAGES) counts[stage.key] = 0;

  if (error) {
    console.error("[getPipelineStageCounts]", error.message);
    return counts;
  }

  const byStatus = new Map<string, number>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const s = row.status as string;
    byStatus.set(s, (byStatus.get(s) ?? 0) + 1);
  }

  for (const stage of PIPELINE_STAGES) {
    counts[stage.key] = stage.statuses.reduce((sum, s) => sum + (byStatus.get(s) ?? 0), 0);
  }

  return counts;
}

export interface PipelineRowNeed {
  /** What renders in the "What it needs" column. */
  needsLabel: string;
  /** Grouping key for the bulk bar's shared-cause computation — two rows
   *  with the same causeKey are "the same blocking thing". Null when the
   *  row has nothing outstanding (e.g. Enrolled) or the cause isn't a
   *  single nameable item (e.g. "awaiting lottery results"). */
  causeKey: string | null;
  /** Human phrase for the cause, e.g. "missing Proof Of Residency" — the
   *  bulk bar renders "All are ${causeLabel}" / "N of M are ${causeLabel}". */
  causeLabel: string | null;
}

/**
 * Per-application "what it needs" for the Pipeline table, computed in a
 * fixed number of batch queries (one per data source touched by the visible
 * page), never one query per row. The blocking requirement is derived from
 * real tables only:
 *   - Needs review (submitted/needs_info)   -> pending `document` rows
 *   - Ready for lottery (verified/lottery_assigned) -> static, real status text
 *   - Offer out (offered/accepted)          -> pending `offer.expires_at`,
 *                                              or outstanding `registration_item`
 *                                              vs required `packet_requirement`
 *   - Registering (registered/placement_review) -> same registration-item gap
 *     used by Phase 2's getStalledRegistrations / family.ts getRegistrationSummary
 *   - Enrolled                              -> static "Nothing needed"
 *   - Waitlist (waitlisted)                 -> real `waitlist_position.position_number`
 * Rows with no real backing data degrade to a plain status sentence — never
 * a fabricated document or item name.
 */
export async function getPipelineNeeds(
  rows: Array<{ id: string; status: string }>
): Promise<Map<string, PipelineRowNeed>> {
  const supabase = createServiceRoleClient();
  const result = new Map<string, PipelineRowNeed>();
  if (rows.length === 0) return result;

  const idsFor = (statuses: string[]) =>
    rows.filter((r) => statuses.includes(r.status)).map((r) => r.id);

  const needsReviewIds = idsFor(["submitted", "needs_info"]);
  const offeredIds = idsFor(["offered"]);
  const acceptedIds = idsFor(["accepted"]);
  const registeringIds = idsFor(["registered", "placement_review"]);
  const waitlistIds = idsFor(["waitlisted"]);
  const enrollmentLookupIds = [...acceptedIds, ...registeringIds];

  // ── Fire every batch query in parallel — one round trip per data source,
  //    never per row. ────────────────────────────────────────────────────
  const [documentsRes, offersRes, enrollmentsRes, waitlistRes] = await Promise.all([
    needsReviewIds.length > 0
      ? supabase
          .from("document")
          .select("application_id, document_type")
          .eq("status", "pending")
          .in("application_id", needsReviewIds)
      : Promise.resolve({ data: [], error: null }),
    offeredIds.length > 0
      ? supabase
          .from("offer")
          .select("application_id, expires_at")
          .eq("status", "pending")
          .in("application_id", offeredIds)
      : Promise.resolve({ data: [], error: null }),
    enrollmentLookupIds.length > 0
      ? supabase
          .from("enrollment")
          .select("id, application_id, campus_id, school_year_id")
          .in("application_id", enrollmentLookupIds)
      : Promise.resolve({ data: [], error: null }),
    waitlistIds.length > 0
      ? supabase
          .from("waitlist_position")
          .select("application_id, position_number")
          .is("removed_at", null)
          .in("application_id", waitlistIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // ── Needs review: group pending documents by application ───────────────
  const docsByApp = new Map<string, string[]>();
  for (const row of (documentsRes.data ?? []) as Record<string, unknown>[]) {
    const appId = row.application_id as string;
    const type = row.document_type as string;
    if (!docsByApp.has(appId)) docsByApp.set(appId, []);
    docsByApp.get(appId)!.push(type);
  }

  for (const appId of needsReviewIds) {
    const types = docsByApp.get(appId) ?? [];
    if (types.length > 0) {
      const names = types.map(prettifyType);
      const label =
        types.length === 1
          ? `1 document: ${names[0]}`
          : `${types.length} documents: ${names.slice(0, 2).join(", ")}${types.length > 2 ? ` +${types.length - 2} more` : ""}`;
      result.set(appId, {
        needsLabel: label,
        causeKey: `document:${types[0]}`,
        causeLabel: `missing ${names[0]}`,
      });
    } else {
      const status = rows.find((r) => r.id === appId)?.status;
      const label = status === "needs_info" ? "Information requested from family" : "Awaiting initial review";
      result.set(appId, { needsLabel: label, causeKey: "info_requested", causeLabel: "waiting on a family response" });
    }
  }

  // ── Ready for lottery: static, real status text — nothing to batch ──────
  for (const row of rows) {
    if (row.status === "verified") {
      result.set(row.id, { needsLabel: "Ready for lottery run", causeKey: "ready_for_lottery", causeLabel: "ready for the lottery run" });
    } else if (row.status === "lottery_assigned") {
      result.set(row.id, { needsLabel: "Awaiting lottery results", causeKey: "lottery_assigned", causeLabel: "waiting on lottery results" });
    }
  }

  // ── Offer out / offered: pending offer expiry ───────────────────────────
  const offerByApp = new Map<string, string>();
  for (const row of (offersRes.data ?? []) as Record<string, unknown>[]) {
    offerByApp.set(row.application_id as string, row.expires_at as string);
  }
  for (const appId of offeredIds) {
    const expiresAt = offerByApp.get(appId);
    if (expiresAt) {
      const dateLabel = new Date(expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      result.set(appId, {
        needsLabel: `Response due ${dateLabel}`,
        causeKey: "awaiting_response",
        causeLabel: "awaiting the family's response",
      });
    } else {
      result.set(appId, { needsLabel: "Awaiting family response", causeKey: "awaiting_response", causeLabel: "awaiting the family's response" });
    }
  }

  // ── Offer out / accepted + Registering: registration-item gap ──────────
  // Same approach as family.ts getRegistrationSummary / Phase 2's
  // getStalledRegistrations: outstanding = required packet_requirement
  // item_types minus registration_item rows already submitted/verified/skipped.
  const enrollments = (enrollmentsRes.data ?? []) as Array<{
    id: string;
    application_id: string;
    campus_id: string;
    school_year_id: string;
  }>;

  if (enrollments.length > 0) {
    const enrollmentIds = enrollments.map((e) => e.id);
    const campusIds = [...new Set(enrollments.map((e) => e.campus_id))];
    const schoolYearIds = [...new Set(enrollments.map((e) => e.school_year_id))];

    const [{ data: items }, { data: requirements }] = await Promise.all([
      supabase
        .from("registration_item")
        .select("enrollment_id, item_type, status")
        .in("enrollment_id", enrollmentIds),
      supabase
        .from("packet_requirement")
        .select("item_type, name, campus_id, school_year_id")
        .in("campus_id", campusIds)
        .in("school_year_id", schoolYearIds)
        .eq("is_required", true)
        .eq("is_active", true),
    ]);

    const REG_DONE_STATUSES = new Set(["submitted", "verified", "skipped"]);
    const doneByEnrollment = new Map<string, Set<string>>();
    for (const item of (items ?? []) as Record<string, unknown>[]) {
      const enrollmentId = item.enrollment_id as string;
      if (!REG_DONE_STATUSES.has(item.status as string)) continue;
      if (!doneByEnrollment.has(enrollmentId)) doneByEnrollment.set(enrollmentId, new Set());
      doneByEnrollment.get(enrollmentId)!.add(item.item_type as string);
    }

    const reqsByScope = new Map<string, Array<{ item_type: string; name: string }>>();
    for (const req of (requirements ?? []) as Record<string, unknown>[]) {
      const key = `${req.campus_id}::${req.school_year_id}`;
      if (!reqsByScope.has(key)) reqsByScope.set(key, []);
      reqsByScope.get(key)!.push({ item_type: req.item_type as string, name: req.name as string });
    }

    for (const enrollment of enrollments) {
      const scopeKey = `${enrollment.campus_id}::${enrollment.school_year_id}`;
      const required = reqsByScope.get(scopeKey) ?? [];
      const done = doneByEnrollment.get(enrollment.id) ?? new Set<string>();
      const outstanding = required.filter((r) => !done.has(r.item_type));
      const appId = enrollment.application_id;
      const status = rows.find((r) => r.id === appId)?.status;

      if (outstanding.length > 0) {
        const names = outstanding.map((r) => r.name);
        const label =
          outstanding.length === 1
            ? `1 item: ${names[0]}`
            : `${outstanding.length} items: ${names.slice(0, 2).join(", ")}${outstanding.length > 2 ? ` +${outstanding.length - 2} more` : ""}`;
        result.set(appId, {
          needsLabel: label,
          causeKey: `registration_item:${outstanding[0].item_type}`,
          causeLabel: `missing ${names[0]}`,
        });
      } else if (status === "placement_review") {
        result.set(appId, { needsLabel: "Awaiting academic placement review", causeKey: "placement_review", causeLabel: "awaiting placement review" });
      } else {
        result.set(appId, { needsLabel: "Registration complete — pending next step", causeKey: null, causeLabel: null });
      }
    }
  }

  // Accepted/registering applications with no enrollment row yet (edge case —
  // offer accepted but enrollment record not created) degrade honestly.
  for (const appId of [...acceptedIds, ...registeringIds]) {
    if (!result.has(appId)) {
      result.set(appId, { needsLabel: "Registration not yet started", causeKey: "registration_not_started", causeLabel: "not yet started on registration" });
    }
  }

  // ── Enrolled: static ─────────────────────────────────────────────────────
  for (const row of rows) {
    if (row.status === "enrolled") {
      result.set(row.id, { needsLabel: "Nothing needed", causeKey: null, causeLabel: null });
    }
  }

  // ── Waitlist: real position number ──────────────────────────────────────
  const positionByApp = new Map<string, number>();
  for (const row of (waitlistRes.data ?? []) as Record<string, unknown>[]) {
    positionByApp.set(row.application_id as string, row.position_number as number);
  }
  for (const appId of waitlistIds) {
    const position = positionByApp.get(appId);
    result.set(
      appId,
      position != null
        ? { needsLabel: `Waitlist position ${position}`, causeKey: "waitlist", causeLabel: "waiting for a seat to open" }
        : { needsLabel: "Waitlist position pending", causeKey: "waitlist", causeLabel: "waiting for a seat to open" }
    );
  }

  return result;
}
