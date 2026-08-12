export const runtime = "edge";
export const dynamic = "force-dynamic";

import { getDemographicBreakdowns, getCampuses } from "@/lib/queries";
import { getEquityFunnelConversion } from "@/lib/queries/equity-funnel";
import { EquityClient } from "./equity-client";
import {
  requireMinRole,
  getAccessibleCampusIds,
  resolveActiveCampus,
} from "@/lib/auth/get-session";
import { getCampusLensId } from "@/lib/campus-lens";
import { SectionTabs } from "@/components/layout/section-tabs";
import { INSIGHTS_TABS } from "@/lib/section-tabs";

export default async function EquityPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const session = await requireMinRole("enrollment_manager");
  const accessibleIds = getAccessibleCampusIds(session);
  const lensCampusId = await getCampusLensId(accessibleIds);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus, lensCampusId);
  // Conversion-by-group reads the same campus scope the page is already showing:
  // the selected campus when one is chosen, otherwise every campus this user
  // can see.
  const scopedCampusIds = activeCampus ? [activeCampus] : accessibleIds;

  const [data, allCampuses, conversion] = await Promise.all([
    getDemographicBreakdowns(activeCampus),
    getCampuses(),
    getEquityFunnelConversion(scopedCampusIds),
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
        conversion={conversion}
        campuses={campuses}
        initialCampus={searchParams?.campus ?? lensCampusId ?? "all"}
      />
    </div>
  );
}
