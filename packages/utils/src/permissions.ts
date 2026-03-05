import { StaffRole } from "@rooted-ems/types";
import type { CampusRoleMap } from "@rooted-ems/types";

/**
 * Role hierarchy (higher index = more privilege).
 * system_admin > enrollment_manager > enrollment_staff > compliance_auditor
 */
const ROLE_HIERARCHY: StaffRole[] = [
  StaffRole.ComplianceAuditor,
  StaffRole.EnrollmentStaff,
  StaffRole.EnrollmentManager,
  StaffRole.SystemAdmin,
];

function roleLevel(role: StaffRole): number {
  return ROLE_HIERARCHY.indexOf(role);
}

/**
 * Check if the user has at least the given minimum role at a specific campus.
 */
export function hasMinimumRole(
  campusRoles: CampusRoleMap,
  campusId: string,
  minimumRole: StaffRole
): boolean {
  const roles = campusRoles[campusId];
  if (!roles || roles.length === 0) return false;

  const minLevel = roleLevel(minimumRole);
  return roles.some((r) => roleLevel(r) >= minLevel);
}

/**
 * Check if the user is a system_admin on any campus.
 */
export function isSystemAdmin(campusRoles: CampusRoleMap): boolean {
  return Object.values(campusRoles).some((roles) =>
    roles.includes(StaffRole.SystemAdmin)
  );
}

/**
 * Check if the user has any role at a specific campus.
 */
export function hasCampusAccess(
  campusRoles: CampusRoleMap,
  campusId: string
): boolean {
  const roles = campusRoles[campusId];
  return !!roles && roles.length > 0;
}

/**
 * Check if the user can manage applications at a campus.
 * Requires enrollment_staff or higher.
 */
export function canManageApplications(
  campusRoles: CampusRoleMap,
  campusId: string
): boolean {
  return hasMinimumRole(campusRoles, campusId, StaffRole.EnrollmentStaff);
}

/**
 * Check if the user can run lotteries at a campus.
 * Requires enrollment_manager or higher.
 */
export function canRunLottery(
  campusRoles: CampusRoleMap,
  campusId: string
): boolean {
  return hasMinimumRole(campusRoles, campusId, StaffRole.EnrollmentManager);
}

/**
 * Check if the user can manage users and roles.
 * Requires system_admin.
 */
export function canManageUsers(
  campusRoles: CampusRoleMap,
  campusId: string
): boolean {
  return hasMinimumRole(campusRoles, campusId, StaffRole.SystemAdmin);
}

/**
 * Get the highest role a user has at a specific campus.
 */
export function getHighestRole(
  campusRoles: CampusRoleMap,
  campusId: string
): StaffRole | null {
  const roles = campusRoles[campusId];
  if (!roles || roles.length === 0) return null;

  return roles.reduce((highest, current) =>
    roleLevel(current) > roleLevel(highest) ? current : highest
  );
}

/**
 * Get all campus IDs where the user has at least the given role.
 */
export function getCampusesWithRole(
  campusRoles: CampusRoleMap,
  minimumRole: StaffRole
): string[] {
  return Object.entries(campusRoles)
    .filter(([, roles]) => {
      const minLevel = roleLevel(minimumRole);
      return roles.some((r) => roleLevel(r) >= minLevel);
    })
    .map(([campusId]) => campusId);
}
