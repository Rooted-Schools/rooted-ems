import { describe, it, expect, vi } from "vitest";

// Only the pure templateScopeLabel helper is exercised here, but importing the
// query module pulls in the Supabase client helpers, which do not load under
// this runner. Stubbed to nothing — a test that reached one would be testing
// the wrong thing.
vi.mock("@rooted-ems/database/server", () => ({
  createServerClient: async () => ({}),
  createServiceRoleClient: () => ({}),
}));

import { templateScopeLabel } from "../queries/staff";

/**
 * A message_template row carries a campus_id: a real campus id belongs to that
 * campus, a null campus_id is a network-level template that mails from every
 * campus. The Templates list needs a human label for that scope so a
 * single-campus staffer can tell their own template from a network one.
 */
describe("templateScopeLabel", () => {
  it("returns the campus name for a campus-scoped template", () => {
    expect(templateScopeLabel("Rooted Schools Cleveland")).toBe("Rooted Schools Cleveland");
    expect(templateScopeLabel("C.R. Neal Academy")).toBe("C.R. Neal Academy");
  });

  it("returns 'All campuses' for a network-level template (null campus)", () => {
    expect(templateScopeLabel(null)).toBe("All campuses");
    expect(templateScopeLabel(undefined)).toBe("All campuses");
  });

  it("treats a blank or whitespace-only name as network-level", () => {
    expect(templateScopeLabel("")).toBe("All campuses");
    expect(templateScopeLabel("   ")).toBe("All campuses");
  });

  it("does not trim a real, non-blank campus name", () => {
    expect(templateScopeLabel("Rooted School Vancouver")).toBe("Rooted School Vancouver");
  });
});
