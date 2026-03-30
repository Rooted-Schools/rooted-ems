export const runtime = "edge";
export const dynamic = "force-dynamic";

import { requireStaffSession } from "@/lib/auth/get-session";
import { getFamilyMessages } from "@/lib/queries";
import { StaffMessagesClient } from "./messages-client";

export default async function StaffMessagesPage() {
  const session = await requireStaffSession();

  const messages = await getFamilyMessages(session.user_id);

  return <StaffMessagesClient messages={messages} />;
}
