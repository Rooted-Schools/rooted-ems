export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServiceRoleClient } from "@rooted-ems/database/server";
import { getCampuses, getActiveEnrollmentWindows } from "@/lib/queries";
import { requireStaffSession } from "@/lib/auth/get-session";
import { StaffNewApplicationForm } from "./new-staff-application";

export default async function StaffNewApplicationPage() {
  const session = await requireStaffSession();

  const supabase = createServiceRoleClient();

  // Fetch all campuses (CMO-level: all campuses, not just assigned)
  const [campuses, windows] = await Promise.all([
    getCampuses(),
    getActiveEnrollmentWindows(),
  ]);

  // Fetch all grade levels
  const { data: gradeLevels } = await supabase
    .from("grade_level")
    .select("id, grade, campus_id")
    .order("grade");

  // Fetch open enrollment windows for new application creation
  const { data: allWindows } = await supabase
    .from("enrollment_window")
    .select("id, name, campus_id, school_year_id, status")
    .eq("status", "open")
    .order("name");

  const grades = (gradeLevels ?? []).map((g: Record<string, unknown>) => ({
    id: g.id as string,
    grade: g.grade as string,
    campus_id: g.campus_id as string,
  }));

  const enrollmentWindows = (allWindows ?? []).map((w: Record<string, unknown>) => ({
    id: w.id as string,
    name: w.name as string,
    campus_id: w.campus_id as string,
    school_year_id: w.school_year_id as string,
    status: w.status as string,
  }));

  return (
    <StaffNewApplicationForm
      campuses={campuses}
      gradeLevels={grades}
      enrollmentWindows={enrollmentWindows}
      staffUserId={session.user_id}
    />
  );
}
