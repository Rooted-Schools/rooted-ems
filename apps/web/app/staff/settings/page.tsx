export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServerClient } from "@rooted-ems/database/server";
import { getStaffEnrollmentWindows, getStaffUsers, getCampuses, getStaffPacketRequirements } from "@/lib/queries";
import { SettingsClient } from "./settings-client";
import { requireMinRole, getAccessibleCampusIds, resolveActiveCampus } from "@/lib/auth/get-session";

export default async function StaffSettingsPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const session = await requireMinRole("enrollment_manager");
  const accessibleIds = getAccessibleCampusIds(session);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus);
  const supabase = await createServerClient();

  const [allCampuses, windows, users, { data: schoolYears }, packetRequirements, { data: gradeLevels }, { data: settings }] = await Promise.all([
    getCampuses(),
    getStaffEnrollmentWindows(activeCampus),
    getStaffUsers(activeCampus),
    supabase.from("school_year").select("id, name, is_current, start_date, end_date").order("start_date", { ascending: false }),
    getStaffPacketRequirements(),
    supabase.from("grade_level").select("id, grade, campus_id").order("grade"),
    supabase.from("setting").select("key, value").limit(50),
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
        start_date: (sy.start_date as string) ?? "",
        end_date: (sy.end_date as string) ?? "",
      }))}
      gradeLevels={(gradeLevels ?? []).map((g: Record<string, unknown>) => ({
        id: g.id as string,
        grade: g.grade as string,
        campus_id: g.campus_id as string,
      }))}
      systemSettings={Object.fromEntries(
        (settings ?? []).map((s: Record<string, string>) => [s.key, s.value])
      )}
      staffUserId={session.user_id}
      activeCampusId={activeCampus ?? undefined}
    />
  );
}
