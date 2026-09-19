import { describe, it, expect } from "vitest";
import { isEligibleForReengagement } from "../lead-reengagement";

/**
 * The re-engage-leads cron used to select purely on last_contact_at /
 * created_at being older than QUIET_DAYS, ignoring next_follow_up_at and the
 * latest call outcome entirely. Two consequences this predicate closes:
 *
 *  (a) Logging "Wrong number" sets last_contact_at = now() (call is a
 *      CONTACT_ACTIVITY_TYPE) — seven days later the cron would text/email
 *      that same bad number anyway.
 *  (b) A callback promised more than QUIET_DAYS out had its promised time
 *      overwritten mid-window by an automated "still interested?" blast.
 */

describe("isEligibleForReengagement", () => {
  it("excludes a lead flagged as a wrong number, even with no follow-up date", () => {
    expect(
      isEligibleForReengagement({
        next_follow_up_at: null,
        next_follow_up_reason: "wrong_number",
      })
    ).toBe(false);
  });

  it("excludes a lead with a future-dated promised follow-up", () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const twoWeeksOut = new Date("2026-06-15T14:00:00.000Z").toISOString();

    expect(
      isEligibleForReengagement(
        { next_follow_up_at: twoWeeksOut, next_follow_up_reason: "callback" },
        now
      )
    ).toBe(false);
  });

  it("includes a lead with no follow-up date and no reason", () => {
    expect(
      isEligibleForReengagement({ next_follow_up_at: null, next_follow_up_reason: null })
    ).toBe(true);
  });

  it("includes a lead whose follow-up is due now or in the past", () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const yesterday = new Date("2026-05-31T12:00:00.000Z").toISOString();

    expect(
      isEligibleForReengagement(
        { next_follow_up_at: yesterday, next_follow_up_reason: "voicemail" },
        now
      )
    ).toBe(true);
  });

  it("still excludes wrong_number even when its own follow-up date is in the past", () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const yesterday = new Date("2026-05-31T12:00:00.000Z").toISOString();

    expect(
      isEligibleForReengagement(
        { next_follow_up_at: yesterday, next_follow_up_reason: "wrong_number" },
        now
      )
    ).toBe(false);
  });
});
