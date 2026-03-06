import { createServerClient } from "@rooted-ems/database/server";
import { formatRelativeTime } from "./utils";

// ─── Types ─────────────────────────────────────────────

export interface FamilyNotification {
  id: string;
  title: string;
  message: string;
  time: string;
  created_at: string;
  read: boolean;
  type: string;
}

export interface EnrollmentWindowInfo {
  id: string;
  name: string;
  campus_name: string;
  campus_id: string;
  open_date: string;
  close_date: string;
  status: string;
  is_open: boolean;
  days_remaining: number | null;
}

export interface FamilyAppSummary {
  id: string;
  student_name: string;
  grade: string;
  grade_label: string;
  campus_name: string;
  status: string;
  submitted_at: string | null;
  updated_at: string;
  next_step: string | null;
}

// ─── Queries ─────────────────────────────────────────────

/**
 * Fetch notifications for a family user.
 */
export async function getFamilyNotifications(
  userId: string,
  limit: number = 10
): Promise<FamilyNotification[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("notification")
    .select("id, title, message, created_at, read_at, type")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[getFamilyNotifications]", error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    title: (row.title as string) ?? "",
    message: (row.message as string) ?? "",
    time: formatRelativeTime(row.created_at as string),
    created_at: (row.created_at as string) ?? "",
    read: !!(row.read_at as string | null),
    type: (row.type as string) ?? "info",
  }));
}

/**
 * Fetch active and upcoming enrollment windows.
 * Families see windows that are currently open or opening soon.
 */
export async function getActiveEnrollmentWindows(
  campusId?: string
): Promise<EnrollmentWindowInfo[]> {
  const supabase = await createServerClient();
  const now = new Date();
  const nowIso = now.toISOString();

  // Get windows that haven't closed yet
  let query = supabase
    .from("enrollment_window")
    .select(
      `
      id, name, open_date, close_date, status,
      campus:campus_id (id, name)
    `
    )
    .gte("close_date", nowIso)
    .order("open_date", { ascending: true });

  if (campusId) {
    query = query.eq("campus_id", campusId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getActiveEnrollmentWindows]", error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const campus = row.campus as Record<string, string> | null;
    const openDate = new Date(row.open_date as string);
    const closeDate = new Date(row.close_date as string);
    const isOpen = now >= openDate && now <= closeDate;

    let daysRemaining: number | null = null;
    if (isOpen) {
      daysRemaining = Math.ceil(
        (closeDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    return {
      id: row.id as string,
      name: (row.name as string) ?? "Enrollment Window",
      campus_name: campus?.name ?? "",
      campus_id: campus?.id ?? "",
      open_date: openDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      close_date: closeDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      status: (row.status as string) ?? "",
      is_open: isOpen,
      days_remaining: daysRemaining,
    };
  });
}

/**
 * Fetch family's applications for their dashboard summary.
 * Lighter than the full getFamilyApplications — just what the dashboard needs.
 */
export async function getFamilyDashboardApps(
  userId: string
): Promise<FamilyAppSummary[]> {
  const supabase = await createServerClient();

  // Find guardian records for this user
  const { data: guardians } = await supabase
    .from("guardian")
    .select("id")
    .eq("user_id", userId);

  if (!guardians || guardians.length === 0) return [];

  const guardianIds = guardians.map((g: Record<string, string>) => g.id);

  const { data, error } = await supabase
    .from("application")
    .select(
      `
      id, status, submitted_at, updated_at,
      student:student_id (first_name, last_name),
      campus:campus_id (name),
      grade_level:grade_level_id (grade)
    `
    )
    .in("guardian_id", guardianIds)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("[getFamilyDashboardApps]", error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const student = row.student as Record<string, string> | null;
    const campus = row.campus as Record<string, string> | null;
    const grade = row.grade_level as Record<string, string> | null;

    const gradeCode = (grade?.grade as string) ?? "";
    const status = row.status as string;

    // Derive a helpful next-step hint based on current status
    const nextStepMap: Record<string, string> = {
      draft: "Complete and submit your application.",
      submitted: "Your application is being reviewed.",
      needs_info: "Additional information or documents are needed.",
      verified: "Your application has been verified and is ready for lottery.",
      offered: "You have received an offer — please respond before it expires.",
      waitlisted: "You are on the waitlist. We will notify you if a seat opens.",
    };

    return {
      id: row.id as string,
      student_name: student
        ? `${student.first_name} ${student.last_name}`
        : "Unknown Student",
      grade: gradeCode,
      grade_label: gradeCode ? `Grade ${gradeCode}` : "",
      campus_name: campus?.name ?? "",
      status,
      submitted_at: row.submitted_at as string | null,
      updated_at: row.updated_at as string,
      next_step: nextStepMap[status] ?? null,
    };
  });
}
