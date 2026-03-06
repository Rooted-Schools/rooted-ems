import { getStaffApplications, getApplicationStats, getCampuses } from "@/lib/queries";
import { StaffApplicationsClient } from "./applications-client";

export const dynamic = "force-dynamic";

export default async function StaffApplicationsPage() {
  const [{ data: applications, count }, stats, campuses] = await Promise.all([
    getStaffApplications(),
    getApplicationStats(),
    getCampuses(),
  ]);

  return (
    <StaffApplicationsClient
      applications={applications}
      totalCount={count}
      stats={stats}
      campuses={campuses}
    />
  );
}
