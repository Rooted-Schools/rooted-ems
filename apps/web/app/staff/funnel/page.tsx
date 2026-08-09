import { getEnrollmentFunnel } from "@/lib/queries/funnel";
import { getDeclineReasonBreakdown } from "@/lib/queries/decline-reasons";
import { getChannelRoi } from "@/lib/queries/channel-roi";
import { getCampuses } from "@/lib/queries";
import {
  requireStaffSession,
  getAccessibleCampusIds,
  resolveActiveCampus,
} from "@/lib/auth/get-session";
import { SectionTabs } from "@/components/layout/section-tabs";
import { INSIGHTS_TABS } from "@/lib/section-tabs";
import { FunnelClient } from "./funnel-client";

export const dynamic = "force-dynamic";

/**
 * The five-stage funnel view (playbook PB 24 v2.2 s2.2).
 *
 * Distinct from /staff/pipeline on purpose. Pipeline is the work queue: what
 * do I action today. This is the strategy view: where is the family journey
 * leaking. Same data, different question, and collapsing them into one screen
 * would serve neither.
 */
export default async function FunnelPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const session = await requireStaffSession();
  const accessibleIds = getAccessibleCampusIds(session);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus);
  // Same scoping shape as staff/today and staff/pipeline: an explicit campus
  // selection narrows to it, otherwise scope to everything this staff member
  // can access (empty array = org-wide admin, no filter downstream).
  const scopedCampusIds = activeCampus ? [activeCampus] : accessibleIds;

  const [funnel, declines, channels, campuses] = await Promise.all([
    getEnrollmentFunnel(scopedCampusIds),
    getDeclineReasonBreakdown(scopedCampusIds),
    getChannelRoi(scopedCampusIds),
    getCampuses(),
  ]);

  return (
    <div className="space-y-6">
      <SectionTabs
        tabs={INSIGHTS_TABS}
        activeHref="/staff/funnel"
        campusParam={searchParams?.campus}
      />
      <FunnelClient
        funnel={funnel}
        declines={declines}
        channels={channels}
        campuses={campuses.filter((c) => accessibleIds.length === 0 || accessibleIds.includes(c.id))}
        activeCampus={activeCampus ?? null}
      />
    </div>
  );
}
