import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  INTEREST_FOCUS_OPTIONS,
  INTEREST_FOCUS_LABELS,
  isInterestFocusKey,
  scholarReference,
} from "../lead-interest-survey";
import { renderCampaignEmail } from "../email-templates";

/**
 * The one-question lead interest survey: a family answers from a public,
 * unauthenticated landing page reached by a tokenized link in the first
 * nurture email (see app/(public)/interest and 00067_lead_interest_survey.sql).
 * These tests pin the choice validation (an unknown answer must never be
 * written), the personalisation fallback the email and page both rely on
 * (only 9 of 1,316 C.R. Neal leads have a scholar name on file), and the
 * guarantee that the five option keys can never drift from the database's
 * CHECK constraint.
 */

describe("isInterestFocusKey", () => {
  it("accepts every real option key", () => {
    for (const o of INTEREST_FOCUS_OPTIONS) {
      expect(isInterestFocusKey(o.key)).toBe(true);
    }
  });

  it("rejects an unknown choice — the caller (page.tsx) gates every write behind this check, so a false here means nothing gets written", () => {
    expect(isInterestFocusKey("not_a_real_choice")).toBe(false);
    expect(isInterestFocusKey(undefined)).toBe(false);
    expect(isInterestFocusKey(null)).toBe(false);
    expect(isInterestFocusKey("")).toBe(false);
  });
});

describe("INTEREST_FOCUS_LABELS", () => {
  it("has a label for every option key, so a staff surface never falls back to the raw key", () => {
    for (const o of INTEREST_FOCUS_OPTIONS) {
      expect(INTEREST_FOCUS_LABELS[o.key]).toBe(o.label);
    }
  });
});

describe("scholarReference", () => {
  it("falls back to a natural phrase when no scholar name is on file", () => {
    expect(scholarReference(undefined)).toBe("your scholar");
    expect(scholarReference(null)).toBe("your scholar");
    expect(scholarReference("")).toBe("your scholar");
    expect(scholarReference("   ")).toBe("your scholar");
  });

  it("uses the scholar's name when present", () => {
    expect(scholarReference("Maya")).toBe("Maya");
    expect(scholarReference("  Maya  ")).toBe("Maya");
  });
});

describe("interest_focus key ↔ database CHECK constraint drift guard", () => {
  it("matches the allowed values in 00067_lead_interest_survey.sql exactly", () => {
    // Reads the actual migration text rather than a hand-copied list, so a
    // future edit to either side without the other fails this test instead
    // of silently rejecting writes in production. Vitest's cwd for this repo
    // is apps/web (see package.json "test": "vitest run" invoked from
    // apps/web per CLAUDE.md), so the migration lives two levels up.
    const migrationPath = resolve(process.cwd(), "../../supabase/migrations/00067_lead_interest_survey.sql");
    const sql = readFileSync(migrationPath, "utf8");
    const match = sql.match(/interest_focus IS NULL OR interest_focus IN \(([\s\S]*?)\)/);
    expect(match).not.toBeNull();
    const dbValues = match![1]
      .split(",")
      .map((s) => s.trim().replace(/^'|'$/g, ""))
      .filter(Boolean)
      .sort();
    const codeValues = INTEREST_FOCUS_OPTIONS.map((o) => o.key).sort();
    expect(dbValues).toEqual(codeValues);
  });
});

describe("renderCampaignEmail('interest_survey') personalisation", () => {
  const campusName = "C.R. Neal Academy";

  it("reads naturally when the scholar's first name is missing — the common case (9 of 1,316 leads have a name on file)", () => {
    const { html, text } = renderCampaignEmail(
      "interest_survey",
      { lastName: "Jenkins", surveyToken: "11111111-1111-1111-1111-111111111111" },
      campusName
    );
    expect(text).toContain("what matters most to your family for your scholar");
    expect(html).not.toMatch(/undefined/i);
    expect(html).not.toContain("{{");
    expect(html).not.toContain("for  .");
  });

  it("uses the scholar's first name when present", () => {
    const { text } = renderCampaignEmail(
      "interest_survey",
      { lastName: "Jenkins", studentFirstName: "Maya", surveyToken: "11111111-1111-1111-1111-111111111111" },
      campusName
    );
    expect(text).toContain("what matters most to your family for Maya");
    expect(text).not.toContain("your scholar");
  });

  it("renders all five options as links carrying the lead's own survey token", () => {
    const token = "22222222-2222-2222-2222-222222222222";
    const { html } = renderCampaignEmail("interest_survey", { lastName: "Diaz", surveyToken: token }, campusName);
    for (const o of INTEREST_FOCUS_OPTIONS) {
      expect(html).toContain(`/interest?t=${token}&c=${o.key}`);
      expect(html).toContain(o.label);
    }
  });

  it("falls back to a generic greeting when the family's last name is missing", () => {
    const { text } = renderCampaignEmail(
      "interest_survey",
      { surveyToken: "33333333-3333-3333-3333-333333333333" },
      campusName
    );
    expect(text).toContain("Hi there,");
    expect(text).not.toMatch(/undefined/i);
  });
});
