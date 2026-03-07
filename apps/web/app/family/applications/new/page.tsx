export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServerClient } from "@rooted-ems/database/server";
import { redirect } from "next/navigation";
import { getActiveEnrollmentWindows, getCampuses } from "@/lib/queries";
import { NewApplicationForm } from "./new-application-form";

export default async function NewApplicationPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch data needed by the form
  const [windows, allCampuses] = await Promise.all([
    getActiveEnrollmentWindows(),
    getCampuses(),
  ]);

  // Only show campuses that have an open enrollment window
  const openCampusIds = new Set(
    windows.filter((w) => w.is_open).map((w) => w.campus_id)
  );
  const campuses = allCampuses.filter((c) => openCampusIds.has(c.id));

  // Fetch grade levels
  const { data: gradeLevels } = await supabase
    .from("grade_level")
    .select("id, grade, campus_id")
    .order("grade");

  const grades = (gradeLevels ?? []).map((g: Record<string, unknown>) => ({
    id: g.id as string,
    grade: g.grade as string,
    campus_id: g.campus_id as string,
  }));

  return (
    <NewApplicationForm
      windows={windows}
      campuses={campuses}
      gradeLevels={grades}
    />
  );
}
