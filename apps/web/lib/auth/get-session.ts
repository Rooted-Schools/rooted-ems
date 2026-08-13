import { cache } from "react";
import { createServerClient } from "@rooted-ems/database/server";
import type { AuthSession, CampusRoleMap } from "@rooted-ems/types";
import { StaffRole } from "@rooted-ems/types";
import { redirect } from "next/navigation";

/**
 * Internal per-request cached session resolver.
 * React.cache deduplicates calls within a single RSC render tree,
 * so the Supabase getUser() round-trip fires at most once per request
 * even if getSession() is called from multiple server components.
 */
const getCachedSession = cache(async (): Promise<AuthSession | null> => {
  const supabase = await createServerClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  // Check if user is staff by querying user_profile
  const { data: profile } = await supabase
    .from("user_profile")
    .select("is_staff")
    .eq("id", user.id)
    .single();

  const isStaff = profile?.is_staff ?? false;

  // Build campus role map for staff users
  let campusRoles: CampusRoleMap = {};

  if (isStaff) {
    const { data: roles } = await supabase
      .from("user_campus_role")
      .select("campus_id, role")
      .eq("user_id", user.id);

    if (roles) {
      campusRoles = roles.reduce<CampusRoleMap>((acc, row) => {
        const campusId = row.campus_id as string;
        const role = row.role as StaffRole;
        if (!acc[campusId]) acc[campusId] = [];
        acc[campusId].push(role);
        return acc;
      }, {});
    }
  }

  return {
    user_id: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
    is_staff: isStaff,
    campus_roles: campusRoles,
  };
});

/**
 * Get the current auth session with campus role map.
 * Returns null if not authenticated.
 * Deduplicated per-request via React.cache.
 */
export async function getSession(): Promise<AuthSession | null> {
  return getCachedSession();
}

/**
 * Get the current session or redirect to login.
 * Use in server components/actions that require auth.
 */
export async function requireSession(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

/**
 * True when a staff session carries at least one user_campus_role row.
 *
 * Factored out of requireStaffSession so the rule can be tested as a pure
 * predicate. Zero rows means NO access — see requireStaffSession's note on
 * why that is the only safe reading.
 */
export function hasAnyCampusAccess(session: AuthSession): boolean {
  return Object.keys(session.campus_roles).length > 0;
}

/**
 * Require that the user is a staff member.
 * Unauthenticated users → /staff-login
 * Authenticated non-staff users → /login
 * Staff with zero campus roles → /staff-login?error=no_campus_access
 *
 * That last case is the fail-closed gate. Every provisioned staff account
 * holds at least one user_campus_role row, so a zero-row is_staff account is
 * always a half-provisioned or half-deprovisioned one: the role rows were
 * never written, or they were revoked and is_staff was left true. Around 29
 * campus-scoped queries treat an empty accessible-campus list as "unscoped,
 * so return everything", which turned that broken state into org-wide read
 * access. Denying at the door means those call sites can keep their empty ==
 * unscoped shortcut, because an empty map can no longer reach them.
 */
export async function requireStaffSession(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) {
    redirect("/staff-login");
  }
  if (!session.is_staff) {
    redirect("/login");
  }
  if (!hasAnyCampusAccess(session)) {
    redirect("/staff-login?error=no_campus_access");
  }
  return session;
}

/**
 * Get the list of campus IDs this staff user can access.
 *
 * Always the explicit campus list from user_campus_role, including for a
 * CMO-level admin (see isCMOAdmin) — the CMO holds real rows on every
 * campus, and the campus-scoped mutation guards (hasRoleOnCampus /
 * requireRoleOnCampus) can only authorize against real rows. Returning an
 * empty list for the CMO would read as "unscoped" to the ~29 queries that
 * branch on length === 0 while simultaneously stripping every mutation
 * permission, so the explicit list is both safer and more accurate.
 *
 * An empty list here means no access at all, not org-wide access;
 * requireStaffSession denies such a session before it can reach a query.
 */
export function getAccessibleCampusIds(session: AuthSession): string[] {
  return Object.keys(session.campus_roles);
}

