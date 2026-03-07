export const runtime = "edge";
export const dynamic = "force-dynamic";

import { getStaffEnrollmentWindows, getStaffUsers, getCampuses } from "@/lib/queries";
import { SettingsClient } from "./settings-client";
import { requireStaffSession, getAccessibleCampusIds } from "@/lib/auth/get-session";

export default async function StaffSettingsPage() {
  const session = await requireStaffSession();
  const campusIds = getAccessibleCampusIds(session);
  const singleCampus = campusIds.length === 1 ? campusIds[0] : undefined;

  const [allCampuses, windows, users] = await Promise.all([
    getCampuses(),
    getStaffEnrollmentWindows(singleCampus),
    getStaffUsers(singleCampus),
  ]);

  // Scope campuses to accessible ones
  const campuses = campusIds.length > 0
    ? allCampuses.filter((c) => campusIds.includes(c.id))
    : allCampuses;

  return (
    <SettingsClient
      campuses={campuses}
      windows={windows}
      users={users}
    />
  );
}
