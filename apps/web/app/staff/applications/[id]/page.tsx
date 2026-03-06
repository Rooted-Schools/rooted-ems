import { notFound } from "next/navigation";
import { getApplicationDetail } from "@/lib/queries";
import { StaffApplicationDetailClient } from "./detail-client";

export const dynamic = "force-dynamic";

export default async function StaffApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getApplicationDetail(id);
  if (!detail) notFound();

  return <StaffApplicationDetailClient detail={detail} />;
}
