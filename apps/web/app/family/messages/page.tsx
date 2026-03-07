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

  const messages = await getFamilyMessages(user.id);

  return <MessagesClient messages={messages} />;
}
