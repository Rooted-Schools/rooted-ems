/**
 * Policy configuration validation.
 *
 * The contract this file pins down: a configuration that cannot govern a
 * lottery is REJECTED WITH A REASON, never silently repaired into something
 * plausible. A quietly defaulted acceptance window is a made-up deadline in a
 * family's email.
 */
import { describe, it, expect } from "vitest";
import {
  parseLotteryPolicyConfig,
  isLotteryPolicyConfigValid,
  enabledWeightedTiers,
  siblingAbsolutePreference,
  unsourcedWeightedTiers,
  acceptanceExpiryFrom,
  waitlistOfferExpiryFrom,
  renderPolicyStatements,
  governanceLabel,
  type LotteryPolicyConfig,
} from "@/lib/lottery-policy";

/** A configuration matching the RSV board policy, adopted 2023-01-25, revised 2024-08-20. */
function rsvConfig(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    jurisdiction: "WA",
    adoptedBy: "Rooted School Vancouver Board of Directors",
    sourceDocument:
      "Rooted School Vancouver Enrollment Policy (adopted 2023-01-25, revised 2024-08-20)",
    administeredBy: "Director of Operations",
    applicationWindow: {
      opensMonthDay: "11-01",
      closesRule: "last_day_of_february",
      note: "Applications are accepted November 1 through the last day of February.",
    },
    lotteryDate: {
      monthDay: "03-01",
      weekendRule: "next_weekday",
      note: "Lottery is held and offers are made on March 1.",
    },
    absolutePreferences: [
      {
        key: "sibling_current_enrolled",
        label: "Sibling of a currently enrolled student",
        enabled: true,
        autoOfferBeforeDraw: true,
        overflowToPriorityWaitlist: true,
        siblingDefinition: "shared_legal_guardian",
        definition: "A sibling shares a legal parent or guardian.",
        fosterExcludedUntilLegalGuardianship: true,
        verificationMayBeRequired: true,
        falseClaimForfeitsSeat: true,
        authorityNote: "RSV Board Enrollment Policy, revised 2024-08-20.",
      },
    ],
    defaultWeight: 1,
    weightedTiers: [
      {
        key: "staff_child",
        label: "Child of contracted full-time staff",
        weight: 5,
        enabled: true,
        optional: false,
        source: { kind: "application_answer", field: "is_staff_child" },
        authorityNote: "RSV Board Enrollment Policy, revised 2024-08-20.",
      },
      {
        key: "economically_disadvantaged",
        label: "Economically disadvantaged (FRL-qualifying)",
        weight: 3,
        enabled: true,
        optional: false,
        source: { kind: "application_answer", field: "is_frl_qualifying" },
        authorityNote: "RSV Board Enrollment Policy, revised 2024-08-20.",
      },
    ],
    linkedSiblingActivation: true,
    legacyPreference: false,
    preferencesFromOriginalApplicationOnly: true,
    falsifiedInformationInvalidates: true,
    preferenceClaimNote: "Preferences derive only from the original application.",
    acceptanceWindowDays: 14,
    acceptanceCutoffTime: "16:00",
    acceptanceNote: "A seat not accepted by 4:00 PM on day 14 is released to the waitlist.",
    waitlistNotifyDayOffset: 15,
    enrollmentPacketDueDays: 30,
    reenrollmentDueDays: 30,
    waitlistOfferWindow: { days: 2, cutoffTime: "16:00", note: "Expires at 4:00 PM on day two." },
    waitlistScope: "per_grade",
    waitlistCarryover: false,
    waitlistNote: "Waitlists are created per grade immediately after the lottery.",
    observers: [
      { role: "Board representative", required: true },
      { role: "Community partner representative", required: true },
    ],
    openMeetingsActCompliance: true,
    openMeetingsActNote: "Conducted in compliance with the Washington Open Public Meetings Act.",
    postLotteryRolling: { allowed: false, exceptions: ["A grade is under capacity."] },
    backfillRule: "No backfill after the first trimester unless advisory capacity falls below 80 percent.",
    mckinneyVentoNote: "Enrollment of students experiencing homelessness is never delayed.",
    optionalFeatures: {
      multiBirthSingleUnit: { enabled: false, authorityNote: "" },
      foundersChildren: { enabled: false, weight: 1, capPercent: 0, authorityNote: "" },
      geographicZone: { enabled: false, weight: 1, zoneDescription: "", authorityNote: "" },
      militaryFamily: { enabled: false, weight: 1, authorityNote: "" },
      boardMemberChildren: { enabled: false, weight: 1, authorityNote: "" },
      returningStudentExemption: { enabled: false, note: "", authorityNote: "" },
    },
  };
}

