import { describe, it, expect, vi } from "vitest";

// extractRows is a pure function and never touches Supabase or the inquiry
// mutation — but lead-sync.ts imports createLeadFromInquiry at module scope,
// which transitively pulls in get-session.ts's React cache() wrapper. Mock
// the immediate dependency so this stays a fast, isolated unit test. (Mirrors
// the exact mocking approach in lead-sync-merge.test.ts.)
vi.mock("@rooted-ems/database/server", () => ({
  createServiceRoleClient: () => ({}),
}));
vi.mock("../mutations/leads", () => ({
  createLeadFromInquiry: vi.fn(),
}));

const { extractRows } = await import("../lead-sync");

/**
 * CR Neal's real spreadsheet doesn't have any of the four tabs the old
 * config listed ("Interest Form", "Scholarlead Interest Form", "Squarespace
 * Contacts", "Contact Form") — it has one real tab with its own column
 * shape. These tests pin the extraction logic for that real shape
 * (kind: "crn_consolidated") against the verified live header/sample row.
 */

const REAL_HEADER = [
  "Timestamp",
  "Parent/Guardian First Name",
  "Parent/Guardian Last Name",
  "Parent/Guardian Email",
  "Parent/Guardian Phone Number",
  "Secondary Parent/Guardian Name",
  "Secondary Parent/Guardian Email",
  "Secondary Parent/Guardian Phone",
  "ZipCode",
  "Student Name",
  "Student grade when contact submitted",
  "Lead Source",
  "Added Grade Levels (Based on Timestamp)",
  "Mapped 2027 grade",
  "Notes",
  "Status",
  "Included in volunteer contacts sheet?",
];

function realRow(overrides: Partial<Record<string, string>> = {}): string[] {
  const base: Record<string, string> = {
    Timestamp: "01/04/2025",
    "Parent/Guardian First Name": "Cre",
    "Parent/Guardian Last Name": "Branch",
    "Parent/Guardian Email": "lacretiab789@gmail.com",
    "Parent/Guardian Phone Number": "8036819263",
    "Secondary Parent/Guardian Name": "",
    "Secondary Parent/Guardian Email": "",
    "Secondary Parent/Guardian Phone": "",
    ZipCode: "29223",
    "Student Name": "",
    "Student grade when contact submitted": "11",
    "Lead Source": "Meta Advertisements",
    "Added Grade Levels (Based on Timestamp)": "3",
    "Mapped 2027 grade": "14",
    Notes: "",
    Status: "",
    "Included in volunteer contacts sheet?": "",
    ...overrides,
  };
  return REAL_HEADER.map((h) => base[h] ?? "");
}

