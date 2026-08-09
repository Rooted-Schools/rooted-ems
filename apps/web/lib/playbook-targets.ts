/**
 * Playbook PB 24 v2.2 performance standards, in one auditable place.
 *
 * Every number here is quoted from the playbook, not inferred. Where the
 * playbook and the RSF Recruitment Workbook disagreed, the playbook wins: it
 * describes itself as "the authoritative operational guide". The workbook has
 * been reconciled separately (see RSF_Workbook_Update_Notes.md).
 *
 * KNOWN INTERNAL AMBIGUITY, left visible rather than silently resolved:
 * the playbook states the inquiry-to-application standard twice and they do
 * not match. Section 2.2 (the funnel table) says "convert 40%+ into complete
 * applications". Section 17 (the KPI table) says 50%. We use 40% as the stage
 * goal because 2.2 is the funnel definition this view renders, and surface
 * both to staff so nobody has to guess which one their ED meant. Someone at
 * RSF should pick one.
 *
 * These are defaults. Per-campus overrides live in the `setting` table so a
 * campus can tune against its own observed conversion as real data arrives,
 * which is what the playbook's funnel-math calculator assumes.
 */

export interface PlaybookTarget {
  key: string;
  label: string;
  /** Target as a rate 0–1, or a multiple where noted. */
  target: number;
  /** Crossing this is RED per playbook s17. Direction depends on `lowerIsBetter`. */
  redTrigger: number;
  /** True for metrics where a LOWER number is better (melt, equity gap). */
  lowerIsBetter?: boolean;
  /** Playbook section this comes from, so a reader can check the source. */
  source: string;
}

export const PLAYBOOK_TARGETS = {
  inquiryToApp: {
    key: "inquiryToApp",
    label: "Inquiry to application",
    target: 0.4,
    redTrigger: 0.3,
    source: "s2.2 (s17 states 50% — see note)",
  },
  seatAcceptance: {
    key: "seatAcceptance",
    label: "Lottery seat acceptance",
    target: 0.8,
    redTrigger: 0.7,
    source: "s17",
  },
  enrollmentCompletion: {
    key: "enrollmentCompletion",
    label: "Enrollment completion",
    target: 0.95,
    redTrigger: 0.85,
    source: "s17",
  },
  summerMelt: {
    key: "summerMelt",
    label: "Summer melt",
    target: 0.05,
    redTrigger: 0.08,
    lowerIsBetter: true,
    source: "s17",
  },
  dayOneAttendance: {
    key: "dayOneAttendance",
    label: "Day 1 attendance",
    target: 0.95,
    redTrigger: 0.9,
    source: "s17",
  },
  thirtyDayRetention: {
    key: "thirtyDayRetention",
    label: "30-day retention",
    target: 0.96,
    redTrigger: 0.93,
    source: "s17",
  },
  reEnrollment: {
    key: "reEnrollment",
    label: "Re-enrollment",
    target: 0.85,
    redTrigger: 0.8,
    source: "s17",
  },
  equityGap: {
    key: "equityGap",
    label: "Equity gap (max subgroup)",
    target: 0.1,
    redTrigger: 0.1,
    lowerIsBetter: true,
    source: "s17 / s6",
  },
} as const satisfies Record<string, PlaybookTarget>;

export type PlaybookTargetKey = keyof typeof PLAYBOOK_TARGETS;

/** Inquiries needed, as a multiple of enrolled seats. Playbook s2.2. */
export const INQUIRY_MULTIPLE_TARGET = 3;

/** Waitlist target as a multiple of enrolled seats. Workbook Tab 1. */
export const WAITLIST_MULTIPLE_TARGET = 1.5;

/**
 * Channel conversion benchmarks, playbook s17.2.
 *
 * `emsSla` is the follow-up standard the playbook attaches to the channel. It
 * is not decoration: a school-tour lead that sits until tomorrow has already
 * failed the standard, which is a thing the app should be able to say.
 */
export const CHANNEL_BENCHMARKS = [
  { channel: "referral", label: "Referral (family/alumni)", rate: 0.2, emsSla: null },
  { channel: "cbo", label: "Community partner / CBO", rate: 0.15, emsSla: null },
  { channel: "tour", label: "School tour walk-in", rate: 0.12, emsSla: "same_day" },
  { channel: "event", label: "Walk-up inquiry (event)", rate: 0.1, emsSla: "24_hours" },
  { channel: "ad", label: "Social media / digital ad", rate: 0.08, emsSla: null },
  { channel: "cold", label: "Cold outreach / flyer", rate: 0.05, emsSla: null },
] as const;

export type RagStatus = "green" | "yellow" | "red" | "unavailable";

/**
 * Grade an actual against a playbook target.
 *
 * Returns "unavailable" rather than a colour when there is no value or no
 * denominator. A funnel view that renders green for a metric it cannot
 * actually compute is worse than one that admits the gap: the first quietly
 * tells an ED everything is fine.
 */
export function gradeAgainstTarget(
  actual: number | null,
  target: PlaybookTarget
): RagStatus {
  if (actual === null || Number.isNaN(actual)) return "unavailable";

  if (target.lowerIsBetter) {
    if (actual > target.redTrigger) return "red";
    if (actual <= target.target) return "green";
    return "yellow";
  }

  if (actual < target.redTrigger) return "red";
  if (actual >= target.target) return "green";
  return "yellow";
}