/**
 * Check if user is a CMO-level admin (system_admin on 2+ campuses).
 * This is the app's single definition of org-wide access — hasNetworkAccess
 * and requireNetworkAccess both resolve to it.
 */
export function isCMOAdmin(session: AuthSession): boolean {
  const campusIds = Object.keys(session.campus_roles);
  if (campusIds.length < 2) return false;
  // Must have system_admin on at least 2 campuses
  const adminCount = campusIds.filter((id) =>
    session.campus_roles[id]?.includes("system_admin" as StaffRole)
  ).length;
  return adminCount >= 2;
}

/**
 * Filter a selected campus ID against accessible campuses.
 * Returns undefined if "all" or if the user has CMO-level access.
 * Returns the specific campus ID if user only has single-campus access.
 *
 * `lensCampusId` (see lib/campus-lens.ts) supplies the default when the
 * caller has no explicit `selectedCampusId` — the sidebar campus lens
 * becoming a page's default filter. It runs through the exact same
 * accessible-list check below as an explicit selection, so a stale or
 * tampered lens cookie can narrow what this returns but never widen it.
 */
export function resolveActiveCampus(
  session: AuthSession,
  selectedCampusId?: string,
  lensCampusId?: string | null
): string | undefined {
  const accessible = getAccessibleCampusIds(session);

  // Single-campus staff always see only their campus
  if (accessible.length === 1) return accessible[0];

  // Honor an explicit campus selection when provided: scoped staff can only
  // select campuses in their accessible list.
  //
  // The `accessible.length === 0` arm below is dead in practice — a staff
  // session with zero campus roles is now denied by requireStaffSession
  // before any page calls this. It is left in place deliberately: this
  // function is pure and exported, so a caller holding a raw AuthSession
  // still reaches it, and on that path the arm NARROWS the result to the
  // requested campus rather than falling through to "all campuses". Removing
  // it would widen, not tighten.
  if (selectedCampusId && selectedCampusId !== "all") {
    if (accessible.length === 0 || accessible.includes(selectedCampusId)) {
      return selectedCampusId;
    }
  }

  // No explicit selection: fall back to the campus lens default, same check.
  if (!selectedCampusId && lensCampusId) {
    if (accessible.length === 0 || accessible.includes(lensCampusId)) {
      return lensCampusId;
    }
  }

  return undefined; // "All campuses"
}

/* ------------------------------------------------------------------ */
/*  Role hierarchy helpers                                             */
/* ------------------------------------------------------------------ */
const ROLE_LEVEL: Record<string, number> = {
  compliance_auditor: 1,
  enrollment_staff: 2,
  enrollment_manager: 3,
  system_admin: 4,
};

/**
 * Returned by getHighestRole when the user holds no role this app knows how to
 * rank — either no campus role rows at all, or only roles added to the
 * staff_role enum without a level here. Level 0: below every gate.
 *
 * The rank must be opt-in. A role the app has never heard of (a future
 * recruiter tier, say) must not inherit the compliance_auditor floor just by
 * existing; adding it to ROLE_LEVEL is the deliberate act that grants access.
 */
export const NO_ROLE = "none";

/**
 * Compute the user's highest role across all assigned campuses.
 * Returns NO_ROLE when nothing rankable is assigned.
 */
export function getHighestRole(session: AuthSession): string {
  let best = NO_ROLE;
  let bestLevel = 0;
  for (const roles of Object.values(session.campus_roles)) {
    for (const r of roles) {
      const lvl = ROLE_LEVEL[r as string] ?? 0;
      if (lvl > bestLevel) {
        best = r as string;
        bestLevel = lvl;
      }
    }
  }
  return best;
}

/**
 * Check if the user meets a minimum role level (across any campus).
 */
export function hasMinRole(session: AuthSession, minRole: string): boolean {
  const requiredLevel = ROLE_LEVEL[minRole] ?? 0;
  const userLevel = ROLE_LEVEL[getHighestRole(session)] ?? 0;
  return userLevel >= requiredLevel;
}

