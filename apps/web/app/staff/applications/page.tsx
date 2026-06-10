export const runtime = "edge";

import { getStaffApplications, getApplicationStats, getCampuses } from "@/lib/queries";
import { StaffApplicationsClient } from "./applications-client";
import { requireStaffSession, getAccessibleCampusIds, resolveActiveCampus } from "@/lib/auth/get-session";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function StaffApplicationsPage({
  searchParams,
}: {
  searchParams: { campus?: string; status?: string; search?: string; page?: string };
}) {
  const session = await requireStaffSession();
  const accessibleIds = getAccessibleCampusIds(session);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus);
  const statusParam = searchParams?.status && searchParams.status !== "all" ? searchParams.status : undefined;
  const searchParam = searchParams?.search || undefined;
  const parsedPage = Number.parseInt(searchParams?.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const [{ rows: applications, totalCount }, stats, allCampuses] = await Promise.all([
    getStaffApplications({
      campusId: activeCampus,
      status: statusParam,
      search: searchParam,
      page,
      pageSize: PAGE_SIZE,
    }),
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
      totalCount={totalCount}
      page={page}
      pageSize={PAGE_SIZE}
      stats={stats}
      campuses={campuses}
      initialStatus={searchParams?.status ?? "all"}
      initialSearch={searchParams?.search ?? ""}
      initialCampus={searchParams?.campus ?? "all"}
    />
  );
}
