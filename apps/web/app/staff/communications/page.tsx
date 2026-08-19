export const runtime = "edge";
export const dynamic = "force-dynamic";

import { requireStaffSession, getAccessibleCampusIds, resolveActiveCampus, isCMOAdmin } from "@/lib/auth/get-session";
import { getCampusLensId } from "@/lib/campus-lens";
import {
  getStaffCommunications,
  getStaffMessageTemplates,
  getNotificationRecipients,
  getCampuses,
} from "@/lib/queries";
import { CommsClient } from "./comms-client";

export default async function StaffCommunicationsPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const session = await requireStaffSession();
  const accessibleIds = getAccessibleCampusIds(session);
  const lensCampusId = await getCampusLensId(accessibleIds);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus, lensCampusId);
  const scopedCampusIds = activeCampus ? [activeCampus] : accessibleIds;

  const [
    { messages, stats },
    templates,
    recipients,
    allCampuses,
  ] = await Promise.all([
    getStaffCommunications(scopedCampusIds),
    getStaffMessageTemplates(),
    getNotificationRecipients(scopedCampusIds),
    getCampuses(),
  ]);

  const campuses = allCampuses
    .filter((c) => scopedCampusIds.length === 0 || scopedCampusIds.includes(c.id))
    .map((c) => ({ id: c.id, name: c.name }));

  return (
    <CommsClient
      messages={messages}
      stats={stats}
      templates={templates}
      recipients={recipients}
      campuses={campuses}
      staffUserId={session.user_id}
      isCMOAdmin={isCMOAdmin(session)}
    />
  );
}
