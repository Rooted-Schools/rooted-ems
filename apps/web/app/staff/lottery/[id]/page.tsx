export const runtime = "edge";
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import {
  getStaffLotteryDetail,
  getRunGovernance,
  getLotteryNotificationProgress,
} from "@/lib/queries";
import { getPreflightReport } from "@/lib/lottery-preflight";
import { governanceLabel } from "@/lib/lottery-policy";
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

  // Governance, readiness, and notification progress are all evaluated against
  // live data on every render. A preflight panel that caches is a preflight
  // panel that lies.
  const [governance, preflight, notifications] = await Promise.all([
    getRunGovernance(id),
    getPreflightReport(id),
    getLotteryNotificationProgress(id),
  ]);

  return (
    <StaffLotteryDetailClient
      run={run}
      entrants={entrants}
      staffUserId={session.user_id}
      governedBy={
        governance.ungoverned
          ? null
          : governanceLabel({
              name: governance.policyName ?? "Adopted policy",
              version: governance.policyVersion ?? 0,
              adopted_date: governance.adoptedDate,
            })
      }
      isRehearsal={governance.isRehearsal}
      drawSummary={governance.drawSummary}
      acceptanceWindowDays={governance.config?.acceptanceWindowDays ?? null}
      preflight={preflight}
      notifications={notifications}
    />
  );
}
