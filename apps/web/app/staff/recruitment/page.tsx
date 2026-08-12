export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import {
  requireStaffSession,
  getAccessibleCampusIds,
  resolveActiveCampus,
} from "@/lib/auth/get-session";
import { getCampusLensId } from "@/lib/campus-lens";
import { createServerClient } from "@rooted-ems/database/server";
import { getCampaigns, getFollowUpQueue, getLeadPipelineSummary, getLeads } from "@/lib/queries";
import { getJourneys } from "@/lib/queries/journeys";
import { RecruitmentClient } from "./recruitment-client";

export default async function StaffRecruitmentPage({
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
  const [queue, summary, leads, campaigns, journeys, { data: campusRows }] = await Promise.all([
    getFollowUpQueue(activeCampus),
    getLeadPipelineSummary(activeCampus),
    getLeads({ campusId: activeCampus }),
    getCampaigns(activeCampus),
    getJourneys(activeCampus),
    supabase.from("campus").select("id, name, short_code").order("name"),
  ]);

  // CMO admins (no explicit scoping) see all campuses; scoped staff see theirs.
  const campuses = (campusRows ?? [])
    .filter(
      (c: Record<string, string>) => accessibleIds.length === 0 || accessibleIds.includes(c.id)
    )
    .map((c: Record<string, string>) => ({ id: c.id, name: c.name, short_code: c.short_code }));

  return (
    <RecruitmentClient
      queue={queue}
      summary={summary}
      leads={leads}
      campaigns={campaigns}
      journeys={journeys}
      campuses={campuses}
      activeCampusId={activeCampus ?? "all"}
      staffUserId={session.user_id}
    />
  );
}
