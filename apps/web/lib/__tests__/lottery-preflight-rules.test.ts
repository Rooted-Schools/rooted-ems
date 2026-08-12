/**
 * Preflight gating.
 *
 * These tests decide when an irreversible action is allowed to proceed, so
 * they are written from the failure direction: for each condition, prove that
 * a broken world BLOCKS, and that the reason a staff member reads is the real
 * one. Amber must never block; red must always block.
 */
import { describe, it, expect } from "vitest";
import {
  evaluatePreflight,
  preflightBlocks,
  preflightBlockingReasons,
  type PreflightFacts,
} from "@/lib/lottery-preflight-rules";
import type { LotteryPolicyConfig } from "@/lib/lottery-policy";

/** A minimal stand-in for a parsed policy. Only presence matters to the rules. */
const POLICY = {} as LotteryPolicyConfig;

/** Everything green. Each test breaks exactly one thing. */
function readyFacts(overrides: Partial<PreflightFacts> = {}): PreflightFacts {
  return {
    isRehearsal: false,
    runStatus: "preview",

    policyConfig: POLICY,
    policyLabel: "RSV Enrollment Policy v1",
    policyConfigErrors: [],
    policySchemaMissing: false,

    capacitySeats: 30,
    runSeats: 30,

    entryCount: 120,
    ineligibleEntryCount: 0,

    siblingPreferenceEnabled: true,
    siblingLinkageUnresolvable: false,
    siblingQualifiedCount: 8,
    siblingClaimedUnverifiedCount: 0,

    duplicateSuspectCount: 0,

    emailConfigured: true,
    smsConfigured: true,

    offerExpiryHeartbeatAgeMinutes: 60,
    offerExpiryHeartbeatFailed: false,
    offerExpiryCadenceMinutes: 24 * 60,

    unsourcedTierLabels: [],
    ...overrides,
  };
}

function statusOf(facts: PreflightFacts, key: string) {
  return evaluatePreflight(facts).find((c) => c.key === key)!;
}

describe("evaluatePreflight — the ready case", () => {
  it("passes every check and blocks nothing when the world is in order", () => {
    const checks = evaluatePreflight(readyFacts());
    expect(checks.every((c) => c.status === "green")).toBe(true);
    expect(preflightBlocks(checks)).toBe(false);
    expect(preflightBlockingReasons(checks)).toEqual([]);
  });

  it("evaluates every condition, not a subset", () => {
    const keys = evaluatePreflight(readyFacts()).map((c) => c.key);
    expect(keys).toEqual([
      "adopted_policy",
      "capacity_plan",
      "entries",
      "sibling_linkage",
      "duplicates",
      "email",
      "sms",
      "offer_expiry_cron",
      "tier_sources",
    ]);
  });
});

describe("evaluatePreflight — adopted policy", () => {
  it("blocks when there is no adopted policy, with the honest message", () => {
    const check = statusOf(readyFacts({ policyConfig: null, policyLabel: null }), "adopted_policy");
    expect(check.status).toBe("red");
    expect(check.message).toBe(
      "No adopted lottery policy for this campus. Official lotteries require one."
    );
  });

  it("blocks when the policy tables are missing entirely, and names the migration", () => {
    const check = statusOf(
      readyFacts({ policySchemaMissing: true, policyConfig: null }),
      "adopted_policy"
    );
    expect(check.status).toBe("red");
    expect(check.message).toMatch(/00047_lottery_policy\.sql/);
  });

  it("blocks when the adopted policy itself fails validation", () => {
    const check = statusOf(
      readyFacts({ policyConfigErrors: ["weightedTiers[0] weight must be a whole number."] }),
      "adopted_policy"
    );
    expect(check.status).toBe("red");
    expect(check.message).toMatch(/whole number/);
  });
});

describe("evaluatePreflight — capacity plan", () => {
  it("blocks when no capacity plan exists for this grade and year", () => {
    const check = statusOf(readyFacts({ capacitySeats: null }), "capacity_plan");
    expect(check.status).toBe("red");
    expect(check.message).toMatch(/No capacity plan exists/);
  });

  it("blocks when the capacity plan is set to zero seats", () => {
    const check = statusOf(readyFacts({ capacitySeats: 0 }), "capacity_plan");
    expect(check.status).toBe("red");
    expect(check.message).toMatch(/zero seats/);
  });

  it("warns without blocking when the run's seat count disagrees with the plan", () => {
    const facts = readyFacts({ capacitySeats: 30, runSeats: 28 });
    const check = statusOf(facts, "capacity_plan");
    expect(check.status).toBe("amber");
    expect(check.message).toMatch(/28 seats.*capacity plan.*30/);
    expect(preflightBlocks(evaluatePreflight(facts))).toBe(false);
  });
});

describe("evaluatePreflight — entries", () => {
  it("blocks an empty run", () => {
    const check = statusOf(readyFacts({ entryCount: 0 }), "entries");
    expect(check.status).toBe("red");
    expect(check.message).toMatch(/no entries/i);
  });

  it("blocks when any entry's application has drifted out of an eligible status", () => {
    const check = statusOf(readyFacts({ ineligibleEntryCount: 3 }), "entries");
    expect(check.status).toBe("red");
    expect(check.message).toMatch(/3 of 120 entries/);
  });
});

