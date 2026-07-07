export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import {
  requireStaffSession,
  getAccessibleCampusIds,
  resolveActiveCampus,
} from "@/lib/auth/get-session";
import { createServerClient } from "@rooted-ems/database/server";
import { getCampaigns, getFollowUpQueue, getLeadPipelineSummary, getLeads } from "@/lib/queries";
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
  const [queue, summary, leads, campaigns, { data: campusRows }] = await Promise.all([
    getFollowUpQueue(activeCampus),
    getLeadPipelineSummary(activeCampus),
    getLeads({ campusId: activeCampus }),
    getCampaigns(activeCampus),
    supabase.from("campus").select("id, name").order("name"),
  ]);

  // CMO admins (no explicit scoping) see all campuses; scoped staff see theirs.
  const campuses = (campusRows ?? [])
    .filter(
      (c: Record<string, string>) => accessibleIds.length === 0 || accessibleIds.includes(c.id)
    )
    .map((c: Record<string, string>) => ({ id: c.id, name: c.name }));

  return (
    <RecruitmentClient
      queue={queue}
      summary={summary}
      leads={leads}
      campaigns={campaigns}
      campuses={campuses}
      activeCampusId={activeCampus ?? "all"}
      staffUserId={session.user_id}
    />
  );
}
