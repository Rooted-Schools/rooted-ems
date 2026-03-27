export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServerClient } from "@rooted-ems/database/server";
import { redirect, notFound } from "next/navigation";
import { getFamilyOfferDetail } from "@/lib/queries";
import { OfferResponseClient } from "./offer-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OfferResponsePage({ params }: Props) {
  const { id: offerId } = await params;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const offer = await getFamilyOfferDetail(offerId, user.id);

  if (!offer) notFound();

  return (
    <div className="max-w-xl mx-auto space-y-6 py-4">
      <OfferResponseClient offer={offer} guardianId={offer.guardian_id} />
    </div>
  );
}
