export const runtime = "edge";
export const dynamic = "force-dynamic";

import { getStaffEnrollments } from "@/lib/queries";
import { getReenrollmentStats, getReenrollmentFollowUpQueue } from "@/lib/queries/reenrollment";
import { EnrollmentClient } from "./enrollment-client";
import { ReenrollmentPanel } from "./reenrollment-panel-client";
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

  const [{ enrollments, stats }, reenrollmentStats, reenrollmentFollowUp] = await Promise.all([
    getStaffEnrollments(scopedCampusIds),
    getReenrollmentStats(scopedCampusIds),
    getReenrollmentFollowUpQueue(scopedCampusIds),
  ]);

  return (
    <div className="space-y-8">
      <ReenrollmentPanel
        stats={reenrollmentStats}
        followUpQueue={reenrollmentFollowUp.rows}
      />
      <EnrollmentClient
        enrollments={enrollments}
        stats={stats}
      />
    </div>
  );
}
