export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServerClient } from "@rooted-ems/database/server";
import { requireMinRole, getAccessibleCampusIds, resolveActiveCampus } from "@/lib/auth/get-session";
import { SeatsClient } from "./seats-client";

export default async function SeatManagementPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const session = await requireMinRole("enrollment_manager");
  const accessibleIds = getAccessibleCampusIds(session);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus);
  const scopedCampusIds = activeCampus ? [activeCampus] : accessibleIds;
  const supabase = await createServerClient();

  // Get current school year(s)
  const { data: currentYears } = await supabase
    .from("school_year")
    .select("id, name")
    .eq("is_current", true);

  const currentYearIds = (currentYears ?? []).map((y: Record<string, unknown>) => y.id as string);

  let planQuery = supabase
    .from("capacity_plan")
    .select(
      `
      id, total_seats, seats_offered, seats_accepted, seats_registered,
      campus:campus_id (name),
      grade_level:grade_level_id (grade),
      school_year:school_year_id (name)
    `
    )
    .order("campus_id")
    .order("grade_level_id");

  if (currentYearIds.length > 0) {
    planQuery = planQuery.in("school_year_id", currentYearIds);
  }
  if (scopedCampusIds.length > 0) {
    planQuery = planQuery.in("campus_id", scopedCampusIds);
  }

  const { data: plans } = await planQuery;

  const rows = (plans ?? []).map((row: Record<string, unknown>) => {
    const campus = row.campus as Record<string, string> | null;
    const grade = row.grade_level as Record<string, string> | null;
    const total = (row.total_seats as number) ?? 0;
    const offered = (row.seats_offered as number) ?? 0;
    const accepted = (row.seats_accepted as number) ?? 0;
    const registered = (row.seats_registered as number) ?? 0;
    const available = total - offered - accepted - registered;

    return {
      id: row.id as string,
      campus_name: campus?.name ?? "",
      grade: grade?.grade ?? "",
      total_seats: total,
      seats_offered: offered,
      seats_accepted: accepted,
      seats_registered: registered,
      available: Math.max(0, available),
      fill_pct: total > 0 ? Math.round((registered / total) * 100) : 0,
    };
  });

  return <SeatsClient rows={rows} />;
}
