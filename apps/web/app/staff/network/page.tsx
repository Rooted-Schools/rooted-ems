export const runtime = "edge";
export const dynamic = "force-dynamic";

import { getNetworkOverview } from "@/lib/queries/network";
import { requireNetworkAccess } from "@/lib/auth/get-session";
import { NetworkClient } from "./network-client";

/**
 * /staff/network — CMO-level network overview. Campus staff work a campus;
 * the CMO answers for the network. Gated to org-wide access only
 * (requireNetworkAccess, which is system_admin on 2 or more campuses — see
 * lib/auth/get-session.ts for the single definition). A scoped staff member
 * hitting this route bounces to /staff/today?denied=1, same quiet-banner
 * pattern as every other role gate.
 *
 * getNetworkOverview deliberately fetches every active campus rather than
 * scoping to getAccessibleCampusIds: the page's whole subject is the network
 * as a whole, and the only sessions that reach it are CMO admins, who hold
 * real campus roles on every campus anyway. The two sets are the same today;
 * if a future CMO tier ever holds fewer campuses than exist, this query
 * becomes the place to scope.
 */
export default async function NetworkPage() {
  await requireNetworkAccess();
  const overview = await getNetworkOverview();

  return <NetworkClient overview={overview} />;
}
