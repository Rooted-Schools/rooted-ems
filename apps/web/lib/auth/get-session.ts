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
 * Require that the user is a staff member.
 * Unauthenticated users → /staff-login
 * Authenticated non-staff users → /login
 */
export async function requireStaffSession(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) {
    redirect("/staff-login");
  }
  if (!session.is_staff) {
    redirect("/login");
  }
  return session;
}

/**
 * Get the list of campus IDs this staff user can access.
 * CMO / system_admin users with 3+ campus roles see all.
 * School-level staff see only their assigned campus(es).
 */
export function getAccessibleCampusIds(session: AuthSession): string[] {
  return Object.keys(session.campus_roles);
}

/**
 * Check if user is a CMO-level admin (system_admin on 2+ campuses).
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
 */
export function resolveActiveCampus(
  session: AuthSession,
  selectedCampusId?: string
): string | undefined {
  const accessible = getAccessibleCampusIds(session);

  // Single-campus staff always see only their campus
  if (accessible.length === 1) return accessible[0];

  // Honor an explicit campus selection when provided
  if (selectedCampusId && selectedCampusId !== "all") {
    // Global/CMO admin with no explicit role assignments can access any campus;
    // scoped staff can only select campuses in their accessible list.
    if (accessible.length === 0 || accessible.includes(selectedCampusId)) {
      return selectedCampusId;
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
 * Compute the user's highest role across all assigned campuses.
 */
export function getHighestRole(session: AuthSession): string {
  let best = "compliance_auditor";
  let bestLevel = 1;
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
    redirect("/staff/dashboard"); // Authenticated but insufficient role
  }
  return session;
}

/**
 * Require CMO-level access (system_admin on 2+ campuses).
 */
export async function requireCMOAccess(): Promise<AuthSession> {
  const session = await requireStaffSession();
  if (!isCMOAdmin(session)) {
    redirect("/staff/dashboard"); // Authenticated but insufficient role
  }
  return session;
}
