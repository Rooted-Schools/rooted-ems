export const dynamic = "force-dynamic";

import { createServerClient } from "@rooted-ems/database/server";
import { redirect } from "next/navigation";
import { getLeadDetail } from "@/lib/queries";
import { LeadDetailClient } from "./lead-detail-client";

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/staff-login");

  const lead = await getLeadDetail(params.id);

  return <LeadDetailClient lead={lead} staffUserId={user.id} />;
}
