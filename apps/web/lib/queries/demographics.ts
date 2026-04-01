import { createServiceRoleClient } from "@rooted-ems/database/server";

// ─── Types ─────────────────────────────────────────────

export interface DemographicSummary {
  total_applied: number;
  total_offered: number;
  total_accepted: number;
  total_enrolled: number;
}

export interface SubgroupFunnelRow {
  label: string;
  applied: number;
  offered: number;
  offer_rate_pct: number;
  accepted: number;
  accept_rate_pct: number;
  /** true when offer_rate_pct is 10+ points below overall offer rate */
  is_flagged: boolean;
}

export interface GradeDistributionRow {
  grade: string;
  applied: number;
  offered: number;
  enrolled: number;
}

export interface CampusBreakdownRow {
  campus_id: string;
  campus_name: string;
  applied: number;
  offered: number;
  accepted: number;
  enrolled: number;
  offer_rate_pct: number;
}

export interface RaceEthnicityRow {
  group: string;
  applied: number;
  offered: number;
  offer_rate_pct: number;
  accepted: number;
  accept_rate_pct: number;
  is_flagged: boolean;
}

export interface DemographicBreakdowns {
  summary: DemographicSummary;
  equity_funnel: SubgroupFunnelRow[];
  race_ethnicity: RaceEthnicityRow[];
  grade_distribution: GradeDistributionRow[];
  campus_breakdown: CampusBreakdownRow[];
  /** Statuses that do not exist in the DB schema — their counts will be 0 */
  placeholder_fields: string[];
}

// ─── Helpers ─────────────────────────────────────────────

function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

const OFFERED_STATUSES = new Set(["offered", "accepted", "registered", "placement_review", "enrolled"]);
const ACCEPTED_STATUSES = new Set(["accepted", "registered", "placement_review", "enrolled"]);
const ENROLLED_STATUSES = new Set(["enrolled"]);

// ─── Query ─────────────────────────────────────────────

/**
 * Pull all demographic data needed for the Equity & Demographics page.
 * All queries use createServiceRoleClient — no RLS applied, caller is
 * responsible for campus scoping.
 */
