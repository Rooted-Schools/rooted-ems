export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServerClient } from "@rooted-ems/database/server";
import { requireStaffSession, getAccessibleCampusIds, resolveActiveCampus } from "@/lib/auth/get-session";
import { StudentsClient } from "./students-client";

export default async function StaffStudentsPage({
  searchParams,
}: {
  searchParams: { campus?: string; search?: string };
}) {
  const session = await requireStaffSession();
  const accessibleIds = getAccessibleCampusIds(session);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus);
  const scopedCampusIds = activeCampus ? [activeCampus] : accessibleIds;
  const supabase = await createServerClient();

  let appQuery = supabase
    .from("application")
    .select(
      `
      id, status,
      student:student_id (id, first_name, last_name, race_ethnicity, date_of_birth),
      campus:campus_id (name),
      grade_level:grade_level_id (grade),
      guardian:guardian_id (first_name, last_name)
    `
    )
    .neq("status", "draft")
    .order("created_at", { ascending: false });

  if (scopedCampusIds.length > 0) {
    appQuery = appQuery.in("campus_id", scopedCampusIds);
  }

  const { data: apps } = await appQuery;

  const students = (apps ?? []).map((row: Record<string, unknown>) => {
    const student = row.student as Record<string, unknown> | null;
    const campus = row.campus as Record<string, string> | null;
    const grade = row.grade_level as Record<string, string> | null;
    const guardian = row.guardian as Record<string, string> | null;

    return {
      id: (student?.id as string) ?? "",
      first_name: (student?.first_name as string) ?? "",
      last_name: (student?.last_name as string) ?? "",
      grade: grade?.grade ?? "",
      campus_name: campus?.name ?? "",
      status: row.status as string,
      application_id: row.id as string,
      guardian_name: guardian
        ? `${guardian.first_name} ${guardian.last_name}`
        : "",
      race_ethnicity: (student?.race_ethnicity as string[]) ?? [],
    };
  });

  return <StudentsClient students={students} initialSearch={searchParams?.search ?? ""} />;
}
