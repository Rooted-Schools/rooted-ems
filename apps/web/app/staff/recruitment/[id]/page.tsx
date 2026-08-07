export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getLeadDetail } from "@/lib/queries";
import { requireStaffSession, getAccessibleCampusIds } from "@/lib/auth/get-session";
import { LeadDetailClient } from "./lead-detail-client";

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  // Was an ad-hoc getUser() check, which only proved *someone* was signed in —
  // an authenticated family account passed it. Lead RLS still returned nothing,
  // but the guard shouldn't lean on that. Same gate as every other staff route.
  const session = await requireStaffSession();

  const lead = await getLeadDetail(params.id);

  // Verify the staff user has access to this lead's campus.
  const accessibleCampusIds = getAccessibleCampusIds(session);
  if (
    lead &&
    accessibleCampusIds.length > 0 &&
    !accessibleCampusIds.includes(lead.campus_id)
  ) {
    redirect("/staff/recruitment");
  }

  return <LeadDetailClient lead={lead} staffUserId={session.user_id} />;
}