export async function getDemographicBreakdowns(
  campusId?: string
): Promise<DemographicBreakdowns> {
  const supabase = createServiceRoleClient();

  // ── 1. Fetch all non-draft applications with student + grade + campus ──
  let query = supabase
    .from("application")
    .select(
      `
      id,
      status,
      campus_id,
      campus:campus_id (name),
      student:student_id (
        race_ethnicity,
        primary_language,
        has_iep,
        has_504
      ),
      grade_level:grade_level_id (grade)
    `
    )
    .neq("status", "draft");

  if (campusId) {
    query = query.eq("campus_id", campusId);
  }

  const { data: rows, error } = await query;

  if (error) {
    console.error("[getDemographicBreakdowns]", error.message);
    // Return zero-state so UI always renders
    return buildZeroState();
  }

  const apps = (rows ?? []) as Array<Record<string, unknown>>;

  // ── 2. Summary counts ──
  const total_applied = apps.length;
  const total_offered = apps.filter((a) => OFFERED_STATUSES.has(a.status as string)).length;
  const total_accepted = apps.filter((a) => ACCEPTED_STATUSES.has(a.status as string)).length;
  const total_enrolled = apps.filter((a) => ENROLLED_STATUSES.has(a.status as string)).length;

  const summary: DemographicSummary = {
    total_applied,
    total_offered,
    total_accepted,
    total_enrolled,
  };

  const overall_offer_rate = pct(total_offered, total_applied);

  // ── 3. IEP / 504 subgroup funnel (fields exist in student table) ──
  const subgroups: Array<{
    label: string;
    filter: (a: Record<string, unknown>) => boolean;
  }> = [
    {
      label: "Overall",
      filter: () => true,
    },
    {
      label: "IEP",
      filter: (a) => {
        const s = a.student as Record<string, unknown> | null;
        return (s?.has_iep as boolean) === true;
      },
    },
    {
      label: "504 Plan",
      filter: (a) => {
        const s = a.student as Record<string, unknown> | null;
        return (s?.has_504 as boolean) === true;
      },
    },
    // ELL and FRL do not exist in the schema — placeholder zeros
    {
      label: "ELL (placeholder)",
      filter: () => false,
    },
    {
      label: "FRL (placeholder)",
      filter: () => false,
    },
  ];

  const equity_funnel: SubgroupFunnelRow[] = subgroups.map(({ label, filter }) => {
    const subset = apps.filter(filter);
    const applied = subset.length;
    const offered = subset.filter((a) => OFFERED_STATUSES.has(a.status as string)).length;
    const accepted = subset.filter((a) => ACCEPTED_STATUSES.has(a.status as string)).length;
    const offer_rate_pct = pct(offered, applied);
    const accept_rate_pct = pct(accepted, offered);
    const is_flagged =
      label !== "Overall" && overall_offer_rate - offer_rate_pct > 10 && applied > 0;

    return {
      label,
      applied,
      offered,
      offer_rate_pct,
      accepted,
      accept_rate_pct,
      is_flagged,
    };
  });

  // ── 4. Race/Ethnicity breakdown ──
  const raceCounts: Record<
    string,
    { applied: number; offered: number; accepted: number }
  > = {};

  for (const app of apps) {
    const student = app.student as Record<string, unknown> | null;
    const groups: string[] =
      Array.isArray(student?.race_ethnicity) && (student.race_ethnicity as string[]).length > 0
        ? (student.race_ethnicity as string[])
        : ["Not Specified"];

    for (const g of groups) {
      if (!raceCounts[g]) raceCounts[g] = { applied: 0, offered: 0, accepted: 0 };
      raceCounts[g].applied++;
      if (OFFERED_STATUSES.has(app.status as string)) raceCounts[g].offered++;
      if (ACCEPTED_STATUSES.has(app.status as string)) raceCounts[g].accepted++;
    }
  }

  const race_ethnicity: RaceEthnicityRow[] = Object.entries(raceCounts)
    .map(([group, counts]) => {
      const offer_rate_pct = pct(counts.offered, counts.applied);
      const accept_rate_pct = pct(counts.accepted, counts.offered);
      return {
        group,
        applied: counts.applied,
        offered: counts.offered,
        offer_rate_pct,
        accepted: counts.accepted,
        accept_rate_pct,
        is_flagged: overall_offer_rate - offer_rate_pct > 10 && counts.applied > 0,
      };
    })
    .sort((a, b) => b.applied - a.applied);

  // ── 5. Grade distribution ──
  const gradeCounts: Record<
    string,
    { applied: number; offered: number; enrolled: number }
  > = {};

  for (const app of apps) {
    const gl = app.grade_level as Record<string, string> | null;
    const grade = gl?.grade ?? "Unknown";
    if (!gradeCounts[grade]) gradeCounts[grade] = { applied: 0, offered: 0, enrolled: 0 };
    gradeCounts[grade].applied++;
    if (OFFERED_STATUSES.has(app.status as string)) gradeCounts[grade].offered++;
    if (ENROLLED_STATUSES.has(app.status as string)) gradeCounts[grade].enrolled++;
  }

  const GRADE_ORDER = [
    "PK", "K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12",
  ];

  const grade_distribution: GradeDistributionRow[] = Object.entries(gradeCounts)
    .map(([grade, counts]) => ({ grade, ...counts }))
    .sort((a, b) => {
      const ai = GRADE_ORDER.indexOf(a.grade);
      const bi = GRADE_ORDER.indexOf(b.grade);
      if (ai === -1 && bi === -1) return a.grade.localeCompare(b.grade);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

  // ── 6. Campus breakdown (only when campusId is undefined) ──
  const campusCounts: Record<
    string,
    { name: string; applied: number; offered: number; accepted: number; enrolled: number }
  > = {};

  for (const app of apps) {
    const cid = app.campus_id as string;
    const campus = app.campus as Record<string, string> | null;
    if (!campusCounts[cid]) {
      campusCounts[cid] = {
        name: campus?.name ?? cid,
        applied: 0,
        offered: 0,
        accepted: 0,
        enrolled: 0,
      };
    }
    campusCounts[cid].applied++;
    if (OFFERED_STATUSES.has(app.status as string)) campusCounts[cid].offered++;
    if (ACCEPTED_STATUSES.has(app.status as string)) campusCounts[cid].accepted++;
    if (ENROLLED_STATUSES.has(app.status as string)) campusCounts[cid].enrolled++;
  }

  const campus_breakdown: CampusBreakdownRow[] = Object.entries(campusCounts)
    .map(([campus_id, counts]) => ({
      campus_id,
      campus_name: counts.name,
      applied: counts.applied,
      offered: counts.offered,
      accepted: counts.accepted,
      enrolled: counts.enrolled,
      offer_rate_pct: pct(counts.offered, counts.applied),
    }))
    .sort((a, b) => b.applied - a.applied);

  return {
    summary,
    equity_funnel,
    race_ethnicity,
    grade_distribution,
    campus_breakdown,
    placeholder_fields: ["ELL (english_learner)", "FRL (free_reduced_lunch)"],
  };
}

// ── Zero-state fallback ──
function buildZeroState(): DemographicBreakdowns {
  return {
    summary: { total_applied: 0, total_offered: 0, total_accepted: 0, total_enrolled: 0 },
    equity_funnel: [],
    race_ethnicity: [],
    grade_distribution: [],
    campus_breakdown: [],
    placeholder_fields: ["ELL (english_learner)", "FRL (free_reduced_lunch)"],
  };
}
