export const runtime = "edge";

import { getStaffInquiries, getInquiryStats, getCampuses } from "@/lib/queries";
import { InquiriesClient } from "./inquiries-client";
import { requireStaffSession, getAccessibleCampusIds, resolveActiveCampus } from "@/lib/auth/get-session";

export const dynamic = "force-dynamic";

export default async function StaffInquiriesPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const session = await requireStaffSession();
  const accessibleIds = getAccessibleCampusIds(session);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus);
  const scopedCampusIds = activeCampus ? [activeCampus] : accessibleIds;

  const [inquiries, stats, allCampuses] = await Promise.all([
    getStaffInquiries(scopedCampusIds),
    getInquiryStats(scopedCampusIds),
    getCampuses(),
  ]);

  const campuses = allCampuses.filter(
    (c) => accessibleIds.length === 0 || accessibleIds.includes(c.id)
  );

  return (
    <InquiriesClient
      inquiries={inquiries}
      stats={stats}
      campuses={campuses}
      staffId={session.user_id}
      staffName={session.email ?? "Staff"}
    />
  );
}
