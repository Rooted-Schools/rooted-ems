export const runtime = "edge";
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/get-session";
import { getFamilyMessages } from "@/lib/queries";
import { StaffMessagesClient } from "./messages-client";

export default async function StaffMessagesPage() {
  const session = await getSession();
  if (!session?.user_id) redirect("/staff-login");

  const messages = await getFamilyMessages(session.user_id);

  return <StaffMessagesClient messages={messages} />;
}
