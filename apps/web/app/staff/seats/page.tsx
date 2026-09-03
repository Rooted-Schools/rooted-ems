export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServiceRoleClient } from "@rooted-ems/database/server";
import { requireMinRole, getAccessibleCampusIds, resolveActiveCampus } from "@/lib/auth/get-session";
import { getCampusLensId } from "@/lib/campus-lens";
import { SectionTabs } from "@/components/layout/section-tabs";
import { SEATS_LOTTERY_TABS } from "@/lib/section-tabs";
import { getOfferAcceptHistory, offerHistoryKey } from "@/lib/queries/offer-history";
import { SeatsClient } from "./seats-client";

export default async function SeatManagementPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const session = await requireMinRole("enrollment_manager");
  const accessibleIds = getAccessibleCampusIds(session);
  const lensCampusId = await getCampusLensId(accessibleIds);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus, lensCampusId);
  // Seat management is a single-campus view: staff see only their own campus's
  // seat counts, never a cross-campus aggregate of all three schools (that read
  // as unnecessary CMO-level data to school staff). A multi-campus admin
  // switches campus with the header selector; with none selected, this defaults
  // to their first campus rather than showing every school at once.
  const seatCampus = activeCampus ?? accessibleIds[0] ?? null;
  const scopedCampusIds = seatCampus ? [seatCampus] : [];
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
      campus_id,
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

  // Offer accept history is read alongside the plans: real resolved offers only,
  // across all school years, so a prior cycle can inform this cycle's guidance.
  const [{ data: plans }, offerHistory] = await Promise.all([
    planQuery,
    getOfferAcceptHistory(scopedCampusIds),
  ]);

  const rows = (plans ?? []).map((row: Record<string, unknown>) => {
    const campus = row.campus as Record<string, string> | null;
    const grade = row.grade_level as Record<string, string> | null;
    const campusId = (row.campus_id as string) ?? "";
    const gradeCode = grade?.grade ?? "";
    const history = offerHistory[offerHistoryKey(campusId, gradeCode)] ?? null;
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
      // Real history only. No history -> zeros and a null rate, and the client
      // says so rather than showing a made-up benchmark.
      offers_resolved: history?.resolved ?? 0,
      offers_accepted: history?.accepted ?? 0,
      accept_rate: history?.acceptRate ?? null,
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
