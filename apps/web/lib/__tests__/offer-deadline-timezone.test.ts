/**
 * Timezone-aware offer deadlines.
 *
 * The RSV board policy says "a seat not accepted by 4:00 PM on day N is
 * released." That is a wall-clock cutoff on a calendar day in the campus's own
 * zone. The bug these tests pin down: the deadline used to land at whatever
 * time of day offers were sent, in whatever zone the server ran in. The fix is
 * a single stored UTC instant that means 4:00 PM campus-local, so the cron, the
 * accept guard, the email, the SMS, and the in-app screen all agree.
 *
 * The exact UTC instants asserted here are the spot-check the deadline math has
 * to reproduce:
 *   4:00 PM PST (America/Los_Angeles, winter)  -> next day 00:00 UTC
 *   4:00 PM PDT (America/Los_Angeles, summer)  -> same day 23:00 UTC
 *   4:00 PM EST (America/New_York, winter)     -> same day 21:00 UTC
 *   4:00 PM EDT (America/New_York, summer)     -> same day 20:00 UTC
 */
import { describe, it, expect } from "vitest";
import {
  zonedWallClockToUtc,
  acceptanceExpiryFrom,
  waitlistOfferExpiryFrom,
  type LotteryPolicyConfig,
} from "@/lib/lottery-policy";

const LA = "America/Los_Angeles";
const NY = "America/New_York";

/**
 * Minimal policy carrying only the fields the expiry math reads. Cast to the
 * full config type — the deadline functions never touch the rest.
 */
function policy(overrides: {
  acceptanceWindowDays?: number;
  acceptanceCutoffTime?: string;
  waitlistDays?: number;
  waitlistCutoffTime?: string;
}): LotteryPolicyConfig {
  return {
    acceptanceWindowDays: overrides.acceptanceWindowDays ?? 14,
    acceptanceCutoffTime: overrides.acceptanceCutoffTime ?? "16:00",
    waitlistOfferWindow: {
      days: overrides.waitlistDays ?? 2,
      cutoffTime: overrides.waitlistCutoffTime ?? "16:00",
      note: "",
    },
  } as unknown as LotteryPolicyConfig;
}

describe("zonedWallClockToUtc — wall clock to UTC instant", () => {
  it("resolves 4:00 PM PST (America/Los_Angeles, winter, UTC-8)", () => {
    // Jan 15 2026 is standard time; 16:00 PST is 00:00 UTC the next day.
    expect(zonedWallClockToUtc(2026, 1, 15, 16, 0, LA).toISOString()).toBe(
      "2026-01-16T00:00:00.000Z"
    );
  });

  it("resolves 4:00 PM PDT (America/Los_Angeles, summer, UTC-7)", () => {
    // Jul 15 2026 is daylight time; 16:00 PDT is 23:00 UTC the same day.
    expect(zonedWallClockToUtc(2026, 7, 15, 16, 0, LA).toISOString()).toBe(
      "2026-07-15T23:00:00.000Z"
    );
  });

  it("resolves 4:00 PM EST (America/New_York, winter, UTC-5)", () => {
    expect(zonedWallClockToUtc(2026, 1, 15, 16, 0, NY).toISOString()).toBe(
      "2026-01-15T21:00:00.000Z"
    );
  });

  it("resolves 4:00 PM EDT (America/New_York, summer, UTC-4)", () => {
    expect(zonedWallClockToUtc(2026, 7, 15, 16, 0, NY).toISOString()).toBe(
      "2026-07-15T20:00:00.000Z"
    );
  });

  it("uses the offset in effect on the day just after spring-forward", () => {
    // US spring-forward is 2026-03-08. March 9 is already PDT (UTC-7), so the
    // two-pass refine must land on 23:00 UTC, not 00:00 the next day.
    expect(zonedWallClockToUtc(2026, 3, 9, 16, 0, LA).toISOString()).toBe(
      "2026-03-09T23:00:00.000Z"
    );
  });
});

describe("acceptanceExpiryFrom — lands on the policy cutoff, campus-local", () => {
  it("puts a 14-day PST window at 4:00 PM on the correct calendar day", () => {
    // from + 14 days = 2026-01-16T18:00Z, which is Jan 16 in LA; 16:00 PST.
    const from = new Date("2026-01-02T18:00:00.000Z");
    expect(acceptanceExpiryFrom(policy({}), from, LA)).toBe("2026-01-17T00:00:00.000Z");
  });

  it("crosses a DST boundary within the window and still lands at 4:00 PM local", () => {
    // from is before spring-forward (2026-03-08); +14 days lands on Mar 15,
    // which is PDT. The deadline must be 16:00 PDT = 23:00 UTC, proving the
    // cutoff is applied with the offset at the TARGET date, not at `from`.
    const from = new Date("2026-03-01T18:00:00.000Z");
    expect(acceptanceExpiryFrom(policy({}), from, LA)).toBe("2026-03-15T23:00:00.000Z");
  });

  it("applies an Eastern cutoff in Eastern time", () => {
    // from + 14 days = 2026-07-15 in NY, summer; 16:00 EDT = 20:00 UTC.
    const from = new Date("2026-07-01T12:00:00.000Z");
    expect(acceptanceExpiryFrom(policy({}), from, NY)).toBe("2026-07-15T20:00:00.000Z");
  });
});

describe("waitlistOfferExpiryFrom — two-day window on the policy cutoff", () => {
  it("puts a 2-day EDT window at 4:00 PM Eastern", () => {
    // from + 2 days = 2026-07-15 in NY; 16:00 EDT = 20:00 UTC.
    const from = new Date("2026-07-13T12:00:00.000Z");
    expect(waitlistOfferExpiryFrom(policy({}), from, NY)).toBe("2026-07-15T20:00:00.000Z");
  });

  it("puts a 2-day PST window at 4:00 PM Pacific", () => {
    // from + 2 days = 2026-01-15 in LA, winter; 16:00 PST = 00:00 UTC next day.
    const from = new Date("2026-01-13T12:00:00.000Z");
    expect(waitlistOfferExpiryFrom(policy({}), from, LA)).toBe("2026-01-16T00:00:00.000Z");
  });
});

describe("fallbacks — no cutoff, no timezone", () => {
  it("keeps the raw end-of-window instant when the policy has no cutoff", () => {
    // A blank cutoff must NOT invent 16:00; the deadline stays at from + days.
    const from = new Date("2026-03-02T09:00:00.000Z");
    expect(acceptanceExpiryFrom(policy({ acceptanceCutoffTime: "" }), from, LA)).toBe(
      "2026-03-16T09:00:00.000Z"
    );
    expect(waitlistOfferExpiryFrom(policy({ waitlistCutoffTime: "" }), from, LA)).toBe(
      "2026-03-04T09:00:00.000Z"
    );
  });

  it("keeps the raw end-of-window instant when no timezone is provided", () => {
    // A cutoff cannot be honored without a zone; fall back to from + days
    // rather than guessing. This is also the default-argument behavior.
    const from = new Date("2026-03-02T09:00:00.000Z");
    expect(acceptanceExpiryFrom(policy({}), from)).toBe("2026-03-16T09:00:00.000Z");
    expect(acceptanceExpiryFrom(policy({}), from, null)).toBe("2026-03-16T09:00:00.000Z");
    expect(waitlistOfferExpiryFrom(policy({}), from)).toBe("2026-03-04T09:00:00.000Z");
  });
});
