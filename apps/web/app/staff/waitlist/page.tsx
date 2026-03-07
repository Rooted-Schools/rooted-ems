export const runtime = "edge";
export const dynamic = "force-dynamic";

import { getStaffWaitlist } from "@/lib/queries";
import { WaitlistClient } from "./waitlist-client";
import { requireStaffSession, getAccessibleCampusIds } from "@/lib/auth/get-session";

export default async function StaffWaitlistPage() {
  const session = await requireStaffSession();
  const campusIds = getAccessibleCampusIds(session);
  const { entries, campusCounts } = await getStaffWaitlist(campusIds);

  return (
    <WaitlistClient
      entries={entries}
      campusCounts={campusCounts}
      staffUserId={session.user_id}
    />
  );
}
