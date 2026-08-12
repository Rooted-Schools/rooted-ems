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
 * hasNetworkAccess gates /staff/network. The convention it relies on
 * (zero campus_role rows = org-wide/CMO access) is already load-bearing
 * across app/staff/{today,pipeline,recruitment,applications,equity,funnel}
 * — those pages all bypass their campus filter on
 * `accessibleIds.length === 0`. This pins the same read for the network
 * page's gate, including the case a naive "highest role" check would get
 * wrong: a system_admin scoped to exactly one campus is NOT network-wide.
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
  it("grants access to a session with zero campus_role rows", () => {
    expect(hasNetworkAccess(session({}))).toBe(true);
  });

  it("denies a system_admin scoped to exactly one campus", () => {
    expect(hasNetworkAccess(session({ "campus-a": ["system_admin"] }))).toBe(false);
  });

  it("denies a staff member scoped to multiple campuses", () => {
    expect(
      hasNetworkAccess(session({ "campus-a": ["enrollment_manager"], "campus-b": ["enrollment_staff"] }))
    ).toBe(false);
  });
});
