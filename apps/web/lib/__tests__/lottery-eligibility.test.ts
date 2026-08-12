/**
 * Turning applications into draw entries.
 *
 * The honesty contracts asserted here:
 *   - Only an EVIDENCED sibling relationship earns the absolute preference. A
 *     family's claim on the application is counted separately and given
 *     nothing until an enrollment record confirms it.
 *   - A weighted tier whose source field the application does not collect is
 *     reported as UNSOURCED, not as "zero applicants qualified".
 *   - Matching more than one weighted tier takes the highest weight, never the
 *     sum. Nobody gets a 15:1 advantage no board approved.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { supabaseMock } from "./helpers/supabase-mock";

vi.mock("@rooted-ems/database/server", async () => {
  const { supabaseMock } = await import("./helpers/supabase-mock");
  return {
    createServerClient: async () => supabaseMock.authClient(),
    createServiceRoleClient: () => supabaseMock.serviceClient(),
  };
});

import {
  deriveSiblingOfEnrolled,
  deriveLinkedSiblings,
  matchWeightedTiers,
  normalizeAnswer,
} from "@/lib/lottery-eligibility";
import type {
  LotteryPolicyAbsolutePreference,
  LotteryPolicyWeightedTier,
} from "@/lib/lottery-policy";

const SIBLING_PREFERENCE: LotteryPolicyAbsolutePreference = {
  key: "sibling_current_enrolled",
  label: "Sibling of a currently enrolled student",
  enabled: true,
  autoOfferBeforeDraw: true,
  overflowToPriorityWaitlist: true,
  siblingDefinition: "shared_legal_guardian",
  definition: "Shares a legal parent or guardian.",
  fosterExcludedUntilLegalGuardianship: true,
  verificationMayBeRequired: true,
  falseClaimForfeitsSeat: true,
  authorityNote: "RSV Board Enrollment Policy, revised 2024-08-20.",
};

function client() {
  return supabaseMock.serviceClient();
}

beforeEach(() => {
  supabaseMock.reset();
  vi.clearAllMocks();
});

// ─── Sibling of a currently enrolled student ───────────────────────────────

describe("deriveSiblingOfEnrolled — evidence, not claims", () => {
  /**
   * Queue the five reads the derivation makes, in order:
   *   application -> application_answer -> guardian_student (applicants)
   *   -> guardian_student (that guardian's other students) -> enrollment
   */
  function queueDerivation(options: {
    applications: Array<{ id: string; student_id: string; has_sibling_enrolled?: boolean }>;
    answers?: Array<{ application_id: string; value: unknown }>;
    applicantLinks: Array<{ student_id: string; guardian_id: string }>;
    guardianStudents: Array<{ guardian_id: string; student_id: string }>;
    activeEnrollments: Array<{ student_id: string }>;
    currentYears?: Array<{ id: string }>;
  }) {
    supabaseMock.queueResult("application", { data: options.applications, error: null });
    supabaseMock.queueResult("application_answer", { data: options.answers ?? [], error: null });
    supabaseMock.queueResult(
      "guardian_student",
      { data: options.applicantLinks, error: null },
      { data: options.guardianStudents, error: null }
    );
    supabaseMock.queueResult("school_year", {
      data: options.currentYears ?? [{ id: "year-2026" }],
      error: null,
    });
    supabaseMock.queueResult("enrollment", { data: options.activeEnrollments, error: null });
  }

  it("qualifies an applicant whose legal guardian has a student actively enrolled here", async () => {
    queueDerivation({
      applications: [{ id: "app-1", student_id: "stu-1" }],
      applicantLinks: [{ student_id: "stu-1", guardian_id: "g-1" }],
      guardianStudents: [
        { guardian_id: "g-1", student_id: "stu-1" },
        { guardian_id: "g-1", student_id: "stu-enrolled" },
      ],
      activeEnrollments: [{ student_id: "stu-enrolled" }],
    });

    const result = await deriveSiblingOfEnrolled(
      client(),
      ["app-1"],
      "campus-1",
      SIBLING_PREFERENCE
    );

    expect([...result.qualified]).toEqual(["app-1"]);
    expect(result.linkageUnresolvable).toBe(false);
    expect(result.method).toMatch(/shares a legal parent or guardian/i);
  });

  it("scopes the enrollment check to this campus and to active status", async () => {
    queueDerivation({
      applications: [{ id: "app-1", student_id: "stu-1" }],
      applicantLinks: [{ student_id: "stu-1", guardian_id: "g-1" }],
      guardianStudents: [
        { guardian_id: "g-1", student_id: "stu-1" },
        { guardian_id: "g-1", student_id: "stu-enrolled" },
      ],
      activeEnrollments: [{ student_id: "stu-enrolled" }],
    });

    await deriveSiblingOfEnrolled(client(), ["app-1"], "campus-1", SIBLING_PREFERENCE);

    const enrollmentRead = supabaseMock.ops.find((o) => o.table === "enrollment")!;
    const filters = enrollmentRead.filters.filter((f) => f.method === "eq").map((f) => f.args);
    expect(filters).toContainEqual(["campus_id", "campus-1"]);
    expect(filters).toContainEqual(["status", "active"]);
    const yearFilter = enrollmentRead.filters.find(
      (f) => f.method === "in" && f.args[0] === "school_year_id"
    );
    expect(yearFilter?.args[1]).toEqual(["year-2026"]);
  });

  it("only follows legal-guardian links, which is how the foster exclusion is enforced", async () => {
    queueDerivation({
      applications: [{ id: "app-1", student_id: "stu-1" }],
      applicantLinks: [{ student_id: "stu-1", guardian_id: "g-1" }],
      guardianStudents: [{ guardian_id: "g-1", student_id: "stu-1" }],
      activeEnrollments: [],
    });

    await deriveSiblingOfEnrolled(client(), ["app-1"], "campus-1", SIBLING_PREFERENCE);

    const links = supabaseMock.ops.filter((o) => o.table === "guardian_student");
    expect(links).toHaveLength(2);
    for (const read of links) {
      expect(read.filters.filter((f) => f.method === "eq").map((f) => f.args)).toContainEqual([
        "is_legal_guardian",
        true,
      ]);
    }
  });

  it("does not qualify an applicant whose only sibling is enrolled at a different campus", async () => {
    queueDerivation({
      applications: [{ id: "app-1", student_id: "stu-1", has_sibling_enrolled: true }],
      applicantLinks: [{ student_id: "stu-1", guardian_id: "g-1" }],
      guardianStudents: [
        { guardian_id: "g-1", student_id: "stu-1" },
        { guardian_id: "g-1", student_id: "stu-elsewhere" },
      ],
      activeEnrollments: [], // nothing active at THIS campus
    });

    const result = await deriveSiblingOfEnrolled(
      client(),
      ["app-1"],
      "campus-1",
      SIBLING_PREFERENCE
    );

    expect(result.qualified.size).toBe(0);
    // The claim is not thrown away either — it is surfaced as unverified.
    expect([...result.claimedUnverified]).toEqual(["app-1"]);
  });

  it("counts a family's own claim as unverified rather than honoring it", async () => {
    queueDerivation({
      applications: [{ id: "app-1", student_id: "stu-1" }],
      answers: [{ application_id: "app-1", value: "yes" }],
      applicantLinks: [{ student_id: "stu-1", guardian_id: "g-1" }],
      guardianStudents: [{ guardian_id: "g-1", student_id: "stu-1" }],
      activeEnrollments: [],
    });

    const result = await deriveSiblingOfEnrolled(
      client(),
      ["app-1"],
      "campus-1",
      SIBLING_PREFERENCE
    );

    expect(result.qualified.size).toBe(0);
    expect([...result.claimedUnverified]).toEqual(["app-1"]);
  });

  it("does not double-count a claim that turned out to be true", async () => {
    queueDerivation({
      applications: [{ id: "app-1", student_id: "stu-1", has_sibling_enrolled: true }],
      applicantLinks: [{ student_id: "stu-1", guardian_id: "g-1" }],
      guardianStudents: [
        { guardian_id: "g-1", student_id: "stu-1" },
        { guardian_id: "g-1", student_id: "stu-enrolled" },
      ],
      activeEnrollments: [{ student_id: "stu-enrolled" }],
    });

    const result = await deriveSiblingOfEnrolled(
      client(),
      ["app-1"],
      "campus-1",
      SIBLING_PREFERENCE
    );

    expect([...result.qualified]).toEqual(["app-1"]);
    expect(result.claimedUnverified.size).toBe(0);
  });

  it("reads the family form's answer from field_key, the column that actually exists", async () => {
    queueDerivation({
      applications: [{ id: "app-1", student_id: "stu-1" }],
      applicantLinks: [],
      guardianStudents: [],
      activeEnrollments: [],
    });

    await deriveSiblingOfEnrolled(client(), ["app-1"], "campus-1", SIBLING_PREFERENCE);

    const answerRead = supabaseMock.ops.find((o) => o.table === "application_answer")!;
    expect(answerRead.filters.filter((f) => f.method === "eq").map((f) => f.args)).toContainEqual([
      "field_key",
      "has_sibling_at_school",
    ]);
    // Not question_key, which has never existed on this table.
    expect(
      answerRead.filters.some((f) => f.method === "eq" && f.args[0] === "question_key")
    ).toBe(false);
  });

  it("reports linkage as unresolvable rather than as zero siblings when no guardian links exist", async () => {
    queueDerivation({
      applications: [{ id: "app-1", student_id: "stu-1" }],
      applicantLinks: [],
      guardianStudents: [],
      activeEnrollments: [],
    });

    const result = await deriveSiblingOfEnrolled(
      client(),
      ["app-1"],
      "campus-1",
      SIBLING_PREFERENCE
    );

    expect(result.linkageUnresolvable).toBe(true);
    expect(result.qualified.size).toBe(0);
  });

  it("says so honestly when no school year is flagged current", async () => {
    queueDerivation({
      applications: [{ id: "app-1", student_id: "stu-1" }],
      applicantLinks: [{ student_id: "stu-1", guardian_id: "g-1" }],
      guardianStudents: [
        { guardian_id: "g-1", student_id: "stu-1" },
        { guardian_id: "g-1", student_id: "stu-2" },
      ],
      activeEnrollments: [{ student_id: "stu-2" }],
      currentYears: [],
    });

    const result = await deriveSiblingOfEnrolled(
      client(),
      ["app-1"],
      "campus-1",
      SIBLING_PREFERENCE
    );

    expect(result.method).toMatch(/No school year is currently flagged as current/);
  });

  it("does nothing when the policy has no sibling preference enabled", async () => {
    supabaseMock.queueResult("application", {
      data: [{ id: "app-1", student_id: "stu-1", has_sibling_enrolled: true }],
      error: null,
    });
    supabaseMock.queueResult("application_answer", { data: [], error: null });

    const result = await deriveSiblingOfEnrolled(client(), ["app-1"], "campus-1", {
      ...SIBLING_PREFERENCE,
      enabled: false,
    });

    expect(result.qualified.size).toBe(0);
    expect(result.claimedUnverified.size).toBe(0);
    expect(supabaseMock.ops.some((o) => o.table === "enrollment")).toBe(false);
  });

  it("follows household linkage instead when the policy defines siblings that way", async () => {
    supabaseMock.queueResult("application", {
      data: [{ id: "app-1", student_id: "stu-1" }],
      error: null,
    });
    supabaseMock.queueResult("application_answer", { data: [], error: null });
    supabaseMock.queueResult(
      "student",
      { data: [{ id: "stu-1", household_id: "hh-1" }], error: null },
      {
        data: [
          { id: "stu-1", household_id: "hh-1" },
          { id: "stu-sib", household_id: "hh-1" },
        ],
        error: null,
      }
    );
    supabaseMock.queueResult("school_year", { data: [{ id: "year-2026" }], error: null });
    supabaseMock.queueResult("enrollment", { data: [{ student_id: "stu-sib" }], error: null });

    const result = await deriveSiblingOfEnrolled(client(), ["app-1"], "campus-1", {
      ...SIBLING_PREFERENCE,
      siblingDefinition: "shared_household",
    });

    expect([...result.qualified]).toEqual(["app-1"]);
    expect(result.method).toMatch(/shares a household/i);
    expect(supabaseMock.ops.some((o) => o.table === "guardian_student")).toBe(false);
  });
});

