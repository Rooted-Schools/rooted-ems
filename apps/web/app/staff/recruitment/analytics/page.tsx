export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import {
  requireStaffSession,
  getAccessibleCampusIds,
  resolveActiveCampus,
} from "@/lib/auth/get-session";
import { createServerClient } from "@rooted-ems/database/server";
import { getRecruitmentFunnel } from "@/lib/queries";
import { getGradeFunnelTable, getSpeedToFirstContactByCampus } from "@/lib/queries/recruitment-intel";
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
  // An explicit campus selection narrows EVERY section on this page, not just
  // the funnel — an org-admin viewing "Cleveland" must never see other
  // campuses' rows here. No selection: role scope (undefined = org-wide).
  const scopedCampusIds = activeCampus
    ? [activeCampus]
    : accessibleIds.length > 0
      ? accessibleIds
      : undefined;

  const supabase = await createServerClient();
  const [funnel, speedToContactResult, gradeFunnel, { data: campusRows }] = await Promise.all([
    getRecruitmentFunnel(activeCampus),
    getSpeedToFirstContactByCampus(scopedCampusIds),
    getGradeFunnelTable(scopedCampusIds),
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
      speedToContact={speedToContactResult.rows}
      speedToContactTruncated={speedToContactResult.truncated}
      gradeFunnel={gradeFunnel}
      campuses={campuses}
      activeCampusId={activeCampus ?? "all"}
    />
  );
}