describe("parseLotteryPolicyConfig — the RSV configuration", () => {
  it("parses the board-adopted RSV configuration with no errors", () => {
    const { config, errors } = parseLotteryPolicyConfig(rsvConfig());
    expect(errors).toEqual([]);
    expect(config).not.toBeNull();
    expect(isLotteryPolicyConfigValid(rsvConfig())).toBe(true);
  });

  it("preserves the board's numbers exactly", () => {
    const { config } = parseLotteryPolicyConfig(rsvConfig());
    expect(config!.acceptanceWindowDays).toBe(14);
    expect(config!.acceptanceCutoffTime).toBe("16:00");
    expect(config!.waitlistOfferWindow.days).toBe(2);
    expect(config!.waitlistOfferWindow.cutoffTime).toBe("16:00");
    expect(config!.waitlistCarryover).toBe(false);
    expect(config!.linkedSiblingActivation).toBe(true);
    expect(config!.legacyPreference).toBe(false);
    expect(config!.defaultWeight).toBe(1);

    const tiers = enabledWeightedTiers(config!);
    expect(tiers.map((t) => [t.key, t.weight])).toEqual([
      ["staff_child", 5],
      ["economically_disadvantaged", 3],
    ]);
  });

  it("keeps every optional preference switched off", () => {
    const { config } = parseLotteryPolicyConfig(rsvConfig());
    for (const feature of Object.values(config!.optionalFeatures)) {
      expect(feature.enabled).toBe(false);
    }
  });

  it("exposes the sibling absolute preference with its verification rules", () => {
    const { config } = parseLotteryPolicyConfig(rsvConfig());
    const preference = siblingAbsolutePreference(config!);
    expect(preference).not.toBeNull();
    expect(preference!.autoOfferBeforeDraw).toBe(true);
    expect(preference!.overflowToPriorityWaitlist).toBe(true);
    expect(preference!.siblingDefinition).toBe("shared_legal_guardian");
    expect(preference!.fosterExcludedUntilLegalGuardianship).toBe(true);
    expect(preference!.falseClaimForfeitsSeat).toBe(true);
  });

  it("reports both RSV weighted tiers as unsourced, because the application collects neither field", () => {
    // This is the honest gap, asserted rather than hidden: the board weights
    // staff children and economically disadvantaged applicants, and the
    // application form captures neither indicator.
    const { config } = parseLotteryPolicyConfig(rsvConfig());
    const unsourced = unsourcedWeightedTiers(config!).map((t) => t.key);
    expect(unsourced).toEqual(["staff_child", "economically_disadvantaged"]);
  });

  it("derives deadlines from the policy, not from a hardcoded number", () => {
    const { config } = parseLotteryPolicyConfig(rsvConfig());
    const from = new Date("2026-03-02T09:00:00.000Z");
    expect(acceptanceExpiryFrom(config!, from)).toBe("2026-03-16T09:00:00.000Z");
    expect(waitlistOfferExpiryFrom(config!, from)).toBe("2026-03-04T09:00:00.000Z");
  });
});

