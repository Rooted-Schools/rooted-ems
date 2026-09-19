export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import {
  requireStaffSession,
  getAccessibleCampusIds,
  resolveActiveCampus,
} from "@/lib/auth/get-session";
import { getCampusLensId } from "@/lib/campus-lens";
import { createServerClient } from "@rooted-ems/database/server";
import { getCampaigns, getFollowUpQueue, getLeadPipelineSummary, getLeadStudentSummary, getLeads, getStaffUsers } from "@/lib/queries";
import { getJourneys } from "@/lib/queries/journeys";
import { RecruitmentClient } from "./recruitment-client";

export default async function StaffRecruitmentPage({
  searchParams,
}: {
  searchParams: { campus?: string; queueScope?: string };
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

  // The queue defaults to "mine or unassigned" so unowned work never
  // silently drops out of view for the recruiter working it — "Whole
  // campus" (?queueScope=all) drops the ownership filter entirely.
  const queueScope = searchParams?.queueScope === "all" ? "all" : "mine";
  const queueOwnership =
    queueScope === "all" ? undefined : ({ mode: "mine_or_unassigned", userId: session.user_id } as const);

  const [followUpQueue, summary, studentSummary, leads, campaigns, journeys, allStaffRows, { data: campusRows }] = await Promise.all([
    getFollowUpQueue(activeCampus, undefined, queueOwnership),
    getLeadPipelineSummary(activeCampus),
    getLeadStudentSummary(activeCampus),
    getLeads({ campusId: activeCampus }),
    getCampaigns(activeCampus),
    getJourneys(activeCampus),
    getStaffUsers(),
    supabase.from("campus").select("id, name, short_code").order("name"),
  ]);

  // CMO admins (no explicit scoping) see all campuses; scoped staff see theirs.
  const campuses = (campusRows ?? [])
    .filter(
      (c: Record<string, string>) => accessibleIds.length === 0 || accessibleIds.includes(c.id)
    )
    .map((c: Record<string, string>) => ({ id: c.id, name: c.name, short_code: c.short_code }));

  // Same scoping as staff/team/page.tsx: an empty accessible list is genuine
  // CMO-level access (see everyone); everyone else only sees their own
  // campuses' staff — the owner filter and assignment pickers must never
  // leak another campus's roster to a scoped staff member.
  const staffUsers =
    accessibleIds.length > 0 ? allStaffRows.filter((s) => accessibleIds.includes(s.campus_id)) : allStaffRows;

  return (
    <RecruitmentClient
      queue={followUpQueue.items}
      queueTotalDue={followUpQueue.totalDue}
      queueScope={queueScope}
      summary={summary}
      studentSummary={studentSummary}
      leads={leads}
      campaigns={campaigns}
      journeys={journeys}
      campuses={campuses}
      staffUsers={staffUsers}
      activeCampusId={activeCampus ?? "all"}
      staffUserId={session.user_id}
    />
  );
}
