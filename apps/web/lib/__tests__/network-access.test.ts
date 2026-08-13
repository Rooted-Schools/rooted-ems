import { describe, it, expect, vi } from "vitest";
import type { AuthSession } from "@rooted-ems/types";

// get-session.ts wraps getSession() in React's cache() for RSC de-duping —
// same stub as campus-authz.test.ts, needed to import the module for its
// pure helpers outside an actual React render.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T,>(fn: T) => fn };
});

vi.mock("@rooted-ems/database/server", () => ({
  createServerClient: async () => ({}),
}));

const { hasNetworkAccess } = await import("@/lib/auth/get-session");

/**
 * hasNetworkAccess gates /staff/network and the sidebar's Network item.
 *
 * It used to read "zero campus_role rows = org-wide access". That was wrong
 * in both directions and these tests now pin the corrected convention:
 * org-wide / CMO access is system_admin on 2 or more campuses, and zero
 * campus roles is no access at all.
 */
function session(campusRoles: Record<string, string[]>): AuthSession {
  return {
    user_id: "u1",
    email: "u1@example.com",
    phone: null,
    is_staff: true,
    campus_roles: campusRoles as AuthSession["campus_roles"],
  };
}

describe("hasNetworkAccess", () => {
  it("grants a system_admin on two campuses", () => {
    expect(
      hasNetworkAccess(session({ "campus-a": ["system_admin"], "campus-b": ["system_admin"] }))
    ).toBe(true);
  });

  it("grants the real CMO: system_admin on all three campuses", () => {
    expect(
      hasNetworkAccess(
        session({
          "campus-a": ["system_admin"],
          "campus-b": ["system_admin"],
          "campus-c": ["system_admin"],
        })
      )
    ).toBe(true);
  });

  it("denies a session with zero campus_role rows", () => {
    // The half-provisioned / half-deprovisioned shape. Under the old reading
    // this was the one session that saw everything.
    expect(hasNetworkAccess(session({}))).toBe(false);
  });

  it("denies a system_admin scoped to exactly one campus", () => {
    expect(hasNetworkAccess(session({ "campus-a": ["system_admin"] }))).toBe(false);
  });

  it("denies a staff member on multiple campuses without system_admin on two", () => {
    expect(
      hasNetworkAccess(
        session({ "campus-a": ["enrollment_manager"], "campus-b": ["enrollment_staff"] })
      )
    ).toBe(false);
  });

  it("denies a system_admin on one campus who is merely staff on another", () => {
    // Breadth is not the test — two system_admin rows are.
    expect(
      hasNetworkAccess(
        session({ "campus-a": ["system_admin"], "campus-b": ["enrollment_manager"] })
      )
    ).toBe(false);
  });
});