describe("parseLotteryPolicyConfig — refusals", () => {
  it("refuses a missing configuration outright", () => {
    expect(parseLotteryPolicyConfig(null).config).toBeNull();
    expect(parseLotteryPolicyConfig(undefined).errors[0]).toMatch(/missing/i);
    expect(parseLotteryPolicyConfig("not an object").config).toBeNull();
    expect(parseLotteryPolicyConfig([]).config).toBeNull();
  });

  it("rejects a fractional or zero weight instead of rounding it", () => {
    const raw = rsvConfig();
    (raw.weightedTiers as Array<Record<string, unknown>>)[0].weight = 2.5;
    const { errors } = parseLotteryPolicyConfig(raw);
    expect(errors.some((e) => /weight must be a whole number/i.test(e))).toBe(true);

    const zeroed = rsvConfig();
    (zeroed.weightedTiers as Array<Record<string, unknown>>)[0].weight = 0;
    expect(parseLotteryPolicyConfig(zeroed).errors.some((e) => /whole number/i.test(e))).toBe(true);
  });

  it("rejects duplicate tier keys", () => {
    const raw = rsvConfig();
    (raw.weightedTiers as Array<Record<string, unknown>>)[1].key = "staff_child";
    const { errors } = parseLotteryPolicyConfig(raw);
    expect(errors.some((e) => /more than one tier with the key/i.test(e))).toBe(true);
  });

  it("rejects an acceptance window of zero days rather than defaulting it", () => {
    const raw = rsvConfig();
    raw.acceptanceWindowDays = 0;
    const { errors } = parseLotteryPolicyConfig(raw);
    expect(errors.some((e) => /acceptanceWindowDays/.test(e))).toBe(true);
  });

  it("rejects a waitlist offer window of zero days", () => {
    const raw = rsvConfig();
    raw.waitlistOfferWindow = { days: 0, cutoffTime: "16:00", note: "" };
    const { errors } = parseLotteryPolicyConfig(raw);
    expect(errors.some((e) => /waitlistOfferWindow\.days/.test(e))).toBe(true);
  });

  it("rejects a legacy preference outright", () => {
    const raw = rsvConfig();
    raw.legacyPreference = true;
    const { config, errors } = parseLotteryPolicyConfig(raw);
    expect(errors.some((e) => /legacyPreference cannot be true/i.test(e))).toBe(true);
    // And it is never carried through as true, whatever was stored.
    expect(config!.legacyPreference).toBe(false);
  });

  it("refuses to enable an optional tier without an authority citation", () => {
    const raw = rsvConfig();
    (raw.weightedTiers as Array<Record<string, unknown>>).push({
      key: "founders_children",
      label: "Founders' children",
      weight: 4,
      enabled: true,
      optional: true,
      source: { kind: "unavailable", field: "" },
      authorityNote: "",
    });
    const { errors } = parseLotteryPolicyConfig(raw);
    expect(errors.some((e) => /no authority citation/i.test(e))).toBe(true);
    expect(errors.some((e) => /Confirm with counsel before enabling/i.test(e))).toBe(true);
  });

  it("accepts the same optional tier once a citation is present", () => {
    const raw = rsvConfig();
    (raw.weightedTiers as Array<Record<string, unknown>>).push({
      key: "military_family",
      label: "Military family",
      weight: 2,
      enabled: true,
      optional: true,
      source: { kind: "application_column", field: "has_sibling_enrolled" },
      authorityNote: "RCW example citation, reviewed by counsel 2026-01-05.",
    });
    expect(parseLotteryPolicyConfig(raw).errors).toEqual([]);
  });

  it("refuses to enable an optional feature without an authority citation", () => {
    const raw = rsvConfig();
    (raw.optionalFeatures as Record<string, unknown>).boardMemberChildren = {
      enabled: true,
      weight: 3,
      authorityNote: "",
    };
    const { errors } = parseLotteryPolicyConfig(raw);
    expect(errors.some((e) => /Board member children/i.test(e))).toBe(true);
  });

  it("rejects an application column that is not on the allowlist", () => {
    const raw = rsvConfig();
    (raw.weightedTiers as Array<Record<string, unknown>>)[0].source = {
      kind: "application_column",
      field: "annual_income",
    };
    const { errors } = parseLotteryPolicyConfig(raw);
    expect(errors.some((e) => /not an allowed application column/i.test(e))).toBe(true);
  });

  it("rejects a cap outside 0 to 100 percent", () => {
    const raw = rsvConfig();
    (raw.weightedTiers as Array<Record<string, unknown>>)[0].capPercent = 140;
    expect(parseLotteryPolicyConfig(raw).errors.some((e) => /between 0 and 100/.test(e))).toBe(true);
  });

  it("rejects an enabled absolute preference with no authority citation", () => {
    const raw = rsvConfig();
    (raw.absolutePreferences as Array<Record<string, unknown>>)[0].authorityNote = "";
    const { errors } = parseLotteryPolicyConfig(raw);
    expect(errors.some((e) => /no authority citation/i.test(e))).toBe(true);
  });
});

describe("plain-English rendering", () => {
  it("states the no-legacy-preference rule explicitly, so it cannot be assumed either way", () => {
    const { config } = parseLotteryPolicyConfig(rsvConfig());
    const statements = renderPolicyStatements(config as LotteryPolicyConfig);
    const all = statements.flatMap((s) => s.lines).join(" ");
    expect(all).toMatch(/no legacy preference/i);
  });

  it("says weighted entries are not a guarantee", () => {
    const { config } = parseLotteryPolicyConfig(rsvConfig());
    const all = renderPolicyStatements(config!).flatMap((s) => s.lines).join(" ");
    expect(all).toMatch(/not a guarantee of a seat/i);
    expect(all).toMatch(/5 entries per applicant/);
    expect(all).toMatch(/3 entries per applicant/);
  });

  it("states that waitlists never carry over", () => {
    const { config } = parseLotteryPolicyConfig(rsvConfig());
    const all = renderPolicyStatements(config!).flatMap((s) => s.lines).join(" ");
    expect(all).toMatch(/never carry over/i);
  });

  it("names both required observers and the open meetings requirement", () => {
    const { config } = parseLotteryPolicyConfig(rsvConfig());
    const all = renderPolicyStatements(config!).flatMap((s) => s.lines).join(" ");
    expect(all).toMatch(/Board representative/);
    expect(all).toMatch(/Community partner representative/);
    expect(all).toMatch(/Open Public Meetings Act/);
    expect(all).toMatch(/Director of Operations/);
  });

  it("carries the McKinney-Vento protection into the rendered policy", () => {
    const { config } = parseLotteryPolicyConfig(rsvConfig());
    const all = renderPolicyStatements(config!).flatMap((s) => s.lines).join(" ");
    expect(all).toMatch(/never delayed/i);
  });
});

describe("governanceLabel", () => {
  it("names the policy, version, and adoption date", () => {
    expect(
      governanceLabel({ name: "RSV Enrollment Policy", version: 1, adopted_date: "2024-08-20" })
    ).toBe("RSV Enrollment Policy v1 (adopted 2024-08-20)");
  });

  it("says so plainly when there is no adopted policy", () => {
    expect(governanceLabel(null)).toBe("No adopted policy");
  });

  it("does not invent an adoption date when one is missing", () => {
    expect(governanceLabel({ name: "Draft", version: 2, adopted_date: null })).toBe("Draft v2");
  });
});
