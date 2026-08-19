import { describe, it, expect, vi } from "vitest";

// Only the pure validator is exercised here, but importing the module pulls
// in the Supabase client and the session guard, neither of which loads under
// this runner. Stubbed to nothing: a test that reached either one would be
// testing the wrong thing.
vi.mock("@rooted-ems/database/server", () => ({
  createServerClient: async () => ({}),
  createServiceRoleClient: () => ({}),
}));

vi.mock("@/lib/auth/get-session", () => ({
  requireRoleOnCampus: async () => ({ user_id: "test-user" }),
}));

import {
  splitBodyIntoParagraphs,
  applyInquiryMergeFields,
  inquiryWelcome,
  INQUIRY_WELCOME_DEFAULT_TEXT,
} from "../email-templates";
import {
  validateMessageOverride,
  MESSAGE_OVERRIDE_SUBJECT_MAX,
  MESSAGE_OVERRIDE_BODY_MAX,
} from "../mutations/message-overrides";

/**
 * A stored body is plain text; a blank line is what separates one paragraph
 * from the next. Everything a staff member can type into the settings
 * textarea has to land somewhere sensible, including the things a textarea
 * produces on its own (CRLF on Windows, a stray trailing newline).
 */
describe("splitBodyIntoParagraphs", () => {
  it("splits on a blank line", () => {
    expect(splitBodyIntoParagraphs("First paragraph.\n\nSecond paragraph.")).toEqual([
      "First paragraph.",
      "Second paragraph.",
    ]);
  });

  it("treats a single paragraph as one paragraph", () => {
    expect(splitBodyIntoParagraphs("Just the one thing to say.")).toEqual([
      "Just the one thing to say.",
    ]);
  });

  it("keeps a single newline inside a paragraph", () => {
    expect(splitBodyIntoParagraphs("Line one\nline two")).toEqual(["Line one\nline two"]);
  });

  it("collapses runs of more than one blank line", () => {
    expect(splitBodyIntoParagraphs("A.\n\n\n\nB.")).toEqual(["A.", "B."]);
  });

  it("treats a whitespace-only line as a blank line", () => {
    expect(splitBodyIntoParagraphs("A.\n   \nB.")).toEqual(["A.", "B."]);
  });

  it("splits CRLF the same way it splits LF", () => {
    expect(splitBodyIntoParagraphs("A.\r\n\r\nB.")).toEqual(["A.", "B."]);
  });

  it("handles a lone CR", () => {
    expect(splitBodyIntoParagraphs("A.\r\rB.")).toEqual(["A.", "B."]);
  });

  it("trims leading and trailing whitespace from each paragraph", () => {
    expect(splitBodyIntoParagraphs("  A.  \n\n  B.  \n")).toEqual(["A.", "B."]);
  });

  it("returns nothing for whitespace-only input", () => {
    expect(splitBodyIntoParagraphs("   \n\n  \n")).toEqual([]);
    expect(splitBodyIntoParagraphs("")).toEqual([]);
  });

  it("round-trips the built-in default text", () => {
    expect(splitBodyIntoParagraphs(INQUIRY_WELCOME_DEFAULT_TEXT.bodyEn)).toHaveLength(2);
    expect(splitBodyIntoParagraphs(INQUIRY_WELCOME_DEFAULT_TEXT.bodyEs)).toHaveLength(2);
  });
});

describe("applyInquiryMergeFields", () => {
  it("substitutes both fields", () => {
    expect(
      applyInquiryMergeFields("Hi {{first_name}}, welcome to {{campus_name}}.", {
        firstName: "Jordan",
        campusName: "Rooted School Vancouver",
      })
    ).toBe("Hi Jordan, welcome to Rooted School Vancouver.");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(applyInquiryMergeFields("{{ campus_name }}", { campusName: "Cleveland" })).toBe(
      "Cleveland"
    );
  });

  it("substitutes every occurrence", () => {
    expect(
      applyInquiryMergeFields("{{campus_name}} and {{campus_name}}", { campusName: "Neal" })
    ).toBe("Neal and Neal");
  });

  it("leaves an unknown token alone rather than blanking it", () => {
    expect(applyInquiryMergeFields("{{student_name}}", { campusName: "Neal" })).toBe(
      "{{student_name}}"
    );
  });

  it("substitutes an absent first name with nothing", () => {
    expect(applyInquiryMergeFields("Hi{{first_name}}.", { campusName: "Neal" })).toBe("Hi.");
  });
});

/**
 * The default text shown in the editor and the default actually sent are
 * built from the same literals, so a campus that has never customized the
 * message gets exactly what the editor promised it would get.
 */
