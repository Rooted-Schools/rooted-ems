export const runtime = "edge";
export const dynamic = "force-dynamic";

import { getDemographicBreakdowns, getCampuses } from "@/lib/queries";
import { EquityClient } from "./equity-client";
import {
  requireMinRole,
  getAccessibleCampusIds,
  resolveActiveCampus,
} from "@/lib/auth/get-session";

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
    <EquityClient
      data={data}
      campuses={campuses}
      initialCampus={searchParams?.campus ?? "all"}
    />
  );
}
