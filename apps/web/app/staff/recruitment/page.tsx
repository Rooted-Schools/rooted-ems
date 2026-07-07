export const dynamic = "force-dynamic";

import { createServerClient } from "@rooted-ems/database/server";
import { redirect } from "next/navigation";
import { getCampaigns, getFollowUpQueue, getLeadPipelineSummary, getLeads } from "@/lib/queries";
import { RecruitmentClient } from "./recruitment-client";

export default async function StaffRecruitmentPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/staff-login");

  const [queue, summary, leads, campaigns, { data: campusRows }] = await Promise.all([
    getFollowUpQueue(),
    getLeadPipelineSummary(),
    getLeads(),
    getCampaigns(),
    supabase.from("campus").select("id, name").order("name"),
  ]);

  const campuses = (campusRows ?? []).map((c: Record<string, string>) => ({
    id: c.id,
    name: c.name,
  }));

  return (
    <RecruitmentClient
      queue={queue}
      summary={summary}
      leads={leads}
      campaigns={campaigns}
      campuses={campuses}
      staffUserId={user.id}
    />
  );
}
