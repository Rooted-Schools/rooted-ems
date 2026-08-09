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

  it("falls back to Student grade when contact submitted when Mapped 2027 grade doesn't parse", () => {
    // The literal sample row has "14" in Mapped 2027 grade, which normGrade
    // rejects (out of 1-12 range) — this pins that exact real-world case.
    const row = realRow({ "Mapped 2027 grade": "14", "Student grade when contact submitted": "11" });
    const [result] = extractRows("crn_consolidated", REAL_HEADER, [row], "C.R. Neal Academy");
    expect(result.entry_grade).toBe("11");
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

  it("falls back to a sensible source_detail default when Lead Source is blank", () => {
    const row = realRow({ "Lead Source": "" });
    const [result] = extractRows("crn_consolidated", REAL_HEADER, [row], "C.R. Neal Academy");
    expect(result.source).toBe("other");
    expect(result.source_detail).toBe("CR Neal interest form");
  });

  it("combines Notes and Status into a single notes field", () => {
    const row = realRow({ Status: "Contacted", Notes: "Interested in fall cohort." });
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
