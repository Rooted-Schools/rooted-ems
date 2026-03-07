export const runtime = "edge";
export const dynamic = "force-dynamic";

import { getStaffLotteryDetail } from "@/lib/queries";
import { StaffLotteryDetailClient } from "./lottery-detail-client";

export default async function StaffLotteryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { run, entrants } = await getStaffLotteryDetail(id);

  return <StaffLotteryDetailClient run={run} entrants={entrants} />;
}