/**
 * Require a minimum role level, or throw FORBIDDEN.
 */
export async function requireMinRole(minRole: string): Promise<AuthSession> {
  const session = await requireStaffSession();
  if (!hasMinRole(session, minRole)) {
    // Authenticated but insufficient role — ?denied=1 drives a quiet banner
    // on the Today page so the user gets an explanation, not a silent bounce.
    redirect("/staff/today?denied=1");
  }
  return session;
}

/**
 * Require CMO-level access (system_admin on 2+ campuses).
 */
export async function requireCMOAccess(): Promise<AuthSession> {
  const session = await requireStaffSession();
  if (!isCMOAdmin(session)) {
    redirect("/staff/today?denied=1"); // Authenticated but insufficient role
  }
  return session;
}

/**
 * Check if the user holds at least minRole on a SPECIFIC campus.
 *
 * This is NOT the same question as hasMinRole, which checks the caller's
 * highest role across ANY campus. A system_admin at Campus A is not a
 * system_admin at Campus B just because requireMinRole only ever looked at
 * their best role anywhere — that gap is what let a single-campus admin
 * mutate another campus's offers, lottery runs, and enrollments by supplying
 * that campus's record id. Every campus-scoped mutation must check the role
 * on the campus the RECORD actually belongs to, not the role gate on the
 * page that renders the button.
 */
export function hasRoleOnCampus(
  session: AuthSession,
  campusId: string | null | undefined,
  minRole: string
): boolean {
  if (!campusId) return false;
  const requiredLevel = ROLE_LEVEL[minRole] ?? 0;
  const roles = session.campus_roles[campusId] ?? [];
  let userLevel = 0;
  for (const r of roles) {
    const lvl = ROLE_LEVEL[r as string] ?? 0;
    if (lvl > userLevel) userLevel = lvl;
  }
  return userLevel >= requiredLevel;
}

/**
 * Require a minimum role level on a SPECIFIC campus, or redirect.
 *
 * Use this instead of requireMinRole for any server action that mutates a
 * campus-scoped record identified by a client-supplied id (offerId, runId,
 * enrollmentId, applicationId, rowId, ...). The caller must resolve the
 * record's real campus_id first (typically a service-role lookup by that
 * id) and pass it here — resolving from a client-supplied campusId argument
 * defeats the point, since that is exactly the value an attacker controls.
 */
export async function requireRoleOnCampus(
  campusId: string | null | undefined,
  minRole: string
): Promise<AuthSession> {
  const session = await requireStaffSession();
  if (!hasRoleOnCampus(session, campusId, minRole)) {
    // Same quiet-banner pattern as requireMinRole: authenticated but not
    // permitted on this campus, not a bounce to login.
    redirect("/staff/today?denied=1");
  }
  return session;
}

/**
 * True when a session reads as org-wide / CMO-level access.
 *
 * The convention, stated once for the whole app: org-wide / CMO access means
 * system_admin on 2 or more campuses (isCMOAdmin). Zero campus roles means NO
 * access, not org-wide access, and never reaches here — requireStaffSession
 * denies such a session at the door.
 *
 * This replaces an earlier reading in which zero user_campus_role rows was
 * taken as the org-wide signal. That was wrong in both directions. It denied
 * the actual CMO, who holds system_admin on every campus and therefore has
 * rows; and it granted everything to a half-provisioned or half-deprovisioned
 * account, which is exactly the shape that lands at zero rows.
 */
export function hasNetworkAccess(session: AuthSession): boolean {
  return isCMOAdmin(session);
}

/**
 * Require org-wide / CMO-level access (see hasNetworkAccess), or redirect.
 * Same quiet-banner pattern as requireMinRole / requireCMOAccess: an
 * authenticated, scoped staff member hitting a network-level page is not an
 * auth failure, just the wrong door — send them back to Today with the
 * banner rather than bouncing to login.
 */
export async function requireNetworkAccess(): Promise<AuthSession> {
  const session = await requireStaffSession();
  if (!hasNetworkAccess(session)) {
    redirect("/staff/today?denied=1");
  }
  return session;
}
