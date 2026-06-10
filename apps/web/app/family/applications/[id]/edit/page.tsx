export const runtime = "edge";
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createServerClient } from "@rooted-ems/database/server";
import { getDraftApplicationForEdit, getActiveEnrollmentWindows, getCampuses } from "@/lib/queries";
import { EditApplicationClient } from "./edit-client";

export default async function EditApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch the draft application data (ownership-checked against the auth user)
  const draft = await getDraftApplicationForEdit(id, user.id);
  if (!draft) {
    redirect(`/family/applications/${id}`);
  }

  // Fetch data needed by the form
  const [windows, campuses] = await Promise.all([
    getActiveEnrollmentWindows(),
    getCampuses(),
  ]);

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
    <EditApplicationClient
      draft={draft}
      windows={windows}
      campuses={campuses}
      gradeLevels={grades}
    />
  );
}
