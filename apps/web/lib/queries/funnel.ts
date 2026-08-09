/**
 * The five-stage enrollment funnel (playbook PB 24 v2.2 s2.2).
 *
 * The app already had a pipeline view, but it is a staff WORK QUEUE: needs
 * review, ready for lottery, offer out, registering, enrolled, waitlist. It
 * begins after an application exists and has no notion of retention, so it
 * cannot answer the question the playbook is organised around, which is
 * "where in the family journey are we losing people".
 *
 * This module answers that. It does not replace the pipeline and should not:
 * a work queue and a strategy view are different tools for different moments.
 *
 * Honesty rules, consistent with the equity-funnel module:
 *   - A stage with no denominator returns null, never 0%. Zero percent is a
 *     finding; "cannot compute" is a different finding, and a founding campus
 *     hits the second constantly.
 *   - Retain metrics that depend on attendance return `unavailable` until the
 *     SIS integration lands, rather than counting withdrawals in an empty
 *     table and calling it 100% retention.
 */

import { createServiceRoleClient } from "@rooted-ems/database/server";
import {
  PLAYBOOK_TARGETS,
  INQUIRY_MULTIPLE_TARGET,
  gradeAgainstTarget,
  type PlaybookTarget,
  type RagStatus,
} from "@/lib/playbook-targets";
import {
  calculateFunnelMath,
  calculatePace,
  type FunnelMathResult,
  type FunnelRatios,
  type PaceResult,
} from "@/lib/funnel-math";

/** Settings key holding per-campus planning-ratio overrides. */
const FUNNEL_RATIOS_SETTING_KEY = "funnel_ratios";

/**
 * Per-campus overrides beat the network default, which beats the playbook
 * defaults. Campus-specific only applies when exactly one campus is in scope:
 * blending two campuses' tuned ratios into one number would produce a figure
 * that describes neither school.
 */
function pickRatioOverrides(
  rows: Array<{ campus_id: string | null; value: unknown }>,
  campusIds: string[]
): Partial<FunnelRatios> {
  const asRatios = (v: unknown): Partial<FunnelRatios> =>
    v && typeof v === "object" ? (v as Partial<FunnelRatios>) : {};

  if (campusIds.length === 1) {
    const campusRow = rows.find((r) => r.campus_id === campusIds[0]);
    if (campusRow) return asRatios(campusRow.value);
  }
  const networkRow = rows.find((r) => r.campus_id === null);
  return networkRow ? asRatios(networkRow.value) : {};
}

export interface FunnelStageView {
  key: "generate_interest" | "engage_inform" | "apply" | "enroll" | "retain";
  label: string;
  /** Playbook goal, recognisable to someone holding the document. */
  goal: string;
  /** Families at this stage. Null when the stage cannot be computed. */
  count: number | null;
  /** Conversion INTO this stage from the previous one, 0–1. Null when no denominator. */
  conversionRate: number | null;
  /** Target for that conversion, 0–1. Null where the playbook sets no rate. */
  targetRate: number | null;
  status: RagStatus;
  /** Shown instead of a fabricated number. */
  unavailableReason?: string;
}

export interface EnrollmentFunnel {
  schoolYearName: string | null;
  stages: FunnelStageView[];
  /** Seats planned across scoped campuses. Denominator for the 3x inquiry target. */
  totalSeats: number;
  /** Inquiries as a multiple of seats. Playbook wants >= 3. Null when no seats planned. */
  inquiryMultiple: number | null;
  inquiryMultipleTarget: number;
  inquiryMultipleStatus: RagStatus;
  /** Accepted / offered. Surfaced alongside the stages; playbook s17 grades it. */
  seatAcceptance: number | null;
  seatAcceptanceStatus: RagStatus;
  /** Workbook Tab 1 worked backward from the seat target. */
  math: FunnelMathResult;
  /** Live counts against the computed targets. */
  pace: {
    inquiries: PaceResult;
    applications: PaceResult;
  };
  /** True when a campus has tuned its own planning ratios. */
  usingCustomRatios: boolean;
}

/**
 * Progress against the 3x inquiry target, expressed so it can be graded by the
 * same helper as every rate: 1.0 means "at target". Red below two thirds of
 * target, which mirrors the roughly 1-in-3 shortfall the playbook treats as
 * red elsewhere.
 */
