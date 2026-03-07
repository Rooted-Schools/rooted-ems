export const runtime = "edge";

import { getStaffApplications, getApplicationStats, getCampuses } from "@/lib/queries";
import { StaffApplicationsClient } from "./applications-client";
import { requireStaffSession, getAccessibleCampusIds } from "@/lib/auth/get-session";

export const dynamic = "force-dynamic";

export default async function StaffApplicationsPage() {
  const session = await requireStaffSession();
  const campusIds = getAccessibleCampusIds(session);
  const singleCampus = campusIds.length === 1 ? campusIds[0] : undefined;

  const [{ data: applications, count }, stats, allCampuses] = await Promise.all([
    getStaffApplications({ campusId: singleCampus }),
    getApplicationStats(singleCampus),
    getCampuses(),
  ]);

  // Filter campuses to only accessible ones
  const campuses = allCampuses.filter(
    (c) => campusIds.length === 0 || campusIds.includes(c.id)
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
