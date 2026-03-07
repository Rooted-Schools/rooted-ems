export const runtime = "edge";
export const dynamic = "force-dynamic";

import { getStaffEnrollments } from "@/lib/queries";
import { EnrollmentClient } from "./enrollment-client";
import { requireStaffSession, getAccessibleCampusIds, resolveActiveCampus } from "@/lib/auth/get-session";

export default async function StaffEnrollmentPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const session = await requireStaffSession();
  const accessibleIds = getAccessibleCampusIds(session);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus);
  const scopedCampusIds = activeCampus ? [activeCampus] : accessibleIds;

  const { enrollments, stats } = await getStaffEnrollments(scopedCampusIds);

  return (
    <EnrollmentClient
      enrollments={enrollments}
      stats={stats}
    />
  );
}
