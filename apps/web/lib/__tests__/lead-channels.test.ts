import { describe, it, expect } from "vitest";
import {
  SOURCE_TO_CHANNEL,
  benchmarkForSource,
  followUpDeadline,
  followUpStandardLabel,
} from "../lead-channels";

describe("source to playbook channel mapping", () => {
  it("maps referral to the 20% benchmark", () => {
    expect(benchmarkForSource("referral")?.rate).toBe(0.2);
  });

  it("maps the two sources the app previously could not record", () => {
    expect(benchmarkForSource("cbo")?.rate).toBe(0.15);
    expect(benchmarkForSource("tour")?.rate).toBe(0.12);
  });

  it("leaves website unmapped rather than forcing it into cold outreach", () => {
    // Judging organic web traffic against a 5% flyer benchmark would be
    // inventing a standard the playbook never set.
    expect(SOURCE_TO_CHANNEL.website).toBeNull();
    expect(benchmarkForSource("website")).toBeNull();
  });

  it("leaves internal staff entry unmapped", () => {
    expect(benchmarkForSource("staff")).toBeNull();
  });

  it("returns null for a source it has never heard of", () => {
    expect(benchmarkForSource("carrier_pigeon")).toBeNull();
  });
});

describe("follow-up deadlines", () => {
  const monday9am = new Date("2026-08-10T09:00:00");

  it("gives a school tour until the END OF THAT DAY, not 24 hours", () => {
    const deadline = followUpDeadline("tour", monday9am);
    expect(deadline?.getDate()).toBe(monday9am.getDate());
    expect(deadline?.getHours()).toBe(23);
  });

  it("gives an event lead a rolling 24 hours", () => {
    const deadline = followUpDeadline("event", monday9am);
    expect(deadline?.getTime()).toBe(monday9am.getTime() + 24 * 60 * 60 * 1000);
  });

  it("does NOT treat same-day and 24-hour as the same deadline", () => {
    // The bug this replaced: collapsing both to 24h quietly relaxed the
    // stricter tour standard by up to 15 hours.
    const tour = followUpDeadline("tour", monday9am);
    const event = followUpDeadline("event", monday9am);
    expect(tour?.getTime()).not.toBe(event?.getTime());
    expect(tour!.getTime()).toBeLessThan(event!.getTime());
  });

  it("returns null where the playbook sets no standard", () => {
    expect(followUpDeadline("ad", monday9am)).toBeNull();
    expect(followUpStandardLabel("ad")).toBeNull();
  });

  it("labels each standard distinctly for the UI", () => {
    expect(followUpStandardLabel("tour")).toMatch(/same-day/i);
    expect(followUpStandardLabel("event")).toMatch(/24 hours/i);
  });
});
