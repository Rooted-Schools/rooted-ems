import { describe, it, expect, vi } from "vitest";
import type { AuthSession } from "@rooted-ems/types";

// get-session.ts wraps getSession() in React's cache() for RSC de-duping.
// Same stub as campus-authz.test.ts / network-access.test.ts: needed to
// import the module for its pure helpers outside a React render tree.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T,>(fn: T) => fn };
});

vi.mock("@rooted-ems/database/server", () => ({
  createServerClient: async () => ({}),
}));

const {
  hasNetworkAccess,
  isCMOAdmin,
  hasAnyCampusAccess,
  hasRoleOnCampus,
  hasMinRole,
  getHighestRole,
  getAccessibleCampusIds,
} = await import("@/lib/auth/get-session");

/**
 * The two CMO definitions in this app used to disagree. hasNetworkAccess
 * required ZERO user_campus_role rows; isCMOAdmin required system_admin on 2+
 * campuses. Every real staff account has at least one row, so the actual CMO
 * satisfied isCMOAdmin and was denied by hasNetworkAccess — locked out of the
 * one page built for the role. Meanwhile the zero-row state that
 * hasNetworkAccess did admit is unreachable for a healthy account and only
 * occurs when provisioning half-completed or deprovisioning half-completed.
 *
 * These tests pin the reconciled convention end to end: one CMO session must
 * pass every gate it needs, and the zero-row session must pass none.
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

// Shape of the production CMO account: system_admin on all three campuses.
const CMO_CAMPUSES = ["campus-crn", "campus-rsc", "campus-rsv"];
const cmo = session({
  "campus-crn": ["system_admin"],
  "campus-rsc": ["system_admin"],
  "campus-rsv": ["system_admin"],
});

describe("CMO session", () => {
  it("is recognized as a CMO admin", () => {
    expect(isCMOAdmin(cmo)).toBe(true);
  });

  it("passes the network-access gate", () => {
    expect(hasNetworkAccess(cmo)).toBe(true);
  });

  it("passes the requireMinRole('system_admin') check", () => {
    // requireMinRole delegates to hasMinRole over getHighestRole.
    expect(getHighestRole(cmo)).toBe("system_admin");
    expect(hasMinRole(cmo, "system_admin")).toBe(true);
  });

  it("passes hasRoleOnCampus on every campus it holds", () => {
    for (const campusId of CMO_CAMPUSES) {
      expect(hasRoleOnCampus(cmo, campusId, "system_admin")).toBe(true);
    }
  });

  it("keeps an explicit accessible-campus list rather than an empty one", () => {
    // Load-bearing: the campus-scoped mutation guards can only authorize
    // against real rows, so the CMO must not be represented as unscoped.
    expect(getAccessibleCampusIds(cmo).sort()).toEqual([...CMO_CAMPUSES].sort());
  });

  it("still fails hasRoleOnCampus for a campus it holds no role on", () => {
    expect(hasRoleOnCampus(cmo, "campus-unknown", "compliance_auditor")).toBe(false);
  });
});

describe("staff session with zero campus roles", () => {
  const orphan = session({});

  it("is denied by the requireStaffSession predicate", () => {
    // requireStaffSession redirects to /staff-login?error=no_campus_access
    // when this predicate is false. The redirect itself needs a request
    // context; the rule that drives it is pure and is what is asserted here.
    expect(hasAnyCampusAccess(orphan)).toBe(false);
  });

  it("is not a CMO and has no network access", () => {
    expect(isCMOAdmin(orphan)).toBe(false);
    expect(hasNetworkAccess(orphan)).toBe(false);
  });

  it("ranks below every role gate", () => {
    expect(hasMinRole(orphan, "compliance_auditor")).toBe(false);
  });
});

describe("scoped staff sessions", () => {
  it("admits a single-campus system_admin through the staff door", () => {
    const scoped = session({ "campus-crn": ["system_admin"] });

    expect(hasAnyCampusAccess(scoped)).toBe(true);
    // Through the door, but not to the network page.
    expect(hasNetworkAccess(scoped)).toBe(false);
  });

  it("admits an enrollment_manager on one campus", () => {
    const scoped = session({ "campus-rsc": ["enrollment_manager"] });

    expect(hasAnyCampusAccess(scoped)).toBe(true);
    expect(hasRoleOnCampus(scoped, "campus-rsc", "enrollment_manager")).toBe(true);
    expect(hasRoleOnCampus(scoped, "campus-crn", "enrollment_manager")).toBe(false);
  });
});
