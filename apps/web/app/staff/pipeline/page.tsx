import {
  getStaffApplications,
  getPipelineStageCounts,
  getPipelineNeeds,
  getCampuses,
  getGradesForCampuses,
} from "@/lib/queries";
import { requireStaffSession, getAccessibleCampusIds, resolveActiveCampus } from "@/lib/auth/get-session";
import { getCampusLensId } from "@/lib/campus-lens";
import { statusesForStage, DEFAULT_PIPELINE_STAGE, PIPELINE_STAGES } from "@/lib/application-helpers";
import { PipelineClient } from "./pipeline-client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: { campus?: string; stage?: string; search?: string; page?: string; staleDays?: string; grade?: string };
}) {
  const session = await requireStaffSession();
  const accessibleIds = getAccessibleCampusIds(session);
  const lensCampusId = await getCampusLensId(accessibleIds);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus, lensCampusId);
  // Same scoping shape as staff/today: an explicit campus selection narrows
  // to just that campus; otherwise scope to everything this staff member can
  // access (empty array = true org-wide admin, no filter applied downstream).
  const scopedCampusIds = activeCampus ? [activeCampus] : accessibleIds;

  const stage = searchParams?.stage && PIPELINE_STAGES.some((s) => s.key === searchParams.stage)
    ? searchParams.stage
    : DEFAULT_PIPELINE_STAGE;
  const statuses = statusesForStage(stage);
  const searchParam = searchParams?.search || undefined;
  const parsedPage = Number.parseInt(searchParams?.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const parsedStaleDays = Number.parseInt(searchParams?.staleDays ?? "", 10);
  const staleDays = Number.isFinite(parsedStaleDays) && parsedStaleDays > 0 ? parsedStaleDays : undefined;

  // Grade options are the real grades offered at the scoped campuses (not a
  // hardcoded 6-12 list) — a campus that only offers 9-12 shouldn't show 6-8
  // as selectable. Validate the incoming param against that real set so a
  // stale/bookmarked grade for a since-changed campus scope silently falls
  // back to "All grades" instead of returning an honestly-empty table.
  const availableGrades = await getGradesForCampuses(scopedCampusIds);
  const grade = searchParams?.grade && availableGrades.includes(searchParams.grade)
    ? searchParams.grade
    : undefined;

  const [{ rows: applications, totalCount }, stageCounts, allCampuses] = await Promise.all([
    getStaffApplications({
      campusIds: scopedCampusIds,
      statuses,
      search: searchParam,
      staleDays,
      grade,
      page,
      pageSize: PAGE_SIZE,
    }),
    getPipelineStageCounts(scopedCampusIds, grade),
    getCampuses(),
  ]);

  // "What it needs" — one batch of queries covering exactly the rows on this
  // page, never one query per row (see getPipelineNeeds).
  const needsMap = await getPipelineNeeds(
    applications.map((a) => ({ id: a.id, status: a.status }))
  );

  const rows = applications.map((app) => ({
    ...app,
    needsLabel: needsMap.get(app.id)?.needsLabel ?? "—",
    causeKey: needsMap.get(app.id)?.causeKey ?? null,
    causeLabel: needsMap.get(app.id)?.causeLabel ?? null,
  }));

  const campuses = allCampuses.filter(
    (c) => accessibleIds.length === 0 || accessibleIds.includes(c.id)
  );

  return (
    <PipelineClient
      rows={rows}
      totalCount={totalCount}
      page={page}
      pageSize={PAGE_SIZE}
      stageCounts={stageCounts}
      campuses={campuses}
      initialStage={stage}
      initialSearch={searchParams?.search ?? ""}
      initialCampus={searchParams?.campus ?? lensCampusId ?? "all"}
      initialStaleDays={searchParams?.staleDays ?? ""}
      initialGrade={grade ?? "all"}
      availableGrades={availableGrades}
    />
  );
}
