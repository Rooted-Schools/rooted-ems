export const runtime = "edge";
export const dynamic = "force-dynamic";

import { getStaffEnrollments } from "@/lib/queries";
import { EnrollmentClient } from "./enrollment-client";
import { requireStaffSession, getAccessibleCampusIds } from "@/lib/auth/get-session";

export default async function StaffEnrollmentPage() {
  const session = await requireStaffSession();
  const campusIds = getAccessibleCampusIds(session);
  const { enrollments, stats } = await getStaffEnrollments(campusIds);

  return (
    <EnrollmentClient
      enrollments={enrollments}
      stats={stats}
    />
  );
}
