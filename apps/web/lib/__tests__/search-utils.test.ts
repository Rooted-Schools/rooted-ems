/**
 * Unit tests for the pure helpers behind the global staff search
 * (lib/search-utils.ts). These are exercised directly, with no Supabase
 * mock, precisely because they're the escaping/scoping decisions the search
 * action (app/staff/search/actions.ts) delegates to before any query runs —
 * a wrong answer here would either corrupt the PostgREST filter string or
 * silently scope a system_admin's search down to zero rows.
 */
import { describe, it, expect } from "vitest";
import {
  escapeLike,
  sanitizeForOrFilter,
  likePattern,
  digitsOf,
  scopesToCampuses,
  capitalizeWord,
} from "@/lib/search-utils";

describe("escapeLike", () => {
  it("escapes LIKE metacharacters so they match literally", () => {
    expect(escapeLike("50%_off")).toBe("50\\%\\_off");
  });

  it("escapes a literal backslash", () => {
    expect(escapeLike("a\\b")).toBe("a\\\\b");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeLike("Jordan Smith")).toBe("Jordan Smith");
  });
});

describe("sanitizeForOrFilter", () => {
  it("strips characters that would corrupt PostgREST's .or() grammar", () => {
    expect(sanitizeForOrFilter('smith, "or" (drop table)')).toBe("smith or drop table");
  });

  it("leaves a plain name unchanged", () => {
    expect(sanitizeForOrFilter("Maria Gonzalez")).toBe("Maria Gonzalez");
  });
});

describe("likePattern", () => {
  it("wraps a sanitized, escaped term in wildcards", () => {
    expect(likePattern("50%_off, (sale)")).toBe("%50\\%\\_off sale%");
  });
});

describe("digitsOf", () => {
  it("keeps only digits from a formatted phone number", () => {
    expect(digitsOf("(555) 123-4567")).toBe("5551234567");
  });

  it("returns an empty string when there are no digits", () => {
    expect(digitsOf("no digits here")).toBe("");
  });
});

describe("scopesToCampuses", () => {
  it("is false for an empty list — org-wide access, not zero campuses", () => {
    expect(scopesToCampuses([])).toBe(false);
  });

  it("is true once at least one campus id is present", () => {
    expect(scopesToCampuses(["campus-1"])).toBe(true);
  });
});

describe("capitalizeWord", () => {
  it("capitalizes the first letter and turns underscores into spaces", () => {
    expect(capitalizeWord("needs_info")).toBe("Needs info");
  });

  it("passes through null/undefined as null rather than throwing", () => {
    expect(capitalizeWord(null)).toBeNull();
    expect(capitalizeWord(undefined)).toBeNull();
  });
});
