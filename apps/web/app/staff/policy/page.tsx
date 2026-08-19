export const runtime = "edge";
export const dynamic = "force-dynamic";

import {
  requireMinRole,
  getAccessibleCampusIds,
  resolveActiveCampus,
  hasRoleOnCampus,
} from "@/lib/auth/get-session";
import { getCampusLensId } from "@/lib/campus-lens";
import { SectionTabs } from "@/components/layout/section-tabs";
import { SEATS_LOTTERY_TABS } from "@/lib/section-tabs";
import { getCampuses, getPolicyVersionsForCampus } from "@/lib/queries";
import { PolicyClient, type PolicyVersionView } from "./policy-client";

export default async function StaffPolicyPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const session = await requireMinRole("enrollment_manager");
  const accessibleIds = getAccessibleCampusIds(session);
  const lensCampusId = await getCampusLensId(accessibleIds);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus, lensCampusId);
  const campuses = await getCampuses();
  const visibleCampuses = campuses.filter(
    (c) => accessibleIds.length === 0 || accessibleIds.includes(c.id)
  );

  // Never guess a campus for an org-wide admin with no active lens. getCampuses
  // orders alphabetically, so falling back to visibleCampuses[0] silently bound
  // a drafted or adopted lottery policy to C.R. Neal — the wrong campus, with no
  // warning. Use the active selection when present; otherwise resolve to a
  // campus only when the caller has exactly one visible, and pass null so the
  // editor renders a "choose a campus" prompt instead of binding to a guess.
  const campusId =
    activeCampus ?? (visibleCampuses.length === 1 ? visibleCampuses[0].id : null);
  const campus = visibleCampuses.find((c) => c.id === campusId) ?? null;

  const versions: PolicyVersionView[] = campusId
    ? (await getPolicyVersionsForCampus(campusId)).map((row) => ({
        id: row.id,
        name: row.name,
        version: row.version,
        status: row.status,
        config: row.config,
        adoptedDate: row.adopted_date,
        adoptedNote: row.adopted_note,
        adoptedByName: row.adopted_by_name ?? null,
        createdAt: row.created_at,
      }))
    : [];

  return (
    <div className="space-y-6">
      <SectionTabs
        tabs={SEATS_LOTTERY_TABS}
        activeHref="/staff/policy"
        campusParam={searchParams?.campus}
      />
      <PolicyClient
        campusId={campusId}
        campusName={campus?.name ?? null}
        versions={versions}
        isSystemAdmin={hasRoleOnCampus(session, campusId, "system_admin")}
      />
    </div>
  );
}
