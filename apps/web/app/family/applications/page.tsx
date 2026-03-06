export const runtime = "edge";

import { createServerClient } from "@rooted-ems/database/server";
import { redirect } from "next/navigation";
import { getFamilyApplications } from "@/lib/queries";
import { FamilyApplicationsClient } from "./applications-client";

export const dynamic = "force-dynamic";

export default async function FamilyApplicationsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/family-login");

  const applications = await getFamilyApplications(user.id);

  return <FamilyApplicationsClient applications={applications} />;
}
