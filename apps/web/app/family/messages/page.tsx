export const runtime = "edge";
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createServerClient } from "@rooted-ems/database/server";
import { getFamilyMessages } from "@/lib/queries";
import { MessagesClient } from "./messages-client";

export default async function FamilyMessagesPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Family context: staff-console notifications stay out of the family
  // portal for dual-role users (staff who are also guardians).
  const messages = await getFamilyMessages(user.id, 50, "family");

  return <MessagesClient messages={messages} />;
}
