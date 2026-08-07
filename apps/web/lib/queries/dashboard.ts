import { createServiceRoleClient } from "@rooted-ems/database/server";

// ─── Types ─────────────────────────────────────────────

export interface UpcomingDeadline {
  id: string;
  title: string;
  date: string;
  campus: string;
  daysLeft: number;
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
