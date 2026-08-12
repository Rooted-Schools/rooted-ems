export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requireStaffSession, getAccessibleCampusIds, resolveActiveCampus } from "@/lib/auth/get-session";
import { getCampusLensId } from "@/lib/campus-lens";
import { createServerClient } from "@rooted-ems/database/server";
import { getJourneys } from "@/lib/queries/journeys";
import { JourneysClient } from "./journeys-client";

/**
 * Journey list — the fix for "Nurture Journeys still doesn't allow me to do
 * anything." Every journey the caller can see, active or paused, with real
 * counts, each row linking to its detail page for management.
 */
export default async function JourneysListPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  let session;
  try {
    session = await requireStaffSession();
  } catch {
    redirect("/staff-login");
  }

  const accessibleIds = getAccessibleCampusIds(session);
  const lensCampusId = await getCampusLensId(accessibleIds);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus, lensCampusId);
  const supabase = await createServerClient();
  const [journeys, { data: campusRows }] = await Promise.all([
    getJourneys(activeCampus),
    supabase.from("campus").select("id, name, short_code").order("name"),
  ]);

  const campuses = (campusRows ?? [])
    .filter((c: Record<string, string>) => accessibleIds.length === 0 || accessibleIds.includes(c.id))
    .map((c: Record<string, string>) => ({ id: c.id, name: c.name, short_code: c.short_code }));

  return <JourneysClient journeys={journeys} campuses={campuses} activeCampusId={activeCampus ?? "all"} />;
}