describe("inquiryWelcome default text", () => {
  it("sends what the editor pre-fills, with the campus name substituted", () => {
    const campusName = "Rooted School Vancouver";
    const rendered = inquiryWelcome({ campusName });
    const expected = {
      subjectEn: applyInquiryMergeFields(INQUIRY_WELCOME_DEFAULT_TEXT.subjectEn, { campusName }),
      subjectEs: applyInquiryMergeFields(INQUIRY_WELCOME_DEFAULT_TEXT.subjectEs, { campusName }),
    };
    expect(rendered.subject).toBe(`${expected.subjectEn} / ${expected.subjectEs}`);

    for (const paragraph of splitBodyIntoParagraphs(
      applyInquiryMergeFields(INQUIRY_WELCOME_DEFAULT_TEXT.bodyEn, { campusName })
    )) {
      expect(rendered.text).toContain(paragraph);
    }
    for (const paragraph of splitBodyIntoParagraphs(
      applyInquiryMergeFields(INQUIRY_WELCOME_DEFAULT_TEXT.bodyEs, { campusName })
    )) {
      expect(rendered.text).toContain(paragraph);
    }
  });

  it("keeps the button, its link, and the closing when an override is applied", () => {
    const withOverride = inquiryWelcome({
      campusName: "Rooted Schools Cleveland",
      override: {
        subjectEn: "Come see us",
        subjectEs: "Venga a vernos",
        bodyEn: "One.\n\nTwo.",
        bodyEs: "Uno.\n\nDos.",
      },
    });
    expect(withOverride.subject).toBe("Come see us / Venga a vernos");
    expect(withOverride.text).toContain("One.");
    expect(withOverride.text).toContain("Dos.");
    expect(withOverride.html).toContain("Start an application");
    expect(withOverride.html).toContain("Iniciar una solicitud");
    expect(withOverride.text).toContain("Warmly, the Rooted Schools Enrollment Team");
    // The built-in copy is gone; only the frame around it survives.
    expect(withOverride.text).not.toContain("career-connected learning");
  });

  it("falls back to the built-in copy when an override is blank", () => {
    const campusName = "Rooted Schools Cleveland";
    const blank = inquiryWelcome({
      campusName,
      override: { subjectEn: "   ", subjectEs: "   ", bodyEn: "  \n\n ", bodyEs: "" },
    });
    expect(blank.subject).toBe(inquiryWelcome({ campusName }).subject);
    expect(blank.text).toBe(inquiryWelcome({ campusName }).text);
  });
});

describe("validateMessageOverride", () => {
  const valid = {
    subjectEn: "Great to meet you",
    subjectEs: "Un gusto conocerle",
    bodyEn: "First.\n\nSecond.",
    bodyEs: "Primero.\n\nSegundo.",
  };

  it("accepts valid input and returns trimmed column values", () => {
    const result = validateMessageOverride({
      ...valid,
      subjectEn: "  Great to meet you  ",
    });
    expect(result.error).toBeNull();
    expect(result.values).toEqual({
      subject_en: "Great to meet you",
      subject_es: valid.subjectEs,
      body_en: valid.bodyEn,
      body_es: valid.bodyEs,
    });
  });

  it("rejects an empty English subject", () => {
    const result = validateMessageOverride({ ...valid, subjectEn: "" });
    expect(result.values).toBeNull();
    expect(result.error).toContain("Subject (English)");
  });

  it("rejects a whitespace-only Spanish subject", () => {
    const result = validateMessageOverride({ ...valid, subjectEs: "   " });
    expect(result.values).toBeNull();
    expect(result.error).toContain("Subject (Spanish)");
  });

  it("rejects an empty English body", () => {
    const result = validateMessageOverride({ ...valid, bodyEn: "" });
    expect(result.values).toBeNull();
    expect(result.error).toContain("Body (English)");
  });

  // Spanish is required, not optional: an empty Spanish body would mail
  // Spanish-speaking families the English version.
  it("rejects an empty Spanish body", () => {
    const result = validateMessageOverride({ ...valid, bodyEs: "\n\n" });
    expect(result.values).toBeNull();
    expect(result.error).toContain("Body (Spanish)");
  });

  it("rejects a subject over the character limit", () => {
    const result = validateMessageOverride({
      ...valid,
      subjectEn: "x".repeat(MESSAGE_OVERRIDE_SUBJECT_MAX + 1),
    });
    expect(result.values).toBeNull();
    expect(result.error).toContain(String(MESSAGE_OVERRIDE_SUBJECT_MAX));
  });

  it("accepts a subject exactly at the character limit", () => {
    const result = validateMessageOverride({
      ...valid,
      subjectEn: "x".repeat(MESSAGE_OVERRIDE_SUBJECT_MAX),
    });
    expect(result.error).toBeNull();
  });

  it("rejects a body over the character limit", () => {
    const result = validateMessageOverride({
      ...valid,
      bodyEs: "x".repeat(MESSAGE_OVERRIDE_BODY_MAX + 1),
    });
    expect(result.values).toBeNull();
    expect(result.error).toContain(String(MESSAGE_OVERRIDE_BODY_MAX));
  });

  it("measures length after trimming, so trailing newlines do not push a body over", () => {
    const result = validateMessageOverride({
      ...valid,
      bodyEn: "x".repeat(MESSAGE_OVERRIDE_BODY_MAX) + "\n\n  ",
    });
    expect(result.error).toBeNull();
  });

  it("names the first bad field only, so the message says one thing to fix", () => {
    const result = validateMessageOverride({
      subjectEn: "",
      subjectEs: "",
      bodyEn: "",
      bodyEs: "",
    });
    expect(result.error).toContain("Subject (English)");
    expect(result.error).not.toContain("Body (Spanish)");
  });
});
