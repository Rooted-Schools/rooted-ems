export const runtime = "edge";
export const dynamic = "force-dynamic";

import { requireStaffSession, getAccessibleCampusIds } from "@/lib/auth/get-session";
import { getCampusLensId } from "@/lib/campus-lens";
import { getFamilyMessages } from "@/lib/queries";
import { StaffMessagesClient } from "./messages-client";

export default async function StaffMessagesPage() {
  const session = await requireStaffSession();

  // Scope the notification list to the campus the viewer has selected, the same
  // way the unread badge in the layout already does. Without this a network
  // admin (who receives notifications for every campus) saw all campuses' items
  // no matter which school they were looking at. Null lens ("All campuses")
  // keeps the unscoped, everything view.
  const campusId = await getCampusLensId(getAccessibleCampusIds(session));

  // Staff context: never surface family-portal links here (dual-role users).
  const messages = await getFamilyMessages(session.user_id, 50, "staff", campusId);

  return <StaffMessagesClient messages={messages} />;
}
