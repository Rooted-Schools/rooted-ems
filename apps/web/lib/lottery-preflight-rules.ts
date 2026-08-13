/**
 * Preflight readiness rules — pure logic, no IO.
 *
 * Split out from lib/lottery-preflight.ts so the gating decisions can be
 * tested exhaustively without a database, an email provider, or a clock. This
 * is the part that must not be wrong: it decides whether an irreversible,
 * legally consequential action is allowed to proceed.
 *
 * RED blocks Finalize as Official. AMBER warns and allows. Nothing is reported
 * green on the strength of an assumption — a check that could not be evaluated
 * says so and counts as amber or red, never green.
 */

import type { LotteryPolicyConfig } from "@/lib/lottery-policy";

export type PreflightStatus = "green" | "amber" | "red";

export interface PreflightCheck {
  key: string;
  label: string;
  status: PreflightStatus;
  /** One honest sentence. Shown verbatim to staff. */
  message: string;
}

export interface PreflightFacts {
  isRehearsal: boolean;
  runStatus: string;

  /** Adopted policy for the run's campus, parsed. Null when there is none. */
  policyConfig: LotteryPolicyConfig | null;
  policyLabel: string | null;
  policyConfigErrors: string[];
  /** True when migration 00047 has not been applied. */
  policySchemaMissing: boolean;

  /** capacity_plan.total_seats for this campus/grade/year. Null = no plan row. */
  capacitySeats: number | null;
  /** total_seats on the run itself. */
  runSeats: number;

  /**
   * Seats already committed against that capacity: accepted seats and offers
   * still pending a family answer. Optional so existing fact builders keep
   * compiling; when either is present the run is checked against REMAINING
   * capacity rather than against the total, which is the number that matters.
   */
  seatsAccepted?: number | null;
  pendingOfferCount?: number | null;

  entryCount: number;
  /** Entries whose application is not in an eligible status. */
  ineligibleEntryCount: number;

  siblingPreferenceEnabled: boolean;
  siblingLinkageUnresolvable: boolean;
  siblingQualifiedCount: number;
  siblingClaimedUnverifiedCount: number;

  duplicateSuspectCount: number | null;

  emailConfigured: boolean;
  smsConfigured: boolean;

  /** Age in minutes of the offer-expiry cron heartbeat. Null = never ran. */
  offerExpiryHeartbeatAgeMinutes: number | null;
  offerExpiryHeartbeatFailed: boolean;
  offerExpiryCadenceMinutes: number;

  /** Weighted tiers whose declared source field nothing collects. */
  unsourcedTierLabels: string[];
  /**
   * The same tiers with the exact field key each one needs, so the blocking
   * message can tell staff what to add rather than only what is wrong.
   * Optional; when absent the labels above are used on their own.
   */
  unsourcedTierFields?: Array<{ label: string; fieldKey: string }>;
  /**
   * Tiers whose field IS collected but where some applications in this run
   * carry no answer for it — typically applications submitted before the
   * question was added. That is a warning, not a block: the tier works, it
   * just cannot reach those applicants.
   */
  tiersMissingAnswers?: Array<{ label: string; fieldKey: string; applicationsMissing: number }>;
}

// ─── The gating logic (pure) ───────────────────────────────────────────────

