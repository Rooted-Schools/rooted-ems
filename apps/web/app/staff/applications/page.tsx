export const runtime = "edge";

import { getStaffApplications, getApplicationStats, getCampuses } from "@/lib/queries";
import { StaffApplicationsClient } from "./applications-client";
import { requireStaffSession, getAccessibleCampusIds, resolveActiveCampus } from "@/lib/auth/get-session";
import { getCampusLensId } from "@/lib/campus-lens";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function StaffApplicationsPage({
  searchParams,
}: {
  searchParams: { campus?: string; status?: string; search?: string; page?: string; guardians?: string };
}) {
  const session = await requireStaffSession();
  const accessibleIds = getAccessibleCampusIds(session);
  const lensCampusId = await getCampusLensId(accessibleIds);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus, lensCampusId);
  const statusParam = searchParams?.status && searchParams.status !== "all" ? searchParams.status : undefined;
  const searchParam = searchParams?.search || undefined;
  const parsedPage = Number.parseInt(searchParams?.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  // Duplicate-household "Compare": show ONLY the flagged guardians' applications.
  const guardianIds = searchParams?.guardians
    ? searchParams.guardians.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  const [{ rows: applications, totalCount }, stats, allCampuses] = await Promise.all([
    getStaffApplications({
      // In compare mode we want the flagged guardians regardless of campus lens,
      // so their duplicate can be seen even across the active-campus filter.
      campusId: guardianIds ? undefined : activeCampus,
      status: statusParam,
      search: searchParam,
      guardianIds,
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
      initialCampus={searchParams?.campus ?? lensCampusId ?? "all"}
      compareCount={guardianIds ? totalCount : 0}
    />
  );
}
