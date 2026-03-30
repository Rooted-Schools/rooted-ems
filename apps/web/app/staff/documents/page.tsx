export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServiceRoleClient } from "@rooted-ems/database/server";
import { redirect } from "next/navigation";
import { getStaffPendingDocuments, getCampuses } from "@/lib/queries";
import { DocumentQueueClient } from "./documents-client";

export default async function StaffDocumentsPage() {
  const supabase = createServiceRoleClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/staff-login");

  // Fetch the staff member's accessible campus IDs via their roles
  const { data: roles } = await supabase
    .from("staff_campus_role")
    .select("campus_id")
    .eq("user_id", user.id);

  const campusIds = (roles ?? []).map((r: Record<string, string>) => r.campus_id);

  const [{ rows, stats }, allCampuses] = await Promise.all([
    getStaffPendingDocuments(campusIds.length > 0 ? campusIds : undefined),
    getCampuses(),
  ]);

  // Build campus options from what's actually in the queue
  const queueCampusIds = [...new Set(rows.map((r) => r.campus_id))];
  const campusOptions = allCampuses
    .filter((c) => queueCampusIds.includes(c.id))
    .map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Document Review Queue</h1>
        <p className="text-sm text-stone mt-1">
          Review and verify documents submitted by families.
        </p>
      </div>

      <DocumentQueueClient
        initialRows={rows}
        stats={stats}
        campusOptions={campusOptions}
      />
    </div>
  );
}
