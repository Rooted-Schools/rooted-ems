export const runtime = "edge";
export const dynamic = "force-dynamic";

import { getNetworkOverview } from "@/lib/queries/network";
import { requireNetworkAccess } from "@/lib/auth/get-session";
import { NetworkClient } from "./network-client";

/**
 * /staff/network — CMO-level network overview. Campus staff work a campus;
 * the CMO answers for the network. Gated to org-wide access only
 * (requireNetworkAccess — zero campus_role rows, the established
 * "sees everything" convention already load-bearing across the campus
 * filters on /today, /pipeline, /recruitment, /applications, /equity,
 * /funnel). A scoped staff member hitting this route bounces to
 * /staff/today?denied=1, same quiet-banner pattern as every other role gate.
 */
export default async function NetworkPage() {
  await requireNetworkAccess();
  const overview = await getNetworkOverview();

  return <NetworkClient overview={overview} />;
}
