export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requireStaffSession } from "@/lib/auth/get-session";
import { getEventDetail } from "@/lib/queries";
import { EventDetailClient } from "./event-detail-client";

export default async function StaffEventDetailPage({ params }: { params: { id: string } }) {
  let session;
  try {
    session = await requireStaffSession();
  } catch {
    redirect("/staff-login");
  }

  const event = await getEventDetail(params.id);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://enroll.rootedschool.org";

  return <EventDetailClient event={event} publicUrl={`${appUrl}/events/${params.id}`} staffUserId={session.user_id} />;
}
