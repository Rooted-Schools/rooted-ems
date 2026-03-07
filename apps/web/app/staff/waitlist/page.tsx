export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServerClient } from "@rooted-ems/database/server";
import { getStaffWaitlist } from "@/lib/queries";
import { WaitlistClient } from "./waitlist-client";

export default async function StaffWaitlistPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { entries, campusCounts } = await getStaffWaitlist();

  return (
    <WaitlistClient
      entries={entries}
      campusCounts={campusCounts}
      staffUserId={user?.id ?? ""}
    />
  );
}