const INQUIRY_MULTIPLE_AS_TARGET: PlaybookTarget = {
  key: "inquiryMultiple",
  label: "Inquiries vs 3x seats",
  target: 1,
  redTrigger: 0.67,
  source: "s2.2",
};

/** Safe divide: null rather than NaN or a misleading zero when there is no denominator. */
function rate(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return numerator / denominator;
}

export async function getEnrollmentFunnel(campusIds: string[] = []): Promise<EnrollmentFunnel> {
  const supabase = createServiceRoleClient();
  const scopeCampus = campusIds.length > 0;

  const { data: sy } = await supabase
    .from("school_year")
    .select("id, name")
    .eq("is_current", true)
    .maybeSingle();

  const schoolYearId = (sy?.id as string | undefined) ?? null;
  const schoolYearName = (sy?.name as string | undefined) ?? null;

  // ── Stage 1: Generate Interest ──────────────────────────────────────────
  const leadQuery = supabase.from("lead").select("stage");
  const { data: leads } = await (scopeCampus ? leadQuery.in("campus_id", campusIds) : leadQuery);
  const leadRows = (leads ?? []) as Array<{ stage: string }>;
  const totalLeads = leadRows.length;

  // ── Stage 2: Engage & Inform ────────────────────────────────────────────
  // A lead still at 'new' has been captured, not nurtured. Counting it as
  // engaged would report the funnel as healthier than it is.
  const engaged = leadRows.filter((l) => l.stage !== "new" && l.stage !== "closed").length;

  // ── Stage 3: Apply ──────────────────────────────────────────────────────
  // `application` has NO school_year_id column: the year hangs off
  // enrollment_window. Filtering on a non-existent column would have thrown at
  // runtime, so the year is resolved through the window and filtered here, the
  // same way equity-funnel.ts does it.
  const appQuery = supabase
    .from("application")
    .select("status, enrollment_window:enrollment_window_id (school_year_id)");
  const { data: apps } = await (scopeCampus ? appQuery.in("campus_id", campusIds) : appQuery);

  // The generated types model an embedded to-one relation as an array while
  // PostgREST returns a single object. Read through a helper that tolerates
  // both rather than casting through `unknown` and hoping.
  const windowYearId = (row: Record<string, unknown>): string | null => {
    const win = row.enrollment_window;
    const one = Array.isArray(win) ? win[0] : win;
    return ((one as { school_year_id?: string | null } | null)?.school_year_id) ?? null;
  };

  const appRows = (apps ?? []) as unknown as Array<Record<string, unknown>>;
  const inYear = schoolYearId
    ? appRows.filter((a) => windowYearId(a) === schoolYearId)
    : appRows;
  // Drafts are not applications. A half-filled form is stage 2 behaviour.
  const submittedApps = inYear.filter((a) => (a.status as string) !== "draft").length;

  // ── Stage 4: Enroll ─────────────────────────────────────────────────────
  const offerQuery = supabase.from("offer").select("status");
  const { data: offers } = await (scopeCampus ? offerQuery.in("campus_id", campusIds) : offerQuery);
  const offerRows = (offers ?? []) as Array<{ status: string }>;
  const offersMade = offerRows.length;
  const offersAccepted = offerRows.filter((o) => o.status === "accepted").length;

  let enrollQuery = supabase.from("enrollment").select("status");
  if (schoolYearId) enrollQuery = enrollQuery.eq("school_year_id", schoolYearId);
  const { data: enrollments } = await (scopeCampus
    ? enrollQuery.in("campus_id", campusIds)
    : enrollQuery);
  const enrolled = ((enrollments ?? []) as Array<{ status: string }>).filter(
    (e) => e.status !== "withdrawn"
  ).length;

  // ── Seats planned, denominator for the 3x inquiry target ────────────────
  let capacityQuery = supabase.from("capacity_plan").select("total_seats");
  if (schoolYearId) capacityQuery = capacityQuery.eq("school_year_id", schoolYearId);
  const { data: capacity } = await (scopeCampus
    ? capacityQuery.in("campus_id", campusIds)
    : capacityQuery);
  const totalSeats = ((capacity ?? []) as Array<{ total_seats: number | null }>).reduce(
    (sum, r) => sum + (r.total_seats ?? 0),
    0
  );

  // ── Planning-ratio overrides ────────────────────────────────────────────
  const { data: settingRows } = await supabase
    .from("setting")
    .select("campus_id, value")
    .eq("key", FUNNEL_RATIOS_SETTING_KEY);
  const overrides = pickRatioOverrides(
    (settingRows ?? []) as Array<{ campus_id: string | null; value: unknown }>,
    campusIds
  );
  const math = calculateFunnelMath(totalSeats, overrides);

  const inquiryToApp = rate(submittedApps, totalLeads);
  const seatAcceptance = rate(offersAccepted, offersMade);
  const enrollmentCompletion = rate(enrolled, offersAccepted);
  const inquiryMultiple = totalSeats > 0 ? totalLeads / totalSeats : null;
  const inquiryMultipleProgress =
    inquiryMultiple === null ? null : inquiryMultiple / INQUIRY_MULTIPLE_TARGET;

  const stages: FunnelStageView[] = [
    {
      key: "generate_interest",
      label: "Generate Interest",
      goal: "3x enrolled capacity in qualified inquiries",
      count: totalLeads,
      conversionRate: null, // Top of funnel: nothing converts INTO it.
      targetRate: null,
      status: gradeAgainstTarget(inquiryMultipleProgress, INQUIRY_MULTIPLE_AS_TARGET),
      ...(totalSeats === 0
        ? {
            unavailableReason:
              "No seats planned for this school year, so the 3x inquiry target has no denominator.",
          }
        : {}),
    },
    {
      key: "engage_inform",
      label: "Engage & Inform",
      goal: "Nurture inquiries and convert 40%+ into complete applications",
      count: engaged,
      conversionRate: rate(engaged, totalLeads),
      targetRate: null,
      status: "unavailable",
      unavailableReason:
        "Reported as a count. The playbook grades this stage on inquiry-to-application, which is shown on Apply.",
    },
    {
      key: "apply",
      label: "Apply",
      goal: "Complete and submit the application or lottery entry",
      count: submittedApps,
      conversionRate: inquiryToApp,
      targetRate: PLAYBOOK_TARGETS.inquiryToApp.target,
      status: gradeAgainstTarget(inquiryToApp, PLAYBOOK_TARGETS.inquiryToApp),
      ...(totalLeads === 0 ? { unavailableReason: "No inquiries recorded yet." } : {}),
    },
    {
      key: "enroll",
      label: "Enroll",
      goal: "Convert 95%+ of accepted families into enrolled students",
      count: enrolled,
      conversionRate: enrollmentCompletion,
      targetRate: PLAYBOOK_TARGETS.enrollmentCompletion.target,
      status: gradeAgainstTarget(enrollmentCompletion, PLAYBOOK_TARGETS.enrollmentCompletion),
      ...(offersAccepted === 0 ? { unavailableReason: "No accepted offers yet." } : {}),
    },
    {
      key: "retain",
      label: "Retain",
      goal: "<5% summer melt, 96%+ 30-day retention, 85%+ re-enrollment",
      count: null,
      conversionRate: null,
      targetRate: PLAYBOOK_TARGETS.thirtyDayRetention.target,
      status: "unavailable",
      unavailableReason:
        "Day 1 attendance and 30-day retention need attendance data from PowerSchool and Skyward Qmlativ. Reporting them before the SIS integration lands would mean inventing them.",
    },
  ];

  return {
    schoolYearName,
    stages,
    totalSeats,
    inquiryMultiple,
    inquiryMultipleTarget: INQUIRY_MULTIPLE_TARGET,
    inquiryMultipleStatus: gradeAgainstTarget(inquiryMultipleProgress, INQUIRY_MULTIPLE_AS_TARGET),
    seatAcceptance,
    seatAcceptanceStatus: gradeAgainstTarget(seatAcceptance, PLAYBOOK_TARGETS.seatAcceptance),
    math,
    pace: {
      inquiries: calculatePace(totalLeads, math.inquiriesNeeded),
      applications: calculatePace(submittedApps, math.applicationsNeeded),
    },
    usingCustomRatios: Object.keys(overrides).length > 0,
  };
}
