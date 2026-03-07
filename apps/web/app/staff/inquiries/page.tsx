export const runtime = "edge";

import { createServerClient } from "@rooted-ems/database/server";
import { getStaffInquiries, getInquiryStats, getCampuses } from "@/lib/queries";
import { InquiriesClient } from "./inquiries-client";
import { requireStaffSession, getAccessibleCampusIds, resolveActiveCampus } from "@/lib/auth/get-session";

export const dynamic = "force-dynamic";

export default async function StaffInquiriesPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const session = await requireStaffSession();
  const accessibleIds = getAccessibleCampusIds(session);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus);
  const scopedCampusIds = activeCampus ? [activeCampus] : accessibleIds;

  const supabase = await createServerClient();

  const [inquiries, stats, allCampuses, gradeData, windowData] = await Promise.all([
    getStaffInquiries(scopedCampusIds),
    getInquiryStats(scopedCampusIds),
    getCampuses(),
    supabase.from("grade_level").select("id, grade, campus_id").order("grade"),
    supabase.from("enrollment_window").select("id, name, campus_id, status").order("name"),
  ]);

  const campuses = allCampuses.filter(
    (c) => accessibleIds.length === 0 || accessibleIds.includes(c.id)
  );

  const gradeLevels = (gradeData.data ?? []).map((g: Record<string, unknown>) => ({
    id: g.id as string,
    grade: g.grade as string,
    campus_id: g.campus_id as string,
  }));

  const enrollmentWindows = (windowData.data ?? []).map((w: Record<string, unknown>) => ({
    id: w.id as string,
    name: w.name as string,
    campus_id: w.campus_id as string,
    status: w.status as string,
  }));

  return (
    <InquiriesClient
      inquiries={inquiries}
      stats={stats}
      campuses={campuses}
      gradeLevels={gradeLevels}
      enrollmentWindows={enrollmentWindows}
      staffId={session.user_id}
      staffName={session.email ?? "Staff"}
    />
  );
}
