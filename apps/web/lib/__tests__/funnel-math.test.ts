import { describe, it, expect } from "vitest";
import {
  calculateFunnelMath,
  calculatePace,
  DEFAULT_FUNNEL_RATIOS,
  INQUIRY_STRETCH_MULTIPLE,
} from "../funnel-math";

describe("calculateFunnelMath", () => {
  it("reproduces the workbook's 35-seat worked example", () => {
    // Workbook Tab 1 ships 35 seats as its example and these are its numbers.
    // We plan on Tab 1's ratios rather than s17's performance targets; mixing
    // the two breaks the model (see the module header).
    const r = calculateFunnelMath(35);

    expect(r.withMeltBuffer).toBe(37); // 35 / 0.95 = 36.84
    expect(r.acceptedOffersNeeded).toBe(44); // 36.84 / 0.85 = 43.34
    expect(r.applicationsNeeded).toBe(51); // 43.34 / 0.85 = 50.99
    expect(r.inquiriesNeeded).toBe(102); // 50.99 / 0.50 = 101.99
    expect(r.waitlistTarget).toBe(53); // 35 * 1.5 = 52.5
    expect(r.inquiriesStretch).toBe(105); // 35 * 3
  });

  it("keeps the stretch target ABOVE the computed target at 50% inquiry-to-app", () => {
    // This is the arithmetic that resolves the playbook's 40 vs 50 ambiguity.
    // At 50% the 3x stretch sits above the base target, which is what a
    // stretch goal is supposed to do.
    const r = calculateFunnelMath(35);
    expect(r.inquiriesStretch).toBeGreaterThan(r.inquiriesNeeded);
  });

  it("shows why 40% is incoherent: the stretch falls BELOW the base target", () => {
    // Documents the reasoning rather than asserting the playbook is wrong.
    const at40 = calculateFunnelMath(35, { inquiryToApp: 0.4 });
    expect(at40.inquiriesStretch).toBeLessThan(at40.inquiriesNeeded);
  });

  it("rounds up, never down — you cannot recruit a fraction of a family", () => {
    const r = calculateFunnelMath(10);
    const { meltSurvival, seatAcceptance, lotteryEfficiency, inquiryToApp } =
      DEFAULT_FUNNEL_RATIOS;
    // Derived from the constants rather than hardcoded, so tuning a ratio
    // cannot leave this assertion quietly asserting the old model.
    const exact = 10 / meltSurvival / seatAcceptance / lotteryEfficiency / inquiryToApp;

    expect(Number.isInteger(r.inquiriesNeeded)).toBe(true);
    expect(r.inquiriesNeeded).toBeGreaterThanOrEqual(exact);
    expect(r.inquiriesNeeded - exact).toBeLessThan(1); // ceil, not arbitrary padding
  });

  it("accepts per-campus ratio overrides", () => {
    const tuned = calculateFunnelMath(35, { inquiryToApp: 0.25 });
    const base = calculateFunnelMath(35);
    // Halving conversion should roughly double the inquiries needed.
    expect(tuned.inquiriesNeeded).toBeGreaterThan(base.inquiriesNeeded * 1.8);
  });

  it("falls back to defaults on a nonsense ratio instead of dividing by zero", () => {
    const r = calculateFunnelMath(35, { inquiryToApp: 0 });
    expect(r.ratios.inquiryToApp).toBe(DEFAULT_FUNNEL_RATIOS.inquiryToApp);
    expect(Number.isFinite(r.inquiriesNeeded)).toBe(true);
  });

  it("rejects a ratio above 1, which would claim >100% conversion", () => {
    const r = calculateFunnelMath(35, { seatAcceptance: 1.4 });
    expect(r.ratios.seatAcceptance).toBe(DEFAULT_FUNNEL_RATIOS.seatAcceptance);
  });

  it("returns zeros rather than NaN when no seats are planned", () => {
    const r = calculateFunnelMath(0);
    expect(r.seatsTarget).toBe(0);
    expect(r.inquiriesNeeded).toBe(0);
    expect(Number.isNaN(r.inquiriesNeeded)).toBe(false);
  });

  it("keeps the 3x stretch multiple from playbook s2.2", () => {
    expect(INQUIRY_STRETCH_MULTIPLE).toBe(3);
  });
});

describe("calculatePace", () => {
  it("reports unavailable rather than 0% when there is no target", () => {
    expect(calculatePace(12, 0).status).toBe("unavailable");
    expect(calculatePace(12, 0).progress).toBeNull();
  });

  it("grades at or above target as ahead", () => {
    expect(calculatePace(100, 100).status).toBe("ahead");
  });

  it("grades 80%+ as on track and below that as behind", () => {
    expect(calculatePace(80, 100).status).toBe("on_track");
    expect(calculatePace(79, 100).status).toBe("behind");
  });
});
