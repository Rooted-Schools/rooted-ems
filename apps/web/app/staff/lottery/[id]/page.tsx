export const runtime = "edge";
export const dynamic = "force-dynamic";

import { StaffLotteryDetailClient } from "./lottery-detail-client";

export default async function StaffLotteryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StaffLotteryDetailClient id={id} />;
}
