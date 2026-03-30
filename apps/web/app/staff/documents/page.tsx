export const runtime = "edge";
export const dynamic = "force-dynamic";

import { getStaffPendingDocuments, getCampuses } from "@/lib/queries";
import { DocumentQueueClient } from "./documents-client";
import { requireStaffSession, getAccessibleCampusIds } from "@/lib/auth/get-session";

export default async function StaffDocumentsPage() {
  const session = await requireStaffSession();
  const campusIds = getAccessibleCampusIds(session);

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
