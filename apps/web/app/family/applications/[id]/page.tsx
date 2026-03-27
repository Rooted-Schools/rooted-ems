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

  return <FamilyApplicationDetailClient detail={detail} />;
}
