/**
 * CSV builder — escaping and formula-injection guard.
 */
import { describe, it, expect } from "vitest";
import { csvCell, buildCsv } from "@/lib/csv";

describe("csvCell", () => {
  it("passes plain values through unchanged", () => {
    expect(csvCell("Maria Lopez")).toBe("Maria Lopez");
  });

  it("handles null and undefined as empty strings", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes values containing commas, quotes, and newlines", () => {
    expect(csvCell("Lopez, Maria")).toBe('"Lopez, Maria"');
    expect(csvCell('She said "hi"')).toBe('"She said ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("guards against formula injection for = + - @ prefixes", () => {
    expect(csvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvCell("+1234567")).toBe("'+1234567");
    expect(csvCell("-cmd")).toBe("'-cmd");
    expect(csvCell("@import")).toBe("'@import");
  });

  it("applies both the formula guard and quoting when needed", () => {
    // Starts with = AND contains a comma → prefixed then quoted
    expect(csvCell("=HYPERLINK(a,b)")).toBe('"\'=HYPERLINK(a,b)"');
  });
});

describe("buildCsv", () => {
  it("joins header and rows with CRLF", () => {
    const csv = buildCsv(["Student", "Status"], [["Maria Lopez", "verified"]]);
    expect(csv).toBe("Student,Status\r\nMaria Lopez,verified");
  });
});
