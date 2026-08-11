export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requireStaffSession, getAccessibleCampusIds } from "@/lib/auth/get-session";
import { createServerClient } from "@rooted-ems/database/server";
import { getJourneyDetail, getJourneyRoster } from "@/lib/queries/journeys";
import { JourneyDetailClient } from "./journey-detail-client";

export default async function JourneyDetailPage({ params }: { params: { id: string } }) {
  let session;
  try {
    session = await requireStaffSession();
  } catch {
    redirect("/staff-login");
  }

  const [journey, roster, { data: campusRows }] = await Promise.all([
    getJourneyDetail(params.id),
    getJourneyRoster(params.id),
    createServerClient().then((c) => c.from("campus").select("id, name, short_code").order("name")),
  ]);

  // Campus-specific journeys are only visible to staff with access to that
  // campus; network-default journeys (campus_id null) are visible to all
  // staff — same rule the RLS policy on `journey` already enforces.
  const accessibleCampusIds = getAccessibleCampusIds(session);
  if (
    journey &&
    journey.campus_id &&
    accessibleCampusIds.length > 0 &&
    !accessibleCampusIds.includes(journey.campus_id)
  ) {
    redirect("/staff/recruitment/journeys");
  }

  const campuses = (campusRows ?? [])
    .filter((c: Record<string, string>) => accessibleCampusIds.length === 0 || accessibleCampusIds.includes(c.id))
    .map((c: Record<string, string>) => ({ id: c.id, name: c.name, short_code: c.short_code }));

  return <JourneyDetailClient journey={journey} roster={roster} campuses={campuses} staffUserId={session.user_id} />;
}
