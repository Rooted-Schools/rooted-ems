import { describe, it, expect, vi } from "vitest";
import type { AuthSession } from "@rooted-ems/types";

// get-session.ts wraps getSession() in React's cache() for RSC de-duping.
// That has no meaningful behavior outside an actual React render, and
// vitest's node environment doesn't provide one — stub it to identity so
// importing the module for its pure hasRoleOnCampus helper doesn't require
// a React render tree.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T,>(fn: T) => fn };
});

vi.mock("@rooted-ems/database/server", () => ({
  createServerClient: async () => ({}),
}));

const { hasRoleOnCampus } = await import("@/lib/auth/get-session");

/**
 * hasRoleOnCampus is the fix for the red-team finding that requireMinRole
 * checks the caller's HIGHEST role across ANY campus, not the role on the
 * specific campus a record belongs to. A system_admin at Campus A must not
 * be treated as authorized to mutate a Campus B record.
 */

// Roles arrive from the DB as plain strings whose values are exactly the
// StaffRole enum's values ("system_admin", etc.), so the cast at the boundary
// is faithful to the real runtime shape rather than papering over a mismatch.
function session(campusRoles: Record<string, string[]>): AuthSession {
  return {
    user_id: "u1",
    email: "u1@example.com",
    phone: null,
    is_staff: true,
    campus_roles: campusRoles as AuthSession["campus_roles"],
  };
}

describe("hasRoleOnCampus", () => {
  it("denies a system_admin at Campus A acting on Campus B", () => {
    const s = session({ "campus-a": ["system_admin"] });

    expect(hasRoleOnCampus(s, "campus-b", "enrollment_manager")).toBe(false);
  });

  it("allows a system_admin at Campus A acting on Campus A", () => {
    const s = session({ "campus-a": ["system_admin"] });

    expect(hasRoleOnCampus(s, "campus-a", "enrollment_manager")).toBe(true);
  });

  it("denies a role below the required level on the right campus", () => {
    const s = session({ "campus-a": ["enrollment_staff"] });

    expect(hasRoleOnCampus(s, "campus-a", "enrollment_manager")).toBe(false);
  });

  it("allows the exact required role on the right campus", () => {
    const s = session({ "campus-a": ["enrollment_manager"] });

    expect(hasRoleOnCampus(s, "campus-a", "enrollment_manager")).toBe(true);
  });

  it("uses the highest of multiple roles held on the same campus", () => {
    const s = session({ "campus-a": ["compliance_auditor", "enrollment_manager"] });

    expect(hasRoleOnCampus(s, "campus-a", "enrollment_manager")).toBe(true);
  });

  it("denies when campusId is missing (fail closed, never trust an unresolved record)", () => {
    const s = session({ "campus-a": ["system_admin"] });

    expect(hasRoleOnCampus(s, undefined, "compliance_auditor")).toBe(false);
    expect(hasRoleOnCampus(s, null, "compliance_auditor")).toBe(false);
  });

  it("denies a caller with no roles on the target campus at all", () => {
    const s = session({});

    expect(hasRoleOnCampus(s, "campus-a", "compliance_auditor")).toBe(false);
  });
});
