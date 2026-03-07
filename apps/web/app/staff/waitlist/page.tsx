export const runtime = "edge";
export const dynamic = "force-dynamic";

import { getStaffWaitlist } from "@/lib/queries";
import { WaitlistClient } from "./waitlist-client";
import { requireStaffSession, getAccessibleCampusIds, resolveActiveCampus } from "@/lib/auth/get-session";

export default async function StaffWaitlistPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const session = await requireStaffSession();
  const accessibleIds = getAccessibleCampusIds(session);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus);
  const scopedCampusIds = activeCampus ? [activeCampus] : accessibleIds;

  const { entries, campusCounts } = await getStaffWaitlist(scopedCampusIds);

  return (
    <WaitlistClient
      entries={entries}
      campusCounts={campusCounts}
      staffUserId={session.user_id}
    />
  );
}
