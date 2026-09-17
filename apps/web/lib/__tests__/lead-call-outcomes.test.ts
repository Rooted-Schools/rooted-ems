import { describe, it, expect } from "vitest";
import {
  CALL_OUTCOMES,
  FOLLOW_UP_OPTIONS,
  computeNextFollowUp,
  defaultFollowUpDaysFor,
  buildCallOutcomeBody,
  bodyHasOutcome,
} from "../lead-call-outcomes";

/**
 * The recruiter works from "who do I call today", so the outcome of one call
 * decides when the next one happens. Before this, only "Call back later"
 * scheduled anything — every other outcome cleared the follow-up date and
 * silently dropped the family off the queue after a single voicemail. These
 * tests pin the cadence each outcome implies and the override behaviour.
 */

function parts(iso: string | null) {
  if (!iso) throw new Error("expected a timestamp");
  const d = new Date(iso);
  return { y: d.getFullYear(), m: d.getMonth() + 1, day: d.getDate(), hour: d.getHours() };
}

describe("computeNextFollowUp", () => {
  const now = new Date("2026-09-17T14:30:00"); // mid-afternoon, local

  it("brings a voicemail back around in 2 days", () => {
    const got = parts(computeNextFollowUp({ outcomeKey: "voicemail", now }));
    expect([got.y, got.m, got.day]).toEqual([2026, 9, 19]);
  });

  it("moves a family we actually reached onto a monthly touchpoint", () => {
    const got = parts(computeNextFollowUp({ outcomeKey: "reached", now }));
    expect([got.y, got.m, got.day]).toEqual([2026, 10, 17]);
  });

  it("schedules nothing for a wrong number", () => {
    expect(computeNextFollowUp({ outcomeKey: "wrong_number", now })).toBeNull();
  });

  it("uses the date the family actually named for a callback", () => {
    const got = parts(
      computeNextFollowUp({ outcomeKey: "callback", callbackDate: "2026-10-02", now })
    );
    expect([got.y, got.m, got.day]).toEqual([2026, 10, 2]);
  });

  it("returns null for a callback with no date so the caller can reject it", () => {
    // The dialog surfaces "Pick a date to call back" rather than writing a
    // silently wrong timestamp.
    expect(computeNextFollowUp({ outcomeKey: "callback", now })).toBeNull();
  });

  it("lands every follow-up at 9am so it appears in the morning queue", () => {
    // An interval measured from the moment of the call would hide a 2-day
    // follow-up until mid-afternoon of the day it's due, after the recruiter
    // has already worked their list.
    for (const key of ["voicemail", "reached"]) {
      expect(parts(computeNextFollowUp({ outcomeKey: key, now })).hour).toBe(9);
    }
    expect(
      parts(computeNextFollowUp({ outcomeKey: "callback", callbackDate: "2026-10-02", now })).hour
    ).toBe(9);
  });

  it("lets the recruiter override the outcome default for one call", () => {
    const got = parts(computeNextFollowUp({ outcomeKey: "voicemail", overrideDays: 7, now }));
    expect([got.y, got.m, got.day]).toEqual([2026, 9, 24]);
  });

  it("treats an explicit null override as 'no follow-up', not 'use the default'", () => {
    expect(computeNextFollowUp({ outcomeKey: "reached", overrideDays: null, now })).toBeNull();
  });

  it("invents no cadence for an unknown outcome", () => {
    expect(computeNextFollowUp({ outcomeKey: "not_a_real_outcome", now })).toBeNull();
    expect(defaultFollowUpDaysFor("not_a_real_outcome")).toBeNull();
  });

  it("offers every outcome default as a real choice in the dialog", () => {
    // A default that isn't in the list would render as an empty selector.
    const offered = FOLLOW_UP_OPTIONS.map((o) => o.days);
    for (const outcome of CALL_OUTCOMES) {
      expect(offered).toContain(outcome.defaultFollowUpDays);
    }
  });
});

describe("outcome body encoding still round-trips", () => {
  it("keeps the timeline readable and machine-derivable", () => {
    const body = buildCallOutcomeBody("voicemail", "no answer, mailbox full");
    expect(body).toBe("[Left voicemail] no answer, mailbox full");
    expect(bodyHasOutcome(body, "voicemail")).toBe(true);
    expect(bodyHasOutcome(body, "reached")).toBe(false);
  });
});
