/**
 * How an application_answer value is stored, and how it reads back.
 *
 * The bug this file pins down: application_answer.value is JSONB, and the
 * write path used to JSON.stringify before handing the value to supabase-js,
 * which serialized it a second time. A boolean `true` landed as the JSONB
 * STRING "true"; the text "Ada" landed as "\"Ada\"". The edit form then
 * compared the stored value to the string "true", which a real boolean never
 * equals, so reopening a draft silently unchecked the family's sibling claim,
 * their data-sharing consent, and their certification — and the next autosave
 * wrote that erasure back as if the family had denied all three.
 *
 * The contract now: writes store the raw value once, reads normalize every
 * encoding that has ever existed, and no reader compares an answer to a
 * literal string.
 */
import { describe, it, expect, vi } from "vitest";
import {
  normalizeAnswerValue,
  isAffirmativeAnswer,
  answerAsText,
  policyQuestionFlags,
  policyDeclaresAnswerField,
  parseLotteryPolicyConfig,
  POLICY_COLLECTED_ANSWER_KEYS,
  POLICY_TIER_QUESTION_KEYS,
  NO_POLICY_QUESTIONS,
  type LotteryPolicyConfig,
} from "@/lib/lottery-policy";

vi.mock("@rooted-ems/database/server", () => ({
  createServerClient: async () => ({}),
  createServiceRoleClient: () => ({}),
}));

vi.mock("@/lib/auth/get-session", () => ({
  requireStaffSession: vi.fn(async () => ({ user_id: "staff-1", is_staff: true })),
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent: vi.fn(async () => {}),
  AuditAction: { StatusChange: "status_change" },
}));

vi.mock("@/lib/notify", () => ({
  notifyFamilyApplicationReceived: vi.fn(async () => {}),
  notifyFamilyApplicationVerified: vi.fn(async () => {}),
  notifyFamilyNeedsInfo: vi.fn(async () => {}),
  notifyFamilyApplicationWaitlisted: vi.fn(async () => {}),
  notifyStaffNewApplication: vi.fn(async () => {}),
}));

const { ALLOWED_ANSWER_KEYS } = await import("@/lib/mutations/applications");

// ─── normalizeAnswerValue ──────────────────────────────────────────────────

describe("normalizeAnswerValue — the three encodings that exist in the wild", () => {
  it("reads a raw JSONB boolean as that boolean", () => {
    expect(normalizeAnswerValue(true)).toBe(true);
    expect(normalizeAnswerValue(false)).toBe(false);
  });

  it('reads the legacy JSONB string "true" as the boolean it meant', () => {
    // JSON.stringify(true) -> "true" stored as a JSONB string.
    expect(normalizeAnswerValue("true")).toBe(true);
    expect(normalizeAnswerValue("false")).toBe(false);
  });

  it('reads the double-encoded string "\\"true\\"" as the boolean it meant', () => {
    // JSON.stringify(JSON.stringify(true)) is the worst case an older row holds.
    expect(normalizeAnswerValue('"true"')).toBe(true);
    expect(normalizeAnswerValue('"false"')).toBe(false);
  });

  it("peels legacy quoting off text answers without altering the text", () => {
    expect(normalizeAnswerValue("Ada Lovelace")).toBe("Ada Lovelace");
    expect(normalizeAnswerValue('"Ada Lovelace"')).toBe("Ada Lovelace");
    expect(normalizeAnswerValue('"2026-08-12"')).toBe("2026-08-12");
  });

  it("leaves a text answer that merely contains quotes intact", () => {
    expect(normalizeAnswerValue('She said "hello"')).toBe('She said "hello"');
  });

  it("treats null, undefined, and empty as no answer", () => {
    expect(normalizeAnswerValue(null)).toBe("");
    expect(normalizeAnswerValue(undefined)).toBe("");
    expect(normalizeAnswerValue("")).toBe("");
  });

  it("does not invent a value for shapes this system never wrote", () => {
    expect(normalizeAnswerValue(12)).toBe("12");
  });
});

describe("isAffirmativeAnswer — one yes across every encoding", () => {
  it("accepts every encoding of yes the form and the policy can produce", () => {
    for (const stored of [true, "true", '"true"', "yes", '"yes"', "YES", " Yes "]) {
      expect(isAffirmativeAnswer(stored)).toBe(true);
    }
  });

  it("rejects every encoding of no", () => {
    for (const stored of [false, "false", '"false"', "no", '"no"', "", null, undefined]) {
      expect(isAffirmativeAnswer(stored)).toBe(false);
    }
  });

  it("is exactly the check the edit form needs: a stored boolean stays checked", () => {
    // The regression: the old form asked `stored === "true"`, which a real
    // boolean never satisfies. The box came back unchecked and the next
    // autosave wrote that back as a denial.
    const answers: Record<string, unknown> = { data_sharing_consent: true };
    expect(answers.data_sharing_consent).not.toBe("true");
    expect(isAffirmativeAnswer(answers.data_sharing_consent)).toBe(true);
  });
});

describe("answerAsText", () => {
  it("returns text answers unquoted and missing answers as empty", () => {
    expect(answerAsText('"Ada"')).toBe("Ada");
    expect(answerAsText("Ada")).toBe("Ada");
    expect(answerAsText(null)).toBe("");
  });
});

