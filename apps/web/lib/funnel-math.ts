/**
 * Funnel math calculator (RSF Recruitment Workbook Tab 1).
 *
 * Works BACKWARD from the seat target an authorizer or charter agreement
 * fixed, through each conversion the funnel has to survive, to the number of
 * inquiries a campus actually needs. Without this a campus cannot tell whether
 * today's lead volume puts it on pace, which with two campuses recruiting
 * simultaneously is the difference between managing two pipelines and hoping.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PLANNING ASSUMPTION vs PERFORMANCE TARGET
 *
 * These are not the same number and conflating them produces a broken model.
 *
 *   Performance target  = what we are trying to ACHIEVE. Playbook s17 says
 *                         seat acceptance should be 80%. That is what the
 *                         funnel view grades against (lib/playbook-targets).
 *   Planning assumption = what we conservatively EXPECT when sizing the top
 *                         of the funnel. Workbook Tab 1 plans at 85%.
 *
 * The ratios below are PLANNING assumptions and come from Tab 1. They are
 * intentionally not the s17 targets. Substituting the targets here looks
 * tempting and quietly breaks the model — see the note on 40 vs 50 below,
 * which only resolves when the chain uses its own planning ratios.
 *
 * ON THE 40% vs 50% AMBIGUITY
 *
 * The playbook states inquiry-to-application twice and they disagree: s2.2
 * (the funnel table) says 40%, s17 (the KPI table) says 50%. The arithmetic
 * favours 50%.
 *
 * At a 35-seat target, running Tab 1's chain:
 *      at 50%  →  ~102 inquiries needed
 *      at 40%  →  ~128 inquiries needed
 *
 * The playbook separately sets a STRETCH target of 3x enrolled seats = 105. A
 * stretch goal should sit ABOVE the base target. At 50% it does (105 > 102).
 * At 40% the "stretch" lands 23 inquiries BELOW the base target, which is
 * incoherent.
 *
 * Caveat worth stating plainly: this argument holds only because the two
 * figures come from the same chain. The 3x multiple is a NAPCS field
 * benchmark and the chain is arithmetic, so they were never strictly required
 * to agree. This is suggestive, not proof. Someone at RSF should confirm which
 * figure is intended and fix the document; the UI surfaces both rather than
 * hiding the choice in code.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Every ratio is overridable per campus via the `setting` table, because the
 * playbook's own funnel-math tab expects schools to tune against observed
 * conversion as real data accumulates.
 */

export interface FunnelRatios {
  /** Survive summer melt. Playbook target <5% melt, so plan at 0.95. */
  meltSurvival: number;
  /**
   * Offers accepted, as a PLANNING assumption (Workbook Tab 1 = 0.85).
   * Deliberately not s17's 80% performance target — see the header note.
   */
  seatAcceptance: number;
  /** Applications that survive to a usable lottery entry. Workbook Tab 1. */
  lotteryEfficiency: number;
  /** Inquiries that become complete applications. See note above on 40 vs 50. */
  inquiryToApp: number;
}

export const DEFAULT_FUNNEL_RATIOS: FunnelRatios = {
  meltSurvival: 0.95,
  seatAcceptance: 0.85,
  lotteryEfficiency: 0.85,
  inquiryToApp: 0.5,
};

/** Playbook s2.2 stretch: 3x enrolled seats. */
export const INQUIRY_STRETCH_MULTIPLE = 3;
/** Workbook Tab 1: 1.5x enrolled seats. */
export const WAITLIST_MULTIPLE = 1.5;

export interface FunnelMathResult {
  seatsTarget: number;
  /** Seats to fill allowing for melt. */
  withMeltBuffer: number;
  acceptedOffersNeeded: number;
  applicationsNeeded: number;
  inquiriesNeeded: number;
  /** 3x seats. Shown alongside the computed target. */
  inquiriesStretch: number;
  waitlistTarget: number;
  ratios: FunnelRatios;
}

/**
 * A ratio of zero would divide by zero and a ratio above 1 is nonsense
 * (you cannot convert 120% of your inquiries). Clamp rather than throw: a bad
 * setting row should degrade the number, not take down the page.
 */
function safeRatio(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 1) return fallback;
  return value;
}

export function calculateFunnelMath(
  seatsTarget: number,
  overrides: Partial<FunnelRatios> = {}
): FunnelMathResult {
  const ratios: FunnelRatios = {
    meltSurvival: safeRatio(overrides.meltSurvival ?? NaN, DEFAULT_FUNNEL_RATIOS.meltSurvival),
    seatAcceptance: safeRatio(overrides.seatAcceptance ?? NaN, DEFAULT_FUNNEL_RATIOS.seatAcceptance),
    lotteryEfficiency: safeRatio(
      overrides.lotteryEfficiency ?? NaN,
      DEFAULT_FUNNEL_RATIOS.lotteryEfficiency
    ),
    inquiryToApp: safeRatio(overrides.inquiryToApp ?? NaN, DEFAULT_FUNNEL_RATIOS.inquiryToApp),
  };

  const seats = Number.isFinite(seatsTarget) && seatsTarget > 0 ? seatsTarget : 0;

  const withMeltBuffer = seats / ratios.meltSurvival;
  const acceptedOffersNeeded = withMeltBuffer / ratios.seatAcceptance;
  const applicationsNeeded = acceptedOffersNeeded / ratios.lotteryEfficiency;
  const inquiriesNeeded = applicationsNeeded / ratios.inquiryToApp;

  // Ceil, not round: you cannot recruit a fraction of a family, and rounding
  // down sets a target that is knowably short.
  return {
    seatsTarget: seats,
    withMeltBuffer: Math.ceil(withMeltBuffer),
    acceptedOffersNeeded: Math.ceil(acceptedOffersNeeded),
    applicationsNeeded: Math.ceil(applicationsNeeded),
    inquiriesNeeded: Math.ceil(inquiriesNeeded),
    inquiriesStretch: Math.ceil(seats * INQUIRY_STRETCH_MULTIPLE),
    waitlistTarget: Math.ceil(seats * WAITLIST_MULTIPLE),
    ratios,
  };
}

export type PaceStatus = "ahead" | "on_track" | "behind" | "unavailable";

export interface PaceResult {
  actual: number;
  target: number;
  /** actual / target, 0–1+. Null when target is zero. */
  progress: number | null;
  status: PaceStatus;
}

/**
 * Pace against a target.
 *
 * Deliberately NOT time-weighted. A "you should be 40% of the way by now"
 * calculation needs a recruitment season start and end date, which the app
 * does not hold, and inventing one would produce confident nonsense. This
 * reports raw progress and lets staff apply their own calendar judgement.
 */
export function calculatePace(actual: number, target: number): PaceResult {
  if (!target || target <= 0) {
    return { actual, target, progress: null, status: "unavailable" };
  }
  const progress = actual / target;
  const status: PaceStatus = progress >= 1 ? "ahead" : progress >= 0.8 ? "on_track" : "behind";
  return { actual, target, progress, status };
}
