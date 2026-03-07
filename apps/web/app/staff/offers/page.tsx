export const runtime = "edge";
export const dynamic = "force-dynamic";

import { getStaffOffers } from "@/lib/queries";
import { OffersClient } from "./offers-client";
import { requireStaffSession, getAccessibleCampusIds, resolveActiveCampus } from "@/lib/auth/get-session";

export default async function StaffOffersPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const session = await requireStaffSession();
  const accessibleIds = getAccessibleCampusIds(session);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus);
  const scopedCampusIds = activeCampus ? [activeCampus] : accessibleIds;

  const { offers, stats } = await getStaffOffers(scopedCampusIds);

  return (
    <OffersClient
      offers={offers}
      stats={stats}
      staffUserId={session.user_id}
    />
  );
}
