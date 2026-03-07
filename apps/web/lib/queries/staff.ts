import { createServerClient } from "@rooted-ems/database/server";

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

export async function getStaffLotteryRuns(): Promise<LotteryRunRow[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("lottery_run")
    .select(`
      id, status, total_applicants, total_seats, created_at,
      campus:campus_id (name),
      grade_level:grade_level_id (grade),
      enrollment_window:enrollment_window_id (name)
    `)
    .order("created_at", { ascending: false });

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

// ─── Offer Queries ──────────────────────────────────────

export async function getStaffOffers(): Promise<{ offers: OfferRow[]; stats: OfferStats }> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("offer")
    .select(`
      id, status, offered_at, expires_at,
      application:application_id (
        student:student_id (first_name, last_name)
      ),
      campus:campus_id (name),
      grade_level:grade_level_id (grade)
    `)
    .order("offered_at", { ascending: false });

  if (error) {
    console.error("[getStaffOffers]", error.message);
    return { offers: [], stats: { total: 0, pending: 0, accepted: 0, declined_or_expired: 0 } };
  }

  const rows = data ?? [];

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

export async function getStaffWaitlist(): Promise<{
  entries: WaitlistEntry[];
  campusCounts: WaitlistCampusCount[];
}> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("waitlist_position")
    .select(`
      id, position_number, added_at,
      waitlist:waitlist_id (
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

  // Get all campuses so we show zeros too
  const { data: campuses } = await supabase
    .from("campus")
    .select("name")
    .order("name");

  const campusCounts: WaitlistCampusCount[] = (campuses ?? []).map(
    (c: Record<string, string>) => ({
      campus_name: c.name,
      count: countMap[c.name] ?? 0,
    })
  );

  return { entries, campusCounts };
}

// ─── Enrollment Queries ─────────────────────────────────

export async function getStaffEnrollments(): Promise<{
  enrollments: EnrollmentRow[];
  stats: EnrollmentStats;
}> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("enrollment")
    .select(`
      id, status, enrolled_at, sis_student_id,
      student:student_id (first_name, last_name),
      campus:campus_id (name),
      grade_level:grade_level_id (grade)
    `)
    .order("enrolled_at", { ascending: false, nullsFirst: false });

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

// ─── Communication Queries ──────────────────────────────

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