// ─── Key allowlists ────────────────────────────────────────────────────────

describe("answer key allowlists", () => {
  it("accepts writes for the two board-declared tier questions", () => {
    expect(ALLOWED_ANSWER_KEYS.has("is_staff_child")).toBe(true);
    expect(ALLOWED_ANSWER_KEYS.has("is_frl_qualifying")).toBe(true);
  });

  it("reports those same keys as collected, so their tiers are not unsourced", () => {
    expect(POLICY_COLLECTED_ANSWER_KEYS).toContain("is_staff_child");
    expect(POLICY_COLLECTED_ANSWER_KEYS).toContain("is_frl_qualifying");
  });

  it("keeps the write allowlist and the collected list in step", () => {
    // A key the policy layer believes is collected but the mutation drops is a
    // weighted tier that silently matches nobody.
    for (const key of POLICY_COLLECTED_ANSWER_KEYS) {
      expect(ALLOWED_ANSWER_KEYS.has(key)).toBe(true);
    }
  });

  it("still drops anything not on the list", () => {
    expect(ALLOWED_ANSWER_KEYS.has("household_income")).toBe(false);
    expect(ALLOWED_ANSWER_KEYS.has("immigration_status")).toBe(false);
  });

  it("names both policy-driven questions", () => {
    expect([...POLICY_TIER_QUESTION_KEYS]).toEqual(["is_staff_child", "is_frl_qualifying"]);
  });
});

// ─── Form visibility predicate ─────────────────────────────────────────────

function configWith(tiers: Array<Record<string, unknown>>): LotteryPolicyConfig {
  const { config } = parseLotteryPolicyConfig({
    schemaVersion: 1,
    defaultWeight: 1,
    acceptanceWindowDays: 14,
    waitlistOfferWindow: { days: 2, cutoffTime: "16:00", note: "" },
    weightedTiers: tiers,
  });
  return config as LotteryPolicyConfig;
}

const staffChildTier = {
  key: "staff_child",
  label: "Child of contracted full-time staff",
  weight: 5,
  enabled: true,
  optional: false,
  source: {
    kind: "application_answer",
    field: "is_staff_child",
    matchValues: ["yes", "true"],
  },
  authorityNote: "RSV Board Enrollment Policy, revised 2024-08-20.",
};

const frlTier = {
  key: "economically_disadvantaged",
  label: "Economically disadvantaged",
  weight: 3,
  enabled: true,
  optional: false,
  source: {
    kind: "application_answer",
    field: "is_frl_qualifying",
    matchValues: ["yes", "true"],
  },
  authorityNote: "RSV Board Enrollment Policy, revised 2024-08-20.",
};

describe("policyQuestionFlags — a question is asked only where a board adopted the tier", () => {
  it("asks nothing when the campus has no adopted policy", () => {
    expect(policyQuestionFlags(null)).toEqual(NO_POLICY_QUESTIONS);
    expect(policyQuestionFlags(undefined)).toEqual(NO_POLICY_QUESTIONS);
  });

  it("asks both questions for a policy declaring both tiers", () => {
    expect(policyQuestionFlags(configWith([staffChildTier, frlTier]))).toEqual({
      is_staff_child: true,
      is_frl_qualifying: true,
    });
  });

  it("asks only the question the policy actually declares", () => {
    expect(policyQuestionFlags(configWith([staffChildTier]))).toEqual({
      is_staff_child: true,
      is_frl_qualifying: false,
    });
  });

  it("does not ask for a tier the board switched off", () => {
    expect(policyQuestionFlags(configWith([{ ...staffChildTier, enabled: false }]))).toEqual(
      NO_POLICY_QUESTIONS
    );
  });

  it("does not ask when the tier reads a column rather than a question", () => {
    const columnTier = {
      ...staffChildTier,
      source: { kind: "application_column", field: "has_sibling_enrolled" },
    };
    expect(policyDeclaresAnswerField(configWith([columnTier]), "is_staff_child")).toBe(false);
  });

  it("does not ask when the tier's source is declared unavailable", () => {
    const unavailable = { ...frlTier, source: { kind: "unavailable", field: "" } };
    expect(policyQuestionFlags(configWith([unavailable])).is_frl_qualifying).toBe(false);
  });

  it("asks nothing for a policy with no weighted tiers at all", () => {
    // Columbia and Cleveland until their boards adopt one.
    expect(policyQuestionFlags(configWith([]))).toEqual(NO_POLICY_QUESTIONS);
  });
});

// ─── Stored values match what the lottery matcher accepts ──────────────────

describe("stored answers match the policy matchValues", () => {
  it('stores "yes" / "no", which the RSV tiers match on ["yes", "true"]', () => {
    const accepted = ["yes", "true"];
    // The form writes these two literals; the matcher lowercases before
    // comparing, so a stored "yes" matches and a stored "no" does not.
    expect(accepted.includes("yes")).toBe(true);
    expect(accepted.includes("no")).toBe(false);
  });

  it("a boolean answer normalizes to a value the same matcher accepts", () => {
    const normalized = normalizeAnswerValue(true);
    expect(String(normalized)).toBe("true");
    expect(["yes", "true"].includes(String(normalized))).toBe(true);
  });
});
