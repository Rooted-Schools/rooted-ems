export const runtime = "edge";
export const dynamic = "force-dynamic";

import { getDemographicBreakdowns, getCampuses } from "@/lib/queries";
import { EquityClient } from "./equity-client";
import {
  requireMinRole,
  getAccessibleCampusIds,
  resolveActiveCampus,
} from "@/lib/auth/get-session";
import { SectionTabs } from "@/components/layout/section-tabs";
import { INSIGHTS_TABS } from "@/lib/section-tabs";

export default async function EquityPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const session = await requireMinRole("enrollment_manager");
  const accessibleIds = getAccessibleCampusIds(session);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus);

  const [data, allCampuses] = await Promise.all([
    getDemographicBreakdowns(activeCampus),
    getCampuses(),
  ]);

  // Filter campuses to only those accessible to this user
  const campuses = allCampuses.filter(
    (c) => accessibleIds.length === 0 || accessibleIds.includes(c.id)
  );

  return (
    <div className="space-y-6">
      <SectionTabs
        tabs={INSIGHTS_TABS}
        activeHref="/staff/equity"
        campusParam={searchParams?.campus}
      />
      <EquityClient
        data={data}
        campuses={campuses}
        initialCampus={searchParams?.campus ?? "all"}
      />
    </div>
  );
}