// ─── Linked siblings ───────────────────────────────────────────────────────

describe("deriveLinkedSiblings", () => {
  it("links two applications that share a legal guardian", () => {
    const linked = deriveLinkedSiblings(
      new Map([
        ["app-1", ["g-1"]],
        ["app-2", ["g-1"]],
      ])
    );
    expect(linked.get("app-1")).toEqual(["app-2"]);
    expect(linked.get("app-2")).toEqual(["app-1"]);
  });

  it("links a set of three, each to the other two", () => {
    const linked = deriveLinkedSiblings(
      new Map([
        ["app-1", ["g-1"]],
        ["app-2", ["g-1"]],
        ["app-3", ["g-1"]],
      ])
    );
    expect(linked.get("app-1")).toEqual(["app-2", "app-3"]);
    expect(linked.get("app-3")).toEqual(["app-1", "app-2"]);
  });

  it("does not link applications with no guardian in common", () => {
    const linked = deriveLinkedSiblings(
      new Map([
        ["app-1", ["g-1"]],
        ["app-2", ["g-2"]],
      ])
    );
    expect(linked.size).toBe(0);
  });

  it("returns a deterministic order, so the pull-in order never wobbles", () => {
    const forward = deriveLinkedSiblings(
      new Map([
        ["app-c", ["g-1"]],
        ["app-a", ["g-1"]],
        ["app-b", ["g-1"]],
      ])
    );
    expect(forward.get("app-a")).toEqual(["app-b", "app-c"]);
  });

  it("never links an application to itself", () => {
    const linked = deriveLinkedSiblings(new Map([["app-1", ["g-1", "g-2"]]]));
    expect(linked.size).toBe(0);
  });
});

