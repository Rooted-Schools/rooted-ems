export const runtime = "edge";
export const dynamic = "force-dynamic";

import { getStaffEnrollmentWindows, getStaffUsers, getCampuses } from "@/lib/queries";
import { SettingsClient } from "./settings-client";
import { requireStaffSession, getAccessibleCampusIds, resolveActiveCampus } from "@/lib/auth/get-session";

export default async function StaffSettingsPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const session = await requireStaffSession();
  const accessibleIds = getAccessibleCampusIds(session);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus);

  const [allCampuses, windows, users] = await Promise.all([
    getCampuses(),
    getStaffEnrollmentWindows(activeCampus),
    getStaffUsers(activeCampus),
  ]);

  // Scope campuses to accessible ones
  const campuses = accessibleIds.length > 0
    ? allCampuses.filter((c) => accessibleIds.includes(c.id))
    : allCampuses;

  return (
    <SettingsClient
      campuses={campuses}
      windows={windows}
      users={users}
    />
  );
}
