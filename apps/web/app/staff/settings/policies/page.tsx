export const runtime = "edge";
export const dynamic = "force-dynamic";

import { requireMinRole, getAccessibleCampusIds, resolveActiveCampus } from "@/lib/auth/get-session";
import { getCampusLensId } from "@/lib/campus-lens";
import { getCampuses } from "@/lib/queries";
import { getCampusPolicyOverrides } from "@/lib/queries/policy-overrides";
import { acknowledgementItems } from "@/lib/registration-items";
import { getPolicyText } from "@/app/family/registration/policy-content";
import { tx } from "@/lib/i18n/translations";
import { PoliciesClient } from "./policies-client";

/**
 * Per-campus registration policy editor. A school edits the exact text a family
 * reads and signs for each policy acknowledgement (handbook, discipline, media
 * release, ...). An empty override falls back to the built-in default in
 * app/family/registration/policy-content.ts.
 */
export default async function StaffPoliciesPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const session = await requireMinRole("enrollment_manager");
  const accessibleIds = getAccessibleCampusIds(session);
  const lensCampusId = await getCampusLensId(accessibleIds);

  const allCampuses = await getCampuses();
  const campuses =
    accessibleIds.length > 0 ? allCampuses.filter((c) => accessibleIds.includes(c.id)) : allCampuses;
  const activeCampus =
    resolveActiveCampus(session, searchParams?.campus, lensCampusId) ?? campuses[0]?.id ?? "";

  const overrides = activeCampus
    ? (await getCampusPolicyOverrides([activeCampus]))[activeCampus] ?? {}
    : {};

  const items = acknowledgementItems().map((it) => {
    const ov = overrides[it.itemType];
    return {
      itemType: it.itemType,
      title: tx(it.titleKey, "en"),
      defaultEn: getPolicyText(activeCampus, it.itemType, "en") ?? "",
      defaultEs: getPolicyText(activeCampus, it.itemType, "es") ?? "",
      overrideEn: ov?.body_en ?? "",
      overrideEs: ov?.body_es ?? "",
    };
  });

  return (
    <PoliciesClient
      campuses={campuses.map((c) => ({ id: c.id, name: c.name }))}
      activeCampusId={activeCampus}
      items={items}
    />
  );
}