// ─── Weighted tier matching ────────────────────────────────────────────────

describe("matchWeightedTiers", () => {
  const staffTier: LotteryPolicyWeightedTier = {
    key: "staff_child",
    label: "Child of contracted full-time staff",
    weight: 5,
    enabled: true,
    optional: false,
    source: { kind: "application_answer", field: "is_staff_child" },
    authorityNote: "RSV Board Enrollment Policy, revised 2024-08-20.",
  };

  const siblingColumnTier: LotteryPolicyWeightedTier = {
    key: "sibling_column",
    label: "Sibling declared on the application",
    weight: 3,
    enabled: true,
    optional: false,
    source: { kind: "application_column", field: "has_sibling_enrolled" },
    authorityNote: "Test citation.",
  };

  it("reports a tier as unsourced when the application does not collect its field", async () => {
    const result = await matchWeightedTiers(client(), ["app-1", "app-2"], [staffTier], 1);

    expect(result.unsourcedTierKeys).toEqual(["staff_child"]);
    expect(result.matchedCountByTier.get("staff_child")).toBe(0);
    // And crucially: no query was issued pretending to look for it.
    expect(supabaseMock.ops.some((o) => o.table === "application_answer")).toBe(false);
    // Everyone stays at the default weight.
    expect(result.weightByApplication.get("app-1")).toBe(1);
    expect(result.weightByApplication.get("app-2")).toBe(1);
  });

  it("matches an allowlisted application column", async () => {
    supabaseMock.queueResult("application", { data: [{ id: "app-1" }], error: null });

    const result = await matchWeightedTiers(
      client(),
      ["app-1", "app-2"],
      [siblingColumnTier],
      1
    );

    expect(result.unsourcedTierKeys).toEqual([]);
    expect(result.matchedCountByTier.get("sibling_column")).toBe(1);
    expect(result.weightByApplication.get("app-1")).toBe(3);
    expect(result.weightByApplication.get("app-2")).toBe(1);
    expect(result.tierKeysByApplication.get("app-1")).toEqual(["sibling_column"]);
  });

  it("matches a collected answer key, comparing values case-insensitively", async () => {
    const collectedTier: LotteryPolicyWeightedTier = {
      ...staffTier,
      key: "declared_sibling",
      source: { kind: "application_answer", field: "has_sibling_at_school" },
    };

    supabaseMock.queueResult("application_answer", {
      data: [
        { application_id: "app-1", value: "YES" },
        { application_id: "app-2", value: true },
        { application_id: "app-3", value: "no" },
      ],
      error: null,
    });

    const result = await matchWeightedTiers(
      client(),
      ["app-1", "app-2", "app-3"],
      [collectedTier],
      1
    );

    expect(result.matchedCountByTier.get("declared_sibling")).toBe(2);
    expect(result.weightByApplication.get("app-1")).toBe(5);
    expect(result.weightByApplication.get("app-2")).toBe(5);
    expect(result.weightByApplication.get("app-3")).toBe(1);
  });

  it("takes the highest matching weight rather than summing them", async () => {
    const columnFive: LotteryPolicyWeightedTier = { ...siblingColumnTier, key: "five", weight: 5 };
    const columnThree: LotteryPolicyWeightedTier = {
      ...siblingColumnTier,
      key: "three",
      weight: 3,
    };

    supabaseMock.queueResult(
      "application",
      { data: [{ id: "app-1" }], error: null },
      { data: [{ id: "app-1" }], error: null }
    );

    const result = await matchWeightedTiers(client(), ["app-1"], [columnFive, columnThree], 1);

    expect(result.weightByApplication.get("app-1")).toBe(5); // not 8
    expect(result.tierKeysByApplication.get("app-1")).toEqual(["five", "three"]);
  });

  it("rejects a column that is not on the allowlist rather than querying it", async () => {
    const result = await matchWeightedTiers(
      client(),
      ["app-1"],
      [
        {
          ...siblingColumnTier,
          key: "income",
          source: { kind: "application_column", field: "annual_income" },
        },
      ],
      1
    );

    expect(result.unsourcedTierKeys).toEqual(["income"]);
    expect(supabaseMock.ops.some((o) => o.table === "application")).toBe(false);
  });

  it("gives everyone the policy default weight when there are no tiers at all", async () => {
    const result = await matchWeightedTiers(client(), ["app-1", "app-2"], [], 1);
    expect(result.weightByApplication.get("app-1")).toBe(1);
    expect(result.weightByApplication.get("app-2")).toBe(1);
    expect(result.unsourcedTierKeys).toEqual([]);
  });
});

describe("normalizeAnswer", () => {
  it("round-trips the JSONB shapes the application forms actually store", () => {
    expect(normalizeAnswer(true)).toBe("true");
    expect(normalizeAnswer(false)).toBe("false");
    expect(normalizeAnswer("Yes")).toBe("yes");
    expect(normalizeAnswer("  TRUE  ")).toBe("true");
    expect(normalizeAnswer(null)).toBe("");
    expect(normalizeAnswer(undefined)).toBe("");
  });
});
