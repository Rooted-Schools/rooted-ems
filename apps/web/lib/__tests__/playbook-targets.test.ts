import { describe, it, expect } from "vitest";
import {
  gradeAgainstTarget,
  PLAYBOOK_TARGETS,
  CHANNEL_BENCHMARKS,
  INQUIRY_MULTIPLE_TARGET,
} from "../playbook-targets";

/**
 * Two classes of bug this guards against.
 *
 * 1. Direction. Half these metrics are "higher is better" and half are
 *    "lower is better". Grading summer melt with the higher-is-better branch
 *    would report a melting school as green, which is the single most
 *    dangerous wrong answer this module could give.
 *
 * 2. Fabricated confidence. A missing value must never grade as green. A
 *    founding campus has no data for most of these, and a dashboard that says
 *    "on target" because it divided by zero is worse than no dashboard.
 */

describe("gradeAgainstTarget — higher is better", () => {
  const t = PLAYBOOK_TARGETS.enrollmentCompletion; // target .95, red .85

  it("grades at or above target as green", () => {
    expect(gradeAgainstTarget(0.95, t)).toBe("green");
    expect(gradeAgainstTarget(1, t)).toBe("green");
  });

  it("grades between red and target as yellow", () => {
    expect(gradeAgainstTarget(0.9, t)).toBe("yellow");
  });

  it("grades below the red trigger as red", () => {
    expect(gradeAgainstTarget(0.84, t)).toBe("red");
  });

  it("treats the red trigger itself as yellow, not red", () => {
    // "Below 85%" in the playbook means 85% is not yet red.
    expect(gradeAgainstTarget(0.85, t)).toBe("yellow");
  });
});

describe("gradeAgainstTarget — lower is better", () => {
  const melt = PLAYBOOK_TARGETS.summerMelt; // target .05, red >.08

  it("grades at or below target as green", () => {
    expect(gradeAgainstTarget(0.05, melt)).toBe("green");
    expect(gradeAgainstTarget(0.01, melt)).toBe("green");
  });

  it("grades between target and red as yellow", () => {
    expect(gradeAgainstTarget(0.07, melt)).toBe("yellow");
  });

  it("grades above the red trigger as red", () => {
    expect(gradeAgainstTarget(0.09, melt)).toBe("red");
  });

  it("does NOT report a badly melting school as green", () => {
    // The direction bug, stated as the outcome it would cause.
    expect(gradeAgainstTarget(0.4, melt)).not.toBe("green");
    expect(gradeAgainstTarget(0.4, melt)).toBe("red");
  });
});

describe("gradeAgainstTarget — missing data", () => {
  it("returns unavailable for null rather than guessing", () => {
    expect(gradeAgainstTarget(null, PLAYBOOK_TARGETS.seatAcceptance)).toBe("unavailable");
  });

  it("returns unavailable for NaN, which is what a 0/0 divide produces", () => {
    expect(gradeAgainstTarget(Number.NaN, PLAYBOOK_TARGETS.seatAcceptance)).toBe("unavailable");
  });

  it("never grades missing data as green", () => {
    for (const target of Object.values(PLAYBOOK_TARGETS)) {
      expect(gradeAgainstTarget(null, target)).not.toBe("green");
    }
  });
});

describe("playbook values match the document", () => {
  it("carries the s17 KPI targets and red triggers verbatim", () => {
    expect(PLAYBOOK_TARGETS.seatAcceptance).toMatchObject({ target: 0.8, redTrigger: 0.7 });
    expect(PLAYBOOK_TARGETS.enrollmentCompletion).toMatchObject({ target: 0.95, redTrigger: 0.85 });
    expect(PLAYBOOK_TARGETS.summerMelt).toMatchObject({ target: 0.05, redTrigger: 0.08 });
    expect(PLAYBOOK_TARGETS.dayOneAttendance).toMatchObject({ target: 0.95, redTrigger: 0.9 });
    expect(PLAYBOOK_TARGETS.thirtyDayRetention).toMatchObject({ target: 0.96, redTrigger: 0.93 });
    expect(PLAYBOOK_TARGETS.reEnrollment).toMatchObject({ target: 0.85, redTrigger: 0.8 });
  });

  it("uses the playbook's 96/85, not the workbook's superseded 97/90", () => {
    expect(PLAYBOOK_TARGETS.thirtyDayRetention.target).not.toBe(0.97);
    expect(PLAYBOOK_TARGETS.reEnrollment.target).not.toBe(0.9);
  });

  it("carries the s17.2 channel benchmarks including the two the workbook lacked", () => {
    const byChannel = Object.fromEntries(CHANNEL_BENCHMARKS.map((c) => [c.channel, c.rate]));
    expect(byChannel).toMatchObject({
      referral: 0.2,
      cbo: 0.15,
      tour: 0.12,
      event: 0.1,
      ad: 0.08,
      cold: 0.05,
    });
  });

  it("keeps the 3x inquiry target from s2.2", () => {
    expect(INQUIRY_MULTIPLE_TARGET).toBe(3);
  });
});
