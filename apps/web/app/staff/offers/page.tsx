export const runtime = "edge";
export const dynamic = "force-dynamic";

import { getStaffOffers } from "@/lib/queries";
import { OffersClient } from "./offers-client";
import { requireStaffSession, getAccessibleCampusIds } from "@/lib/auth/get-session";

export default async function StaffOffersPage() {
  const session = await requireStaffSession();
  const campusIds = getAccessibleCampusIds(session);
  const { offers, stats } = await getStaffOffers(campusIds);

  return (
    <OffersClient
      offers={offers}
      stats={stats}
      staffUserId={session.user_id}
    />
  );
}
