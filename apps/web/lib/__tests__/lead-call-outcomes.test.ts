import { describe, it, expect, afterEach } from "vitest";
import {
  CALL_OUTCOMES,
  DEFAULT_FOLLOW_UP_TIME,
  FOLLOW_UP_OPTIONS,
  computeNextFollowUp,
  defaultFollowUpDaysFor,
  buildCallOutcomeBody,
  bodyHasOutcome,
  todayLocalYmd,
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


  it("keeps the hour the family actually named for a callback", () => {
    // "Call me back Thursday at 2pm" has to land at 2pm, not at the start of
    // the day — scheduling the day and losing the hour is what made the
    // promise unkeepable.
    const got = parts(
      computeNextFollowUp({
        outcomeKey: "callback",
        callbackDate: "2026-10-02",
        callbackTime: "14:00",
        now,
      })
    );
    expect([got.y, got.m, got.day, got.hour]).toEqual([2026, 10, 2, 14]);
  });

  it("falls back to the start of the day when the family named no hour", () => {
    const got = parts(
      computeNextFollowUp({ outcomeKey: "callback", callbackDate: "2026-10-02", now })
    );
    expect(got.hour).toBe(Number(DEFAULT_FOLLOW_UP_TIME.split(":")[0]));
  });

  it("ignores a malformed time rather than producing an invalid date", () => {
    const got = parts(
      computeNextFollowUp({
        outcomeKey: "callback",
        callbackDate: "2026-10-02",
        callbackTime: "not-a-time",
        now,
      })
    );
    expect([got.y, got.m, got.day, got.hour]).toEqual([2026, 10, 2, 9]);
  });

  it("applies a named time only to callbacks, never to interval outcomes", () => {
    // A voicemail retry is a morning-queue item; an hour typed for a
    // different outcome must not leak into it.
    const got = parts(
      computeNextFollowUp({ outcomeKey: "voicemail", callbackTime: "14:00", now })
    );
    expect(got.hour).toBe(9);
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

describe("todayLocalYmd — callback date picker min", () => {
  const originalTZ = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTZ;
  });

  it("reads the local calendar date, not the UTC one, once UTC has rolled over", () => {
    process.env.TZ = "America/New_York";
    // 11:30 PM EST on Jan 15 is 04:30 UTC on Jan 16 — the exact moment (as
    // early as 7pm ET) the old `new Date().toISOString().split("T")[0]`
    // min-date logic started refusing to let a recruiter pick "today".
    const now = new Date("2026-01-16T04:30:00.000Z");
    expect(now.toISOString().split("T")[0]).toBe("2026-01-16"); // the old, wrong value
    expect(todayLocalYmd(now)).toBe("2026-01-15"); // the fix
  });

  it("still agrees with the UTC date when local time hasn't crossed midnight", () => {
    process.env.TZ = "America/New_York";
    // Noon EST has no UTC/local skew for the calendar date.
    const now = new Date("2026-01-15T17:00:00.000Z");
    expect(todayLocalYmd(now)).toBe(now.toISOString().split("T")[0]);
  });
});
