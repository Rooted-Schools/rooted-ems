export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import {
  requireStaffSession,
  getAccessibleCampusIds,
  resolveActiveCampus,
} from "@/lib/auth/get-session";
import { createServerClient } from "@rooted-ems/database/server";
import { getStaffEvents } from "@/lib/queries";
import { EventsClient } from "./events-client";

export default async function StaffEventsPage({
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
  const [events, { data: campusRows }] = await Promise.all([
    getStaffEvents(activeCampus),
    supabase.from("campus").select("id, name").order("name"),
  ]);

  const campuses = (campusRows ?? [])
    .filter((c: Record<string, string>) => accessibleIds.length === 0 || accessibleIds.includes(c.id))
    .map((c: Record<string, string>) => ({ id: c.id, name: c.name }));

  return (
    <EventsClient
      events={events}
      campuses={campuses}
      activeCampusId={activeCampus ?? "all"}
      staffUserId={session.user_id}
    />
  );
}
