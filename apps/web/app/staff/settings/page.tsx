export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServiceRoleClient } from "@rooted-ems/database/server";
import { getStaffEnrollmentWindows, getStaffUsers, getCampuses, getStaffPacketRequirements } from "@/lib/queries";
import { SettingsClient } from "./settings-client";
import { requireMinRole, getAccessibleCampusIds, resolveActiveCampus, hasMinRole, hasRoleOnCampus } from "@/lib/auth/get-session";
import { getCampusLensId } from "@/lib/campus-lens";
import { isSmsConfigured } from "@/lib/sms";
import { isEmailConfigured } from "@/lib/email";
import { ChannelStatus } from "./_components/channel-status";
import { AutomationHealth } from "./_components/automation-health";
import { WelcomeMessagingToggle } from "./_components/welcome-messaging-toggle";
import { getAutomationHealth, getOverdueJourneySteps } from "@/lib/queries/automation-health";
import { isWelcomeMessagingEnabled } from "@/lib/messaging-flags";
import { getCampusMessageOverrides } from "@/lib/queries/message-overrides";
import {
  INQUIRY_WELCOME_DEFAULT_TEXT,
  INQUIRY_WELCOME_MERGE_FIELDS,
} from "@/lib/email-templates";

/** The only template the settings editor exposes today. */
const INQUIRY_WELCOME_KEY = "inquiryWelcome";

export default async function StaffSettingsPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const session = await requireMinRole("enrollment_manager");
  const accessibleIds = getAccessibleCampusIds(session);
  const lensCampusId = await getCampusLensId(accessibleIds);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus, lensCampusId);
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
    welcomeMessagingEnabled,
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
    isWelcomeMessagingEnabled(),
  ]);

  // Scope campuses to accessible ones
  const campuses = accessibleIds.length > 0
    ? allCampuses.filter((c) => accessibleIds.includes(c.id))
    : allCampuses;

  // The editor always opens on real text: the campus's own override where one
  // exists, otherwise the built-in default resolved here on the server, so the
  // client never has to know how the default is composed and the email module
  // stays out of the browser bundle.
  // Narrowed again to the campuses this viewer can actually write to. The page
  // gate is enrollment_manager somewhere; the mutation gate is
  // enrollment_manager on the campus. Showing an editor that would redirect on
  // Save is worse than not showing it.
  const editableCampuses = campuses.filter((c) =>
    hasRoleOnCampus(session, c.id, "enrollment_manager")
  );
  const overrides = await getCampusMessageOverrides(editableCampuses.map((c) => c.id));
  const welcomeMessages = editableCampuses.map((campus) => {
    const row = overrides.find(
      (o) => o.campus_id === campus.id && o.template_key === INQUIRY_WELCOME_KEY
    );
    return {
      campus_id: campus.id,
      campus_name: campus.name,
      subject_en: row?.subject_en ?? INQUIRY_WELCOME_DEFAULT_TEXT.subjectEn,
      subject_es: row?.subject_es ?? INQUIRY_WELCOME_DEFAULT_TEXT.subjectEs,
      body_en: row?.body_en ?? INQUIRY_WELCOME_DEFAULT_TEXT.bodyEn,
      body_es: row?.body_es ?? INQUIRY_WELCOME_DEFAULT_TEXT.bodyEs,
      is_customized: !!row,
      updated_at: row?.updated_at ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <ChannelStatus
        emailConfigured={isEmailConfigured()}
        smsConfigured={isSmsConfigured()}
      />
      <WelcomeMessagingToggle
        enabled={welcomeMessagingEnabled}
        canEdit={hasMinRole(session, "system_admin")}
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
        welcomeMessages={welcomeMessages}
        welcomeMergeFields={INQUIRY_WELCOME_MERGE_FIELDS.map((f) => ({
          token: f.token,
          label: f.label,
        }))}
        staffUserId={session.user_id}
        activeCampusId={activeCampus ?? undefined}
        isSystemAdmin={hasMinRole(session, "system_admin")}
      />
    </div>
  );
}
