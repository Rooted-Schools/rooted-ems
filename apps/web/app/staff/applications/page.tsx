export const runtime = "edge";

import { getStaffApplications, getApplicationStats, getCampuses } from "@/lib/queries";
import { StaffApplicationsClient } from "./applications-client";
import { requireStaffSession, getAccessibleCampusIds, resolveActiveCampus } from "@/lib/auth/get-session";

export const dynamic = "force-dynamic";

export default async function StaffApplicationsPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const session = await requireStaffSession();
  const accessibleIds = getAccessibleCampusIds(session);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus);

  const [{ data: applications, count }, stats, allCampuses] = await Promise.all([
    getStaffApplications({ campusId: activeCampus }),
    getApplicationStats(activeCampus),
    getCampuses(),
  ]);

  // Filter campuses to only accessible ones
  const campuses = allCampuses.filter(
    (c) => accessibleIds.length === 0 || accessibleIds.includes(c.id)
  );

  return (
    <StaffApplicationsClient
      applications={applications}
      totalCount={count}
      stats={stats}
      campuses={campuses}
    />
  );
}
