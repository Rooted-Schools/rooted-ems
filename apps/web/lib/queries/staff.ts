import { createServerClient } from "@rooted-ems/database/server";

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
  student_name: string;
  grade: string;
  campus_name: string;
  status: string;
  enrolled_at: string | null;
  sis_id: string | null;
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
  status: string;
}

export interface StaffUserRow {
  id: string;
  full_name: string;
  email: string;
  role: string;
  initials: string;
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
  const supabase = await createServerClient();

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
        id,
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
        siblingInSchool: false, // Would require additional query to determine
      };
    }
  );

  return { run, entrants };
}

// ─── Offer Queries ──────────────────────────────────────

export async function getStaffOffers(campusIds?: string[]): Promise<{ offers: OfferRow[]; stats: OfferStats }> {
  const supabase = await createServerClient();

  let query = supabase
    .from("offer")
    .select(`
      id, status, offered_at, expires_at,
      application_id, campus_id, grade_level_id,
      application:application_id (
        student_id,
        school_year_id,
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
      school_year_id: (app?.school_year_id as string) ?? "",
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
  const supabase = await createServerClient();

  // Waitlist is nested via waitlist → campus_id, so we filter post-fetch
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
    .order("position_number", { ascending: true });

  if (error) {
    console.error("[getStaffWaitlist]", error.message);
    return { entries: [], campusCounts: [] };
  }

  const rows = data ?? [];

  // Filter by campus if campusIds provided
  const filteredRows = campusIds && campusIds.length > 0
    ? rows.filter((row: Record<string, unknown>) => {
        const wl = row.waitlist as unknown as Record<string, unknown> | null;
        const cid = wl?.campus_id as string | undefined;
        return cid ? campusIds.includes(cid) : false;
      })
    : rows;

  const entries: WaitlistEntry[] = filteredRows.map((row: Record<string, unknown>) => {
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
  const supabase = await createServerClient();

  let query = supabase
    .from("enrollment")
    .select(`
      id, status, enrolled_at, sis_student_id,
      student:student_id (first_name, last_name),
      campus:campus_id (name),
      grade_level:grade_level_id (grade)
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

    return {
      id: row.id as string,
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
): Promise<{ userId: string; name: string; email: string; status: string; campus: string }[]> {
  const supabase = await createServerClient();
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
        email
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
  const recipients: { userId: string; name: string; email: string; status: string; campus: string }[] = [];

  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const guardian = row.guardian as unknown as Record<string, string> | null;
    const campus = row.campus as Record<string, string> | null;
    const userId = guardian?.user_id;
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);

    recipients.push({
      userId,
      name: `${guardian?.first_name ?? ""} ${guardian?.last_name ?? ""}`.trim(),
      email: guardian?.email ?? "",
      status: row.status as string,
      campus: campus?.name ?? "",
    });
  }

  return recipients;
}

export async function getStaffCommunications(): Promise<{
  messages: CommunicationRow[];
  stats: CommunicationStats;
}> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("communication_log")
    .select("id, subject, channel, status, sent_at")
    .order("created_at", { ascending: false })
    .limit(100);

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
    recipient_count: 1, // communication_log is per-recipient; could aggregate later
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

// ─── Settings Queries ───────────────────────────────────

export async function getStaffEnrollmentWindows(
  campusId?: string
): Promise<EnrollmentWindowRow[]> {
  const supabase = await createServerClient();

  let query = supabase
    .from("enrollment_window")
    .select("id, name, open_date, close_date, status")
    .order("open_date", { ascending: false });

  if (campusId) {
    query = query.eq("campus_id", campusId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getStaffEnrollmentWindows]", error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name: (row.name as string) ?? "",
    open_date: new Date(row.open_date as string).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    close_date: new Date(row.close_date as string).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    status: row.status as string,
  }));
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
  const supabase = await createServerClient();
  const items: WorkQueueItem[] = [];
  const hasCampusFilter = campusIds && campusIds.length > 0;

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
  const { data: submitted } = await submittedQuery;

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
  const { data: needsInfo } = await needsInfoQuery;

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
  const { data: verified } = await verifiedQuery;

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
  const { data: expiringOffers } = await offersQuery;

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
  const { data: pendingEnroll } = await pendingEnrollQuery;

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
  const supabase = await createServerClient();

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

  return (data ?? []).map((row: Record<string, unknown>) => {
    const student = row.student as unknown as Record<string, string> | null;
    const campus = row.campus as Record<string, string> | null;
    const grade = row.grade_level as Record<string, string> | null;
    const guardian = row.guardian as unknown as Record<string, string> | null;

    return {
      id: student?.id ?? "",
      first_name: student?.first_name ?? "",
      last_name: student?.last_name ?? "",
      grade: grade?.grade ? `Grade ${grade.grade}` : "",
      campus_name: campus?.name ?? "",
      status: row.status as string,
      guardian_name: guardian
        ? `${guardian.first_name} ${guardian.last_name}`
        : "",
      guardian_email: guardian?.email ?? "",
      application_id: row.id as string,
    };
  });
}

export async function getStaffUsers(campusId?: string): Promise<StaffUserRow[]> {
  const supabase = await createServerClient();

  let query = supabase
    .from("user_campus_role")
    .select(`
      id, role,
      user:user_id (id, full_name, email)
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
    const fullName = user?.full_name ?? "Unknown";
    const initials = fullName
      .split(" ")
      .map((w: string) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    return {
      id: row.id as string,
      full_name: fullName,
      email: user?.email ?? "",
      role: (row.role as string) ?? "enrollment_staff",
      initials,
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
