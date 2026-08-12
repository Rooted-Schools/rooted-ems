import { createServiceRoleClient } from "@rooted-ems/database/server";

// ─── Types ─────────────────────────────────────────────

export interface UpcomingDeadline {
  id: string;
  title: string;
  date: string;
  campus: string;
  daysLeft: number;
}

export interface NextWindowOpen {
  campus_id: string;
  campus_name: string;
  /** Raw ISO date — format with timeZone: "UTC" (window dates are stored as
   *  UTC midnight; see app/(public)/landing-client.tsx formatDate). */
  open_date: string;
}

// ─── Queries ─────────────────────────────────────────────

/**
 * Fetch upcoming enrollment deadlines for the staff dashboard.
 */
export async function getUpcomingDeadlines(
  campusId?: string
): Promise<UpcomingDeadline[]> {
  const supabase = createServiceRoleClient();
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
    .eq("status", "open")
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

/**
 * Nearest upcoming enrollment window (by open_date) across the scoped
 * campuses — same "any status, including draft" query shape as the public
 * landing page's getUpcomingEnrollmentWindows (app/(public)/page.tsx),
 * since pre-season windows are drafted well before staff flips them open.
 * Multi-campus scope returns the single nearest one across all of them.
 * Empty/undefined campusIds means org-wide. Null when nothing is upcoming —
 * callers must omit the countdown entirely rather than invent one.
 */
export async function getNextUpcomingWindowOpen(campusIds?: string[]): Promise<NextWindowOpen | null> {
  const supabase = createServiceRoleClient();
  const nowIso = new Date().toISOString();

  let query = supabase
    .from("enrollment_window")
    .select("campus_id, open_date, campus:campus_id (name)")
    .gt("open_date", nowIso)
    .order("open_date", { ascending: true })
    .limit(1);
  if (campusIds && campusIds.length > 0) query = query.in("campus_id", campusIds);

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("[getNextUpcomingWindowOpen]", error.message);
    return null;
  }
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const campus = row.campus as Record<string, string> | null;
  return {
    campus_id: row.campus_id as string,
    campus_name: campus?.name ?? "",
    open_date: row.open_date as string,
  };
}
