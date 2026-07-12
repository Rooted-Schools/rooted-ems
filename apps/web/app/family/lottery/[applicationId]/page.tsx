export const dynamic = "force-dynamic";

import { createServerClient } from "@rooted-ems/database/server";
import { redirect } from "next/navigation";
import { getLotteryOutcome } from "@/lib/queries";
import { LotteryResultClient } from "./lottery-result-client";

interface Props {
  params: Promise<{ applicationId: string }>;
}

export default async function LotteryResultPage({ params }: Props) {
  const { applicationId } = await params;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // getLotteryOutcome proves ownership itself (RLS user client) before ever
  // touching service-role data — returns null when the application doesn't
  // exist or doesn't belong to this family.
  const outcome = await getLotteryOutcome(applicationId);

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-4">
      <LotteryResultClient outcome={outcome} />
    </div>
  );
}