export function evaluatePreflight(facts: PreflightFacts): PreflightCheck[] {
  const checks: PreflightCheck[] = [];

  // 1. Adopted policy
  if (facts.policySchemaMissing) {
    checks.push({
      key: "adopted_policy",
      label: "Adopted lottery policy",
      status: "red",
      message:
        "The lottery policy tables are not present in this database, so no policy can govern this run. Apply supabase/migrations/00047_lottery_policy.sql.",
    });
  } else if (!facts.policyConfig) {
    checks.push({
      key: "adopted_policy",
      label: "Adopted lottery policy",
      status: "red",
      message: "No adopted lottery policy for this campus. Official lotteries require one.",
    });
  } else if (facts.policyConfigErrors.length > 0) {
    checks.push({
      key: "adopted_policy",
      label: "Adopted lottery policy",
      status: "red",
      message: `The adopted policy has configuration problems and cannot govern a lottery: ${facts.policyConfigErrors.join(" ")}`,
    });
  } else {
    checks.push({
      key: "adopted_policy",
      label: "Adopted lottery policy",
      status: "green",
      message: `Governed by ${facts.policyLabel ?? "the adopted policy"}.`,
    });
  }

  // 2. Capacity plan
  if (facts.capacitySeats === null) {
    checks.push({
      key: "capacity_plan",
      label: "Capacity plan",
      status: "red",
      message:
        "No capacity plan exists for this campus, grade, and school year, so the seat count on this run is not backed by a planned capacity.",
    });
  } else if (facts.capacitySeats <= 0) {
    checks.push({
      key: "capacity_plan",
      label: "Capacity plan",
      status: "red",
      message: "The capacity plan for this grade is set to zero seats. There is nothing to award.",
    });
  } else {
    // Remaining capacity, not total capacity, is what this run can award.
    // Seats already accepted, and offers still awaiting a family's answer, are
    // spoken for. Awarding more than remain means telling a family they have a
    // seat that does not exist, so this blocks rather than warns.
    const committedKnown =
      facts.seatsAccepted !== undefined && facts.seatsAccepted !== null
        ? true
        : facts.pendingOfferCount !== undefined && facts.pendingOfferCount !== null;
    const committed = (facts.seatsAccepted ?? 0) + (facts.pendingOfferCount ?? 0);
    const remaining = facts.capacitySeats - committed;

    if (committedKnown && facts.runSeats > remaining) {
      checks.push({
        key: "capacity_plan",
        label: "Capacity plan",
        status: "red",
        message: `This run awards ${facts.runSeats} seats but only ${remaining} of the ${facts.capacitySeats} planned seats are still open (${facts.seatsAccepted ?? 0} accepted, ${facts.pendingOfferCount ?? 0} offered and awaiting an answer). Lower the run's seat count or free the committed seats first.`,
      });
    } else if (facts.capacitySeats !== facts.runSeats) {
      checks.push({
        key: "capacity_plan",
        label: "Capacity plan",
        status: "amber",
        message: committedKnown
          ? `This run offers ${facts.runSeats} seats. The capacity plan for this grade is ${facts.capacitySeats}, of which ${remaining} are still open. Confirm which number is right before finalizing.`
          : `This run offers ${facts.runSeats} seats but the capacity plan for this grade is ${facts.capacitySeats}. Confirm which number is right before finalizing.`,
      });
    } else {
      checks.push({
        key: "capacity_plan",
        label: "Capacity plan",
        status: "green",
        message: `Capacity plan set to ${facts.capacitySeats} seats, matching this run.`,
      });
    }
  }

  // 3. Entries present and eligible
  if (facts.entryCount === 0) {
    checks.push({
      key: "entries",
      label: "Applicants entered",
      status: "red",
      message: "This run has no entries. There is no lottery to hold.",
    });
  } else if (facts.ineligibleEntryCount > 0) {
    checks.push({
      key: "entries",
      label: "Applicants entered",
      status: "red",
      message: `${facts.ineligibleEntryCount} of ${facts.entryCount} entries belong to applications that are no longer in an eligible status. Rebuild the run before finalizing.`,
    });
  } else {
    checks.push({
      key: "entries",
      label: "Applicants entered",
      status: "green",
      message: `${facts.entryCount} entries, all in an eligible application status.`,
    });
  }

  // 4. Sibling linkage
  if (!facts.siblingPreferenceEnabled) {
    checks.push({
      key: "sibling_linkage",
      label: "Sibling linkage",
      status: "green",
      message: "The governing policy applies no sibling preference, so no linkage is needed.",
    });
  } else if (facts.siblingLinkageUnresolvable) {
    checks.push({
      key: "sibling_linkage",
      label: "Sibling linkage",
      status: "red",
      message:
        "Sibling preference is required by policy but no legal-guardian linkage could be read for any applicant, so the preference cannot be applied.",
    });
  } else if (facts.siblingClaimedUnverifiedCount > 0) {
    checks.push({
      key: "sibling_linkage",
      label: "Sibling linkage",
      status: "amber",
      message: `${facts.siblingQualifiedCount} applicants have a verified sibling currently enrolled here. ${facts.siblingClaimedUnverifiedCount} more claimed a sibling that no enrollment record confirms; those claims earn no preference until verified.`,
    });
  } else {
    checks.push({
      key: "sibling_linkage",
      label: "Sibling linkage",
      status: "green",
      message: `${facts.siblingQualifiedCount} applicants have a verified sibling currently enrolled here, and no unverified claims are outstanding.`,
    });
  }

  // 5. Duplicate applicants
  if (facts.duplicateSuspectCount === null) {
    checks.push({
      key: "duplicates",
      label: "Duplicate applicants",
      status: "amber",
      message: "The duplicate-applicant check could not be run, so duplicates are unconfirmed.",
    });
  } else if (facts.duplicateSuspectCount > 0) {
    checks.push({
      key: "duplicates",
      label: "Duplicate applicants",
      status: "red",
      message: `${facts.duplicateSuspectCount} possible duplicate households are outstanding at this campus. A duplicate is a family holding two chances at one seat.`,
    });
  } else {
    checks.push({
      key: "duplicates",
      label: "Duplicate applicants",
      status: "green",
      message: "No possible duplicate households outstanding at this campus.",
    });
  }

  // 6. Email delivery
  checks.push(
    facts.emailConfigured
      ? {
          key: "email",
          label: "Email delivery",
          status: "green",
          message: "Email delivery is configured, so results can reach families.",
        }
      : {
          key: "email",
          label: "Email delivery",
          status: "red",
          message:
            "Email delivery is not configured. Lottery results would have nowhere to go, and families would learn nothing.",
        }
  );

  // 7. SMS — informational only
  checks.push({
    key: "sms",
    label: "Text messaging",
    status: facts.smsConfigured ? "green" : "amber",
    message: facts.smsConfigured
      ? "Text messaging is configured; families who opted in will also receive a text."
      : "Text messaging is not configured. Families will be notified by email and in the portal only.",
  });

  // 8. Offer-expiry automation
  const cadence = facts.offerExpiryCadenceMinutes;
  if (facts.offerExpiryHeartbeatAgeMinutes === null) {
    checks.push({
      key: "offer_expiry_cron",
      label: "Offer expiry automation",
      status: "amber",
      message:
        "The offer-expiry automation has never recorded a run. Acceptance deadlines and waitlist promotions depend on it; confirm it is scheduled before offers go out.",
    });
  } else if (facts.offerExpiryHeartbeatFailed) {
    checks.push({
      key: "offer_expiry_cron",
      label: "Offer expiry automation",
      status: "amber",
      message:
        "The last offer-expiry automation run recorded a failure. Deadlines set by this policy will not enforce themselves until it succeeds.",
    });
  } else if (facts.offerExpiryHeartbeatAgeMinutes > cadence * 2) {
    checks.push({
      key: "offer_expiry_cron",
      label: "Offer expiry automation",
      status: "amber",
      message: `The offer-expiry automation last ran ${Math.round(facts.offerExpiryHeartbeatAgeMinutes / 60)} hours ago, past its expected cadence. Acceptance deadlines may not be enforced on time.`,
    });
  } else {
    checks.push({
      key: "offer_expiry_cron",
      label: "Offer expiry automation",
      status: "green",
      message: "The offer-expiry automation is running on schedule.",
    });
  }

  // 9. Weighted tier sources
  //
  // RED, not amber. An enabled weighted tier whose source field is collected
  // nowhere means the board adopted a preference that the draw silently did
  // not apply: every applicant who should have had five entries got one, and
  // the result reads as a lawful weighted lottery. That is the exact failure
  // an authorizer challenge is made of, so it blocks Finalize as Official.
  if (facts.unsourcedTierLabels.length > 0) {
    const named =
      facts.unsourcedTierFields && facts.unsourcedTierFields.length > 0
        ? facts.unsourcedTierFields
            .map((t) => `${t.label} (needs the field "${t.fieldKey}")`)
            .join("; ")
        : facts.unsourcedTierLabels.join("; ");
    checks.push({
      key: "tier_sources",
      label: "Weighted entry data",
      status: "red",
      message: `The policy weights these tiers but the application collects nothing they can read: ${named}. Every applicant would be drawn at the default weight, so the lottery would not be the one the board adopted. Add the field to the application, or disable the tier in the policy, before finalizing.`,
    });
  } else if (facts.tiersMissingAnswers && facts.tiersMissingAnswers.length > 0) {
    const named = facts.tiersMissingAnswers
      .map((t) => `${t.label} (${t.applicationsMissing} applications carry no answer for "${t.fieldKey}")`)
      .join("; ");
    checks.push({
      key: "tier_sources",
      label: "Weighted entry data",
      status: "amber",
      message: `Every weighted tier reads a field the application collects, but some applications in this run predate the question: ${named}. Those applicants are drawn at the default weight.`,
    });
  } else {
    checks.push({
      key: "tier_sources",
      label: "Weighted entry data",
      status: "green",
      message: "Every weighted entry tier in the policy reads a field the application actually collects.",
    });
  }

  return checks;
}

/** True when any check is red. Finalize as Official is disabled while true. */
export function preflightBlocks(checks: PreflightCheck[]): boolean {
  return checks.some((c) => c.status === "red");
}

/** The red checks, for listing the reasons a finalize is disabled. */
export function preflightBlockingReasons(checks: PreflightCheck[]): string[] {
  return checks.filter((c) => c.status === "red").map((c) => c.message);
}

