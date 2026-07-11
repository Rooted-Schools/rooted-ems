export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import {
  requireStaffSession,
  getAccessibleCampusIds,
  resolveActiveCampus,
} from "@/lib/auth/get-session";
import { createServerClient } from "@rooted-ems/database/server";
import { getCampaigns, getFollowUpQueue, getJourneyStats, getLeadPipelineSummary, getLeads } from "@/lib/queries";
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
  const activeCampus = resolveActiveCampus(session, searchParams?.campus);

  const supabase = await createServerClient();
  const [queue, summary, leads, campaigns, journeys, { data: campusRows }] = await Promise.all([
    getFollowUpQueue(activeCampus),
    getLeadPipelineSummary(activeCampus),
    getLeads({ campusId: activeCampus }),
    getCampaigns(activeCampus),
    getJourneyStats(activeCampus),
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
