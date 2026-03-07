export const runtime = "edge";
export const dynamic = "force-dynamic";

import { getStaffEnrollments } from "@/lib/queries";
import { EnrollmentClient } from "./enrollment-client";

export default async function StaffEnrollmentPage() {
  const { enrollments, stats } = await getStaffEnrollments();

  return (
    <EnrollmentClient
      enrollments={enrollments}
      stats={stats}
    />
  );
}
