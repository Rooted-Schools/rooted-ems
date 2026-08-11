export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServiceRoleClient } from "@rooted-ems/database/server";
import { getStaffEnrollmentWindows, getStaffUsers, getCampuses, getStaffPacketRequirements } from "@/lib/queries";
import { SettingsClient } from "./settings-client";
import { requireMinRole, getAccessibleCampusIds, resolveActiveCampus, hasMinRole } from "@/lib/auth/get-session";
import { isSmsConfigured } from "@/lib/sms";
import { isEmailConfigured } from "@/lib/email";
import { ChannelStatus } from "./_components/channel-status";
import { AutomationHealth } from "./_components/automation-health";
import { getAutomationHealth, getOverdueJourneySteps } from "@/lib/queries/automation-health";

export default async function StaffSettingsPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const session = await requireMinRole("enrollment_manager");
  const accessibleIds = getAccessibleCampusIds(session);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus);
  const supabase = createServiceRoleClient();

  // Capacity plans, scoped to accessible campuses — feeds the Settings
  // Capacity Plans card's inline seat-total editing (mirrors /staff/seats).
  let capacityPlanQuery = supabase
    .from("capacity_plan")
    .select(
      `
      id, total_seats, campus_id, grade_level_id, school_year_id,
      campus:campus_id (name),
      grade_level:grade_level_id (grade),
      school_year:school_year_id (name)
    `
    )
    .order("campus_id")
    .order("grade_level_id");
  if (accessibleIds.length > 0) {
    capacityPlanQuery = capacityPlanQuery.in("campus_id", accessibleIds);
  }

  const [
    allCampuses,
    windows,
    users,
    { data: schoolYears },
    packetRequirements,
    { data: gradeLevels },
    { data: settings },
    automationHealth,
    overdueJourneySteps,
    { data: capacityPlans },
  ] = await Promise.all([
    getCampuses(),
    getStaffEnrollmentWindows(activeCampus),
    getStaffUsers(activeCampus),
    supabase.from("school_year").select("id, name, is_current, start_date, end_date").order("start_date", { ascending: false }),
    getStaffPacketRequirements(),
    supabase.from("grade_level").select("id, grade, campus_id, school_year_id").order("grade"),
    supabase.from("setting").select("key, value").limit(50),
    getAutomationHealth(),
    getOverdueJourneySteps(),
    capacityPlanQuery,
  ]);

  // Scope campuses to accessible ones
  const campuses = accessibleIds.length > 0
    ? allCampuses.filter((c) => accessibleIds.includes(c.id))
    : allCampuses;

  return (
    <div className="space-y-6">
      <ChannelStatus
        emailConfigured={isEmailConfigured()}
        smsConfigured={isSmsConfigured()}
      />
      <AutomationHealth
        rows={automationHealth}
        overdueJourneySteps={overdueJourneySteps}
      />
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
        school_year_id: g.school_year_id as string,
      }))}
      capacityPlans={(capacityPlans ?? []).map((p: Record<string, unknown>) => {
        const campus = p.campus as Record<string, string> | null;
        const grade = p.grade_level as Record<string, string> | null;
        const schoolYear = p.school_year as Record<string, string> | null;
        return {
          id: p.id as string,
          campus_id: p.campus_id as string,
          campus_name: campus?.name ?? "",
          grade_level_id: p.grade_level_id as string,
          grade: grade?.grade ?? "",
          school_year_id: p.school_year_id as string,
          school_year_name: schoolYear?.name ?? "",
          total_seats: (p.total_seats as number) ?? 0,
        };
      })}
      systemSettings={Object.fromEntries(
        (settings ?? []).map((s: Record<string, string>) => [s.key, s.value])
      )}
        staffUserId={session.user_id}
        activeCampusId={activeCampus ?? undefined}
        isSystemAdmin={hasMinRole(session, "system_admin")}
      />
    </div>
  );
}
