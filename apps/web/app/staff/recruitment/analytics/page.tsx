export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import {
  requireStaffSession,
  getAccessibleCampusIds,
  resolveActiveCampus,
} from "@/lib/auth/get-session";
import { createServerClient } from "@rooted-ems/database/server";
import { getRecruitmentFunnel } from "@/lib/queries";
import { FunnelDashboardClient } from "./funnel-client";

export default async function RecruitmentAnalyticsPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  let session;
  try {
    session = await requireStaffSession();
  } catch {
    redirect("/staff-login");
  }

  const accessibleIds = getAccessibleCampusIds(session);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus);

  const supabase = await createServerClient();
  const [funnel, { data: campusRows }] = await Promise.all([
    getRecruitmentFunnel(activeCampus),
    supabase.from("campus").select("id, name").order("name"),
  ]);

  const campuses = (campusRows ?? [])
    .filter(
      (c: Record<string, string>) => accessibleIds.length === 0 || accessibleIds.includes(c.id)
    )
    .map((c: Record<string, string>) => ({ id: c.id, name: c.name }));

  return (
    <FunnelDashboardClient
      funnel={funnel}
      campuses={campuses}
      activeCampusId={activeCampus ?? "all"}
    />
  );
}