describe("extractRows: crn_consolidated", () => {
  it("extracts email, name, phone, and zip from a real-shaped row", () => {
    const [result] = extractRows("crn_consolidated", REAL_HEADER, [realRow()], "C.R. Neal Academy");
    expect(result).toBeDefined();
    expect(result.email).toBe("lacretiab789@gmail.com");
    expect(result.first_name).toBe("Cre");
    expect(result.last_name).toBe("Branch");
    expect(result.phone).toBe("8036819263");
    expect(result.zip).toBe("29223");
  });

  it("prefers Mapped 2027 grade over Student grade when contact submitted", () => {
    const row = realRow({ "Mapped 2027 grade": "9", "Student grade when contact submitted": "6" });
    const [result] = extractRows("crn_consolidated", REAL_HEADER, [row], "C.R. Neal Academy");
    // "14" in the sample doesn't parse as a valid grade (normGrade caps at 12),
    // so use a valid mapped grade here to confirm the preference explicitly.
    expect(result.entry_grade).toBe("9");
  });

  it("falls back to Student grade when contact submitted when Mapped 2027 grade is blank", () => {
    const row = realRow({ "Mapped 2027 grade": "", "Student grade when contact submitted": "6" });
    const [result] = extractRows("crn_consolidated", REAL_HEADER, [row], "C.R. Neal Academy");
    expect(result.entry_grade).toBe("6");
  });

  it("does NOT fall back to the stale submitted grade when Mapped 2027 grade means graduated", () => {
    // A real distribution check against the live sheet found ~230 rows where
    // Mapped 2027 grade is 13/14/15 — not bad data, it means the student
    // will have already graduated by the 2027-28 cohort this pilot is
    // opening. Falling back to "Student grade when contact submitted" (e.g.
    // "11" from a submission years ago) would fabricate false currency —
    // the family would look like a live grade-11 prospect when the real
    // signal is "no longer eligible for this cycle." entry_grade must stay
    // honestly blank, with the reason surfaced in notes instead.
    const row = realRow({ "Mapped 2027 grade": "14", "Student grade when contact submitted": "11" });
    const [result] = extractRows("crn_consolidated", REAL_HEADER, [row], "C.R. Neal Academy");
    expect(result.entry_grade).toBeUndefined();
    expect(result.notes).toContain("graduated");
    expect(result.notes).toContain("14");
  });

  it("still falls back to the submitted grade for an ordinary unparseable (non-graduated) mapped value", () => {
    // Guards the distinction: only a plausible graduation-range number (>12)
    // suppresses the fallback. Genuine garbage in the mapped column (blank
    // handled separately below; this covers e.g. stray text) still falls
    // back to the best available data rather than losing the lead's grade
    // entirely.
    const row = realRow({ "Mapped 2027 grade": "n/a", "Student grade when contact submitted": "6" });
    const [result] = extractRows("crn_consolidated", REAL_HEADER, [row], "C.R. Neal Academy");
    expect(result.entry_grade).toBe("6");
  });

  it("marks source as ad and preserves the literal Lead Source text for Meta/Facebook/etc.", () => {
    for (const src of ["Meta Advertisements", "Facebook Ads", "Instagram Promo", "Google Search Ad", "Local ad campaign"]) {
      const row = realRow({ "Lead Source": src });
      const [result] = extractRows("crn_consolidated", REAL_HEADER, [row], "C.R. Neal Academy");
      expect(result.source).toBe("ad");
      expect(result.source_detail).toBe(src);
    }
  });

  it("marks source as other for a non-ad Lead Source and preserves the literal text", () => {
    const row = realRow({ "Lead Source": "Word of Mouth" });
    const [result] = extractRows("crn_consolidated", REAL_HEADER, [row], "C.R. Neal Academy");
    expect(result.source).toBe("other");
    expect(result.source_detail).toBe("Word of Mouth");
  });

  it("falls back to a campus-specific source_detail when Lead Source is blank", () => {
    const row = realRow({ "Lead Source": "" });
    const [result] = extractRows("crn_consolidated", REAL_HEADER, [row], "C.R. Neal Academy");
    expect(result.source).toBe("other");
    expect(result.source_detail).toBe("C.R. Neal Academy interest form");
  });

  it("uses the calling campus's name in the fallback — this shape is shared, not CR Neal-only", () => {
    // Cleveland moved onto the same consolidated column shape, so this
    // extraction case now runs for both campuses. A hardcoded school name in
    // the fallback would mislabel the other campus's leads.
    const row = realRow({ "Lead Source": "" });
    const [result] = extractRows("crn_consolidated", REAL_HEADER, [row], "Rooted Schools Cleveland");
    expect(result.source_detail).toBe("Rooted Schools Cleveland interest form");
  });

  it("combines Notes and Status into a single notes field", () => {
    // "Mapped 2027 grade" overridden away from the default sample's "14" so
    // the graduated-flag note (covered separately above) doesn't leak in.
    const row = realRow({ "Mapped 2027 grade": "9", Status: "Contacted", Notes: "Interested in fall cohort." });
    const [result] = extractRows("crn_consolidated", REAL_HEADER, [row], "C.R. Neal Academy");
    expect(result.notes).toBe("Status: Contacted\nInterested in fall cohort.");
  });

  it("drops a row with no email", () => {
    const row = realRow({ "Parent/Guardian Email": "" });
    const result = extractRows("crn_consolidated", REAL_HEADER, [row], "C.R. Neal Academy");
    expect(result).toHaveLength(0);
  });

  it("takes the first word of Student Name for student_first_name", () => {
    const row = realRow({ "Student Name": "Jordan Smith" });
    const [result] = extractRows("crn_consolidated", REAL_HEADER, [row], "C.R. Neal Academy");
    expect(result.student_first_name).toBe("Jordan");
  });

  it("parses the MM/DD/YYYY timestamp correctly", () => {
    const [result] = extractRows("crn_consolidated", REAL_HEADER, [realRow()], "C.R. Neal Academy");
    expect(result.submitted_at).not.toBeNull();
    expect(result.submitted_at!.getFullYear()).toBe(2025);
    expect(result.submitted_at!.getMonth()).toBe(0); // January
    expect(result.submitted_at!.getDate()).toBe(4);
  });
});
