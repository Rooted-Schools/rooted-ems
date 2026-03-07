export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServerClient } from "@rooted-ems/database/server";
import { getStaffOffers } from "@/lib/queries";
import { OffersClient } from "./offers-client";

export default async function StaffOffersPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { offers, stats } = await getStaffOffers();

  return (
    <OffersClient
      offers={offers}
      stats={stats}
      staffUserId={user?.id ?? ""}
    />
  );
}
