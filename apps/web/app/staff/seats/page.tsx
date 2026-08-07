export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServiceRoleClient } from "@rooted-ems/database/server";
import { requireMinRole, getAccessibleCampusIds, resolveActiveCampus } from "@/lib/auth/get-session";
import { SectionTabs } from "@/components/layout/section-tabs";
import { SEATS_LOTTERY_TABS } from "@/lib/section-tabs";
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
  const supabase = createServiceRoleClient();

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
    // offered/accepted/registered are cumulative pipeline stages, not independent buckets
    // available = total capacity minus highest committed stage to avoid double-counting
    const committed = Math.max(offered, accepted, registered);
    const available = total - committed;

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

  return (
    <div className="space-y-6">
      <SectionTabs
        tabs={SEATS_LOTTERY_TABS}
        activeHref="/staff/seats"
        campusParam={searchParams?.campus}
      />
      <SeatsClient rows={rows} />
    </div>
  );
}
