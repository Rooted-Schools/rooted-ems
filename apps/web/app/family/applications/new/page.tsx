export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServerClient } from "@rooted-ems/database/server";
import { redirect } from "next/navigation";
import { getActiveEnrollmentWindows, getCampuses, getExistingHouseholdForUser } from "@/lib/queries";
import { NewApplicationForm } from "./new-application-form";

export default async function NewApplicationPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch data needed by the form. A returning family's existing
  // household/guardian (if any) prefills step 2 so a second child's
  // application doesn't re-collect — and re-duplicate — the same contact
  // info. See lib/mutations/applications.ts (createApplication) for the
  // server-side link-vs-create logic this prefill feeds into.
  const [windows, allCampuses, existingHousehold] = await Promise.all([
    getActiveEnrollmentWindows(),
    getCampuses(),
    getExistingHouseholdForUser(user.id),
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

  // Item 9: if dashboard passed ?campus=RSV, pre-select that campus.
  // Try short_code first, then fall back to partial name match so the pre-selection
  // is resilient to DB short_code mismatches.
  const preselectedCampus = searchParams.campus
    ? campuses.find(
        (c) => c.short_code?.toLowerCase() === searchParams.campus!.toLowerCase()
      ) ??
      campuses.find((c) =>
        c.name.toLowerCase().includes(searchParams.campus!.toLowerCase())
      )
    : // If only one campus has an open window, auto-select it regardless of param
      campuses.length === 1
      ? campuses[0]
      : undefined;

  return (
    <NewApplicationForm
      windows={windows}
      campuses={campuses}
      gradeLevels={grades}
      initialCampusId={preselectedCampus?.id}
      existingHousehold={existingHousehold}
    />
  );
}
