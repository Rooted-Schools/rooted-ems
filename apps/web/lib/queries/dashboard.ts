import { createServerClient } from "@rooted-ems/database/server";
import { formatRelativeTime } from "./utils";

// ─── Types ─────────────────────────────────────────────

export interface DashboardStats {
  totalApplications: number;
  pendingReview: number;
  seatsAvailable: number;
  enrolled: number;
}

export interface RecentActivityItem {
  id: string;
  text: string;
  time: string;
  icon: string;
}

export interface UpcomingDeadline {
  id: string;
  title: string;
  date: string;
  campus: string;
  daysLeft: number;
}

// ─── Queries ─────────────────────────────────────────────

/**
 * Fetch aggregate stats for the staff dashboard KPI cards.
 * Campus-scoped via RLS.
 */
export async function getStaffDashboardStats(
  campusId?: string
): Promise<DashboardStats> {
  const supabase = await createServerClient();

  // Count applications by status
  let appQuery = supabase
    .from("application")
    .select("status", { count: "exact" });

  if (campusId) {
    appQuery = appQuery.eq("campus_id", campusId);
  }

  const { data: appData, error: appError } = await appQuery;

  if (appError) {
    console.error("[getStaffDashboardStats] applications", appError.message);
    return { totalApplications: 0, pendingReview: 0, seatsAvailable: 0, enrolled: 0 };
  }

  const statusCounts: Record<string, number> = {};
  (appData ?? []).forEach((row: Record<string, unknown>) => {
    const s = row.status as string;
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });

  const totalApplications = (appData ?? []).length;
  const pendingReview = (statusCounts["submitted"] ?? 0) + (statusCounts["needs_info"] ?? 0);

  // Calculate available seats from capacity_plan
  let capacityQuery = supabase
    .from("capacity_plan")
    .select("total_seats, seats_registered");

  if (campusId) {
    capacityQuery = capacityQuery.eq("campus_id", campusId);
  }

  const { data: capacityData, error: capacityError } = await capacityQuery;

  let seatsAvailable = 0;
  let enrolled = 0;

  if (!capacityError && capacityData) {
    capacityData.forEach((row: Record<string, unknown>) => {
      const total = (row.total_seats as number) ?? 0;
      const registered = (row.seats_registered as number) ?? 0;
      seatsAvailable += total - registered;
      enrolled += registered;
    });
  } else if (capacityError) {
    console.error("[getStaffDashboardStats] capacity", capacityError.message);
  }

  return {
    totalApplications,
    pendingReview,
    seatsAvailable: Math.max(0, seatsAvailable),
    enrolled,
  };
}

/**
 * Fetch recent activity for the staff dashboard.
 * Pulls from application_status_history + note additions.
 */
export async function getRecentActivity(opts?: {
  campusId?: string;
  limit?: number;
}): Promise<RecentActivityItem[]> {
  const supabase = await createServerClient();
  const limit = opts?.limit ?? 10;

  // Fetch recent status changes
  let historyQuery = supabase
    .from("application_status_history")
    .select(
      `
      id, from_status, to_status, created_at,
      application:application_id (
        student:student_id (first_name, last_name),
        campus_id
      )
    `
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data: historyData, error: historyError } = await historyQuery;

  if (historyError) {
    console.error("[getRecentActivity]", historyError.message);
    return [];
  }

  const items: RecentActivityItem[] = (historyData ?? []).map(
    (row: Record<string, unknown>) => {
      const app = row.application as Record<string, unknown> | null;
      const student = app?.student as Record<string, string> | null;
      const studentName = student
        ? `${student.first_name} ${student.last_name}`
        : "Unknown Student";

      const toStatus = row.to_status as string;
      const fromStatus = row.from_status as string | null;

      let text = "";
      let icon = "📋";

      switch (toStatus) {
        case "submitted":
          text = `${studentName} submitted an application`;
          icon = "📬";
          break;
        case "needs_info":
          text = `${studentName}'s application needs additional info`;
          icon = "⚠️";
          break;
        case "verified":
          text = `${studentName}'s application was verified`;
          icon = "✅";
          break;
        case "offered":
          text = `Seat offered to ${studentName}`;
          icon = "🎉";
          break;
        case "accepted":
          text = `${studentName} accepted enrollment offer`;
          icon = "✅";
          break;
        case "registered":
          text = `${studentName} completed registration`;
          icon = "🎓";
          break;
        case "waitlisted":
          text = `${studentName} was waitlisted`;
          icon = "📋";
          break;
        default:
          text = `${studentName}'s application moved to ${toStatus}`;
          icon = "📄";
      }

      return {
        id: row.id as string,
        text,
        time: formatRelativeTime(row.created_at as string),
        icon,
      };
    }
  );

  // Filter by campus if needed (post-fetch since nested filter is complex)
  if (opts?.campusId) {
    return items.filter((_, idx) => {
      const row = (historyData ?? [])[idx] as Record<string, unknown>;
      const app = row?.application as Record<string, unknown> | null;
      return (app?.campus_id as string) === opts.campusId;
    }).slice(0, limit);
  }

  return items;
}

/**
 * Fetch upcoming enrollment deadlines for the staff dashboard.
 */
export async function getUpcomingDeadlines(
  campusId?: string
): Promise<UpcomingDeadline[]> {
  const supabase = await createServerClient();
  const now = new Date().toISOString();

  let query = supabase
    .from("enrollment_window")
    .select(
      `
      id, name, close_date,
      campus:campus_id (name)
    `
    )
    .gte("close_date", now)
    .order("close_date", { ascending: true })
    .limit(5);

  if (campusId) {
    query = query.eq("campus_id", campusId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getUpcomingDeadlines]", error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const campus = row.campus as Record<string, string> | null;
    const closeDate = new Date(row.close_date as string);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysLeft = Math.ceil(
      (closeDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      id: row.id as string,
      title: (row.name as string) ?? "Enrollment Window",
      date: closeDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      campus: campus?.name ?? "",
      daysLeft: Math.max(0, daysLeft),
    };
  });
}
