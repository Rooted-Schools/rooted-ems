import { createServerClient } from "@rooted-ems/database/server";
import { redirect, notFound } from "next/navigation";
import { getApplicationDetail } from "@/lib/queries";
import { FamilyApplicationDetailClient } from "./detail-client";

export const dynamic = "force-dynamic";

export default async function FamilyApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const detail = await getApplicationDetail(id, user.id);
  if (!detail) notFound();

  // userId is the auth uid, which is what Storage's INSERT policy checks on
  // the upload path prefix — guardian.id is a different key entirely and is
  // rejected. See the uploadFile call in detail-client.tsx.
  return <FamilyApplicationDetailClient detail={detail} userId={user.id} />;
}