describe("evaluatePreflight — sibling linkage", () => {
  it("blocks when the policy requires sibling preference but no linkage can be read", () => {
    const check = statusOf(readyFacts({ siblingLinkageUnresolvable: true }), "sibling_linkage");
    expect(check.status).toBe("red");
    expect(check.message).toMatch(/cannot be applied/);
  });

  it("passes when the policy applies no sibling preference at all", () => {
    const check = statusOf(
      readyFacts({ siblingPreferenceEnabled: false, siblingLinkageUnresolvable: true }),
      "sibling_linkage"
    );
    expect(check.status).toBe("green");
  });

  it("warns, without blocking, about sibling claims no enrollment record confirms", () => {
    const facts = readyFacts({ siblingClaimedUnverifiedCount: 4 });
    const check = statusOf(facts, "sibling_linkage");
    expect(check.status).toBe("amber");
    expect(check.message).toMatch(/4 more claimed a sibling/);
    expect(check.message).toMatch(/earn no preference until verified/);
    expect(preflightBlocks(evaluatePreflight(facts))).toBe(false);
  });
});

describe("evaluatePreflight — duplicates", () => {
  it("blocks when duplicate households are outstanding", () => {
    const check = statusOf(readyFacts({ duplicateSuspectCount: 2 }), "duplicates");
    expect(check.status).toBe("red");
    expect(check.message).toMatch(/two chances at one seat/);
  });

  it("warns rather than passing when the duplicate check could not run", () => {
    const check = statusOf(readyFacts({ duplicateSuspectCount: null }), "duplicates");
    expect(check.status).toBe("amber");
    expect(check.message).toMatch(/could not be run/);
  });
});

describe("evaluatePreflight — delivery channels", () => {
  it("blocks when email is not configured, because results could not reach families", () => {
    const check = statusOf(readyFacts({ emailConfigured: false }), "email");
    expect(check.status).toBe("red");
    expect(check.message).toMatch(/families would learn nothing/i);
  });

  it("treats missing SMS as informational only", () => {
    const facts = readyFacts({ smsConfigured: false });
    expect(statusOf(facts, "sms").status).toBe("amber");
    expect(preflightBlocks(evaluatePreflight(facts))).toBe(false);
  });
});

describe("evaluatePreflight — offer expiry automation", () => {
  it("warns when the automation has never run", () => {
    const check = statusOf(readyFacts({ offerExpiryHeartbeatAgeMinutes: null }), "offer_expiry_cron");
    expect(check.status).toBe("amber");
    expect(check.message).toMatch(/never recorded a run/);
  });

  it("warns when the last run failed", () => {
    const check = statusOf(readyFacts({ offerExpiryHeartbeatFailed: true }), "offer_expiry_cron");
    expect(check.status).toBe("amber");
    expect(check.message).toMatch(/recorded a failure/);
  });

  it("warns when the automation is past twice its cadence", () => {
    const check = statusOf(
      readyFacts({ offerExpiryHeartbeatAgeMinutes: 24 * 60 * 3 }),
      "offer_expiry_cron"
    );
    expect(check.status).toBe("amber");
    expect(check.message).toMatch(/72 hours ago/);
  });

  it("passes a heartbeat inside twice its cadence", () => {
    expect(
      statusOf(readyFacts({ offerExpiryHeartbeatAgeMinutes: 24 * 60 * 1.5 }), "offer_expiry_cron")
        .status
    ).toBe("green");
  });

  it("never blocks on automation health", () => {
    const facts = readyFacts({
      offerExpiryHeartbeatAgeMinutes: null,
      offerExpiryHeartbeatFailed: true,
    });
    expect(preflightBlocks(evaluatePreflight(facts))).toBe(false);
  });
});

describe("evaluatePreflight — weighted entry data", () => {
  it("warns, without blocking, when a weighted tier's source field is not collected", () => {
    const facts = readyFacts({
      unsourcedTierLabels: [
        "Child of contracted full-time staff",
        "Economically disadvantaged (FRL-qualifying)",
      ],
    });
    const check = statusOf(facts, "tier_sources");
    expect(check.status).toBe("amber");
    expect(check.message).toMatch(
      /Child of contracted full-time staff and Economically disadvantaged/
    );
    expect(check.message).toMatch(/drawn at the default weight/);
    expect(preflightBlocks(evaluatePreflight(facts))).toBe(false);
  });
});

describe("preflightBlocks and preflightBlockingReasons", () => {
  it("lists every blocking reason, and only blocking reasons", () => {
    const facts = readyFacts({
      policyConfig: null,
      policyLabel: null,
      capacitySeats: 0,
      emailConfigured: false,
      smsConfigured: false, // amber, must not appear
      unsourcedTierLabels: ["Something"], // amber, must not appear
    });
    const checks = evaluatePreflight(facts);
    const reasons = preflightBlockingReasons(checks);

    expect(preflightBlocks(checks)).toBe(true);
    expect(reasons).toHaveLength(3);
    expect(reasons.join(" ")).toMatch(/No adopted lottery policy/);
    expect(reasons.join(" ")).toMatch(/zero seats/);
    expect(reasons.join(" ")).toMatch(/Email delivery is not configured/);
    expect(reasons.join(" ")).not.toMatch(/Text messaging/);
  });

  it("blocks on a single red among otherwise green checks", () => {
    expect(preflightBlocks(evaluatePreflight(readyFacts({ entryCount: 0 })))).toBe(true);
  });
});
