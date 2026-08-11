export const runtime = "edge";
export const dynamic = "force-dynamic";

import { requireStaffSession, getAccessibleCampusIds } from "@/lib/auth/get-session";
import { getInboundEmails } from "@/lib/queries";
import { StaffRole } from "@rooted-ems/types";
import { InboundEmailClient } from "./inbound-client";

/**
 * Read-only viewer for everything stored in inbound_email (migration 00046).
 * This is the destination lib/inbound-email.ts's unmatched-sender
 * notification link points at — before this page existed, that link went to
 * /staff/messages, which has nothing to open for a stored reply.
 *
 * Scoping: accessibleCampusIds is empty for org-wide staff (system_admin
 * with no scoped campus rows) — they see every row, matched or not. Scoped
 * staff see rows for their own campus(es); unmatched rows (campus_id NULL)
 * are additionally visible only when the caller holds system_admin on at
 * least one of their campuses, mirroring how notifySystemAdmins is the only
 * audience an unmatched reply reaches today.
 */
export default async function InboundEmailPage() {
  const session = await requireStaffSession();
  const accessibleCampusIds = getAccessibleCampusIds(session);
  const isOrgWide = accessibleCampusIds.length === 0;
  const hasSystemAdminRole = Object.values(session.campus_roles).some((roles) =>
    roles.includes(StaffRole.SystemAdmin)
  );
  const includeUnmatched = isOrgWide || hasSystemAdminRole;

  const messages = await getInboundEmails(accessibleCampusIds, includeUnmatched);

  return <InboundEmailClient messages={messages} />;
}
