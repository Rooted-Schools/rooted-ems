export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServiceRoleClient } from "@rooted-ems/database/server";
import { ReportsClient } from "./reports-client";
import { requireMinRole, hasMinRole, getAccessibleCampusIds, resolveActiveCampus, hasNetworkAccess } from "@/lib/auth/get-session";
import { getCampusLensId } from "@/lib/campus-lens";
import { SectionTabs } from "@/components/layout/section-tabs";
import { INSIGHTS_TABS } from "@/lib/section-tabs";
import { getReenrollmentStats } from "@/lib/queries/reenrollment";

export interface ReportData {
  pipeline: { status: string; count: number }[];
  demographics: { group: string; count: number }[];
  capacity: {
    campus: string;
    grade: string;
    total_seats: number;
    seats_offered: number;
    seats_accepted: number;
    seats_registered: number;
  }[];
  enrollments: {
    student_name: string;
    grade: string;
    campus: string;
    status: string;
    enrolled_at: string | null;
    sis_id: string | null;
  }[];
  auditEvents: {
    action: string;
    table_name: string;
    actor_name: string;
    created_at: string;
    details: string;
  }[];
  reenrollment: {
    schoolYearName: string | null;
    nextSchoolYearName: string | null;
    eligible: number;
    respondedYes: number;
    respondedDeciding: number;
    respondedNo: number;
    noResponse: number;
    available: boolean;
  };
}

export default async function StaffReportsPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  // Race/ethnicity breakdowns and a named enrollment roster — manager gate,
  // not the is_staff floor a compliance auditor also clears.
  const session = await requireMinRole("enrollment_manager");
  const accessibleIds = getAccessibleCampusIds(session);
  const lensCampusId = await getCampusLensId(accessibleIds);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus, lensCampusId);
  const scopedCampusIds = activeCampus ? [activeCampus] : accessibleIds;

  const supabase = createServiceRoleClient();
  const hasCampusFilter = scopedCampusIds.length > 0;

  // Build campus-scoped queries
  let appQuery = supabase
    .from("application")
    .select(`
      id, status,
      student:student_id (race_ethnicity)
    `)
    .neq("status", "draft");
  if (hasCampusFilter) appQuery = appQuery.in("campus_id", scopedCampusIds);

  let capacityQuery = supabase
    .from("capacity_plan")
    .select(`
      total_seats, seats_offered, seats_accepted, seats_registered,
      campus:campus_id (name),
      grade_level:grade_level_id (grade)
    `)
    .order("campus_id")
    .order("grade_level_id");
  if (hasCampusFilter) capacityQuery = capacityQuery.in("campus_id", scopedCampusIds);

  let enrollQuery = supabase
    .from("enrollment")
    .select(`
      status, enrolled_at, sis_student_id,
      student:student_id (first_name, last_name),
      campus:campus_id (name),
      grade_level:grade_level_id (grade)
    `)
    .order("enrolled_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (hasCampusFilter) enrollQuery = enrollQuery.in("campus_id", scopedCampusIds);

  // Fetch data for all reports in parallel
  const [
    { data: apps },
    { data: capacityPlans },
    { data: enrollmentRows },
    { data: auditRows },
    reenrollmentStats,
  ] = await Promise.all([
    appQuery,
    capacityQuery,
    enrollQuery,
    (() => {
      let q = supabase
        .from("audit_event")
        // audit_event has old_data/new_data, not a single "changes" column —
        // selecting the latter errors and (since this destructure never
        // checked `error`) silently emptied the Audit Events tab.
        .select("action, table_name, created_at, old_data, new_data, actor:actor_id (full_name, email)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (hasCampusFilter) q = q.in("campus_id", scopedCampusIds);
      return q;
    })(),
    getReenrollmentStats(hasCampusFilter ? scopedCampusIds : undefined),
  ]);

  // Pipeline counts
  const statusCounts: Record<string, number> = {};
  for (const app of (apps ?? []) as Record<string, unknown>[]) {
    const st = app.status as string;
    statusCounts[st] = (statusCounts[st] ?? 0) + 1;
  }
  const pipeline = Object.entries(statusCounts).map(([status, count]) => ({
    status,
    count,
  }));

  // Demographics
  const demoCounts: Record<string, number> = {};
  for (const app of (apps ?? []) as Record<string, unknown>[]) {
    const student = app.student as unknown as Record<string, unknown> | null;
    const ethnicities = (student?.race_ethnicity ?? []) as string[];
    if (ethnicities.length === 0) {
      demoCounts["Not specified"] = (demoCounts["Not specified"] ?? 0) + 1;
    } else {
      for (const eth of ethnicities) {
        demoCounts[eth] = (demoCounts[eth] ?? 0) + 1;
      }
    }
  }
  const demographics = Object.entries(demoCounts)
    .map(([group, count]) => ({ group, count }))
    .sort((a, b) => b.count - a.count);

  // Capacity
  const capacity = (capacityPlans ?? []).map((row: Record<string, unknown>) => {
    const campus = row.campus as Record<string, string> | null;
    const grade = row.grade_level as Record<string, string> | null;
    return {
      campus: campus?.name ?? "",
      grade: grade?.grade ? `Grade ${grade.grade}` : "",
      total_seats: (row.total_seats as number) ?? 0,
      seats_offered: (row.seats_offered as number) ?? 0,
      seats_accepted: (row.seats_accepted as number) ?? 0,
      seats_registered: (row.seats_registered as number) ?? 0,
    };
  });

  // Enrollments for compliance
  const enrollments = (enrollmentRows ?? []).map(
    (row: Record<string, unknown>) => {
      const student = row.student as unknown as Record<string, string> | null;
      const campus = row.campus as Record<string, string> | null;
      const grade = row.grade_level as Record<string, string> | null;
      return {
        student_name: student
          ? `${student.first_name} ${student.last_name}`
          : "Unknown",
        grade: grade?.grade ? `Grade ${grade.grade}` : "",
        campus: campus?.name ?? "",
        status: row.status as string,
        enrolled_at: row.enrolled_at
          ? new Date(row.enrolled_at as string).toLocaleDateString("en-US")
          : null,
        sis_id: (row.sis_student_id as string) ?? null,
      };
    }
  );

  // Audit events
  const auditEvents = (auditRows ?? []).map(
    (row: Record<string, unknown>) => {
      const actor = row.actor as Record<string, string> | null;
      const changes = row.new_data ?? row.old_data;
      return {
      action: row.action as string,
      table_name: row.table_name as string,
      actor_name: actor?.full_name ?? actor?.email ?? "",
      created_at: new Date(row.created_at as string).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
      details: changes ? JSON.stringify(changes).slice(0, 120) : "",
    };
    });

  const reportData: ReportData = {
    pipeline,
    demographics,
    capacity,
    enrollments,
    auditEvents,
    reenrollment: reenrollmentStats,
  };

  const insightsTabs = hasMinRole(session, "enrollment_manager")
    ? INSIGHTS_TABS
    : INSIGHTS_TABS.filter((t) => t.href === "/staff/reports");

  // Network/CMO access is system_admin on two or more campuses
  // (hasNetworkAccess === isCMOAdmin, see lib/auth/get-session.ts). It used to
  // be inferred from an empty campus list, which both denied the real CMO and
  // let a half-provisioned account read as org-wide.
  const showNetworkLink = hasNetworkAccess(session);

  return (
    <div className="space-y-6">
      <SectionTabs
        tabs={insightsTabs}
        activeHref="/staff/reports"
        campusParam={searchParams?.campus}
      />
      <ReportsClient data={reportData} showNetworkLink={showNetworkLink} />
    </div>
  );
}
