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
  } else if (facts.capacitySeats !== facts.runSeats) {
    checks.push({
      key: "capacity_plan",
      label: "Capacity plan",
      status: "amber",
      message: `This run offers ${facts.runSeats} seats but the capacity plan for this grade is ${facts.capacitySeats}. Confirm which number is right before finalizing.`,
    });
  } else {
    checks.push({
      key: "capacity_plan",
      label: "Capacity plan",
      status: "green",
      message: `Capacity plan set to ${facts.capacitySeats} seats, matching this run.`,
    });
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
  if (facts.unsourcedTierLabels.length > 0) {
    checks.push({
      key: "tier_sources",
      label: "Weighted entry data",
      status: "amber",
      message: `The policy weights ${facts.unsourcedTierLabels.join(" and ")}, but the application does not collect the field each one depends on. No applicant can qualify for those weights until the application captures them; every applicant is drawn at the default weight.`,
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

