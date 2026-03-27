export const runtime = "edge";

import { notFound } from "next/navigation";
import { getApplicationDetail } from "@/lib/queries";
import { requireStaffSession, getAccessibleCampusIds } from "@/lib/auth/get-session";
import { StaffApplicationDetailClient } from "./detail-client";

export const dynamic = "force-dynamic";

export default async function StaffApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireStaffSession();
  const detail = await getApplicationDetail(id);
  if (!detail) notFound();

  // Verify the staff user has access to this application's campus
  const accessibleCampusIds = getAccessibleCampusIds(session);
  if (accessibleCampusIds.length > 0 && !accessibleCampusIds.includes(detail.campus_id)) {
    notFound();
  }

  return <StaffApplicationDetailClient detail={detail} userId={session.user.id} />;
}
