import { createServerClient } from "@rooted-ems/database/server";
import type { AuthSession, CampusRoleMap } from "@rooted-ems/types";
import { StaffRole } from "@rooted-ems/types";

/**
 * Get the current auth session with campus role map.
 * Returns null if not authenticated.
 */
export async function getSession(): Promise<AuthSession | null> {
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
}

/**
 * Get the current session or throw a redirect.
 * Use in server components/actions that require auth.
 */
export async function requireSession(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

/**
 * Require that the user is a staff member.
 */
export async function requireStaffSession(): Promise<AuthSession> {
  const session = await requireSession();
  if (!session.is_staff) {
    throw new Error("FORBIDDEN");
  }
  return session;
}
