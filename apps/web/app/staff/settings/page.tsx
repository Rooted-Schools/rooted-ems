export const runtime = "edge";
export const dynamic = "force-dynamic";

import { getStaffEnrollmentWindows, getStaffUsers, getCampuses } from "@/lib/queries";
import { SettingsClient } from "./settings-client";

export default async function StaffSettingsPage() {
  const [campuses, windows, users] = await Promise.all([
    getCampuses(),
    getStaffEnrollmentWindows(),
    getStaffUsers(),
  ]);

  return (
    <SettingsClient
      campuses={campuses}
      windows={windows}
      users={users}
    />
  );
}
