export const runtime = "edge";
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { getStaffLotteryDetail } from "@/lib/queries";
import { requireStaffSession, getAccessibleCampusIds } from "@/lib/auth/get-session";
import { StaffLotteryDetailClient } from "./lottery-detail-client";

export default async function StaffLotteryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [session, { run, entrants }] = await Promise.all([
    requireStaffSession(),
    getStaffLotteryDetail(id),
  ]);

  // Verify the staff user has access to this run's campus. The detail query
  // returns the campus name but not its id, so read the id directly.
  const accessibleCampusIds = getAccessibleCampusIds(session);
  if (run && accessibleCampusIds.length > 0) {
    const supabase = createServiceRoleClient();
    const { data: runCampus } = await supabase
      .from("lottery_run")
      .select("campus_id")
      .eq("id", id)
      .single();
    const campusId = runCampus?.campus_id as string | undefined;
    if (!campusId || !accessibleCampusIds.includes(campusId)) {
      redirect("/staff/lottery");
    }
  }

  return (
    <StaffLotteryDetailClient
      run={run}
      entrants={entrants}
      staffUserId={session.user_id}
    />
  );
}
