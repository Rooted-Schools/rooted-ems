export const runtime = "edge";
export const dynamic = "force-dynamic";

import { getStaffLotteryDetail } from "@/lib/queries";
import { requireStaffSession } from "@/lib/auth/get-session";
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

  return (
    <StaffLotteryDetailClient
      run={run}
      entrants={entrants}
      staffUserId={session.user_id}
    />
  );
}
