export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServerClient } from "@rooted-ems/database/server";
import { getStaffEnrollmentWindows, getStaffUsers, getCampuses, getStaffPacketRequirements } from "@/lib/queries";
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
  const supabase = await createServerClient();

  const [allCampuses, windows, users, { data: schoolYears }, packetRequirements] = await Promise.all([
    getCampuses(),
    getStaffEnrollmentWindows(activeCampus),
    getStaffUsers(activeCampus),
    supabase.from("school_year").select("id, name, is_current").order("start_date", { ascending: false }),
    getStaffPacketRequirements(),
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
      packetRequirements={packetRequirements}
      schoolYears={(schoolYears ?? []).map((sy: Record<string, unknown>) => ({
        id: sy.id as string,
        name: sy.name as string,
        is_current: sy.is_current as boolean,
      }))}
      staffUserId={session.user_id}
    />
  );
}
