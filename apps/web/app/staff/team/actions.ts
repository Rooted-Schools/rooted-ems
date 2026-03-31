"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { requireMinRole } from "@/lib/auth/get-session";

const VALID_ROLES = ["compliance_auditor", "enrollment_staff", "enrollment_manager", "system_admin"];

// ─── Add a new staff member ───────────────────────────────────────────────────
// Looks up the user's UUID from Supabase Auth by email, then provisions
// user_profile (is_staff = true) and campus role assignments.
// The person must have signed in at least once — OAuth creates their auth entry
// on first login even if they hit the "not_staff" wall.

export async function addTeamMember(
  email: string,
  campusAssignments: { campusId: string; role: string }[]
): Promise<{ error: string | null }> {
  await requireMinRole("system_admin");

  if (!email || campusAssignments.length === 0) {
    return { error: "Email and at least one campus assignment are required." };
  }

  const invalidRole = campusAssignments.find((a) => !VALID_ROLES.includes(a.role));
  if (invalidRole) return { error: `Invalid role: ${invalidRole.role}` };

  const supabase = createServiceRoleClient();

  // ── Look up the user's UUID from Supabase Auth ──
  // listUsers has no email filter so we page through until we find the match.
  let userId: string | null = null;
  let page = 1;
  const perPage = 100;

  while (!userId) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) return { error: "Failed to query auth users: " + error.message };
    if (!data?.users?.length) break;

    const match = data.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (match) {
      userId = match.id;
      break;
    }
    if (data.users.length < perPage) break; // last page
    page++;
  }

  if (!userId) {
    return {
      error:
        "No account found for this email. Ask them to visit the staff login page and sign in with Google first — even if they get an error, that creates their account. Then try adding them again.",
    };
  }

  // ── Upsert user_profile with is_staff = true ──
  const { error: profileError } = await supabase
    .from("user_profile")
    .upsert({ id: userId, email: email.toLowerCase(), is_staff: true }, { onConflict: "id" });

  if (profileError) return { error: "Failed to create staff profile: " + profileError.message };

  // ── Insert campus role assignments ──
  const rows = campusAssignments.map(({ campusId, role }) => ({
    user_id: userId as string,
    campus_id: campusId,
    role,
  }));

  const { error: roleError } = await supabase
    .from("user_campus_role")
    .upsert(rows, { onConflict: "user_id,campus_id,role", ignoreDuplicates: true });

  if (roleError) return { error: "Failed to assign campus roles: " + roleError.message };

  revalidatePath("/staff/team");
  return { error: null };
}

// ─── Update a single campus-role row ──────────────────────────────────────────

export async function updateTeamMemberRole(
  rowId: string,
  newRole: string
): Promise<{ error: string | null }> {
  await requireMinRole("system_admin");

  if (!VALID_ROLES.includes(newRole)) return { error: `Invalid role: ${newRole}` };

  const supabase = createServiceRoleClient();

  // Check for duplicate (user_id + campus_id + role must be unique)
  const { data: existing } = await supabase
    .from("user_campus_role")
    .select("user_id, campus_id")
    .eq("id", rowId)
    .single();

  if (existing) {
    const { data: dup } = await supabase
      .from("user_campus_role")
      .select("id")
      .eq("user_id", existing.user_id)
      .eq("campus_id", existing.campus_id)
      .eq("role", newRole)
      .neq("id", rowId)
      .single();

    if (dup) return { error: "This person already has that role on this campus." };
  }

  const { error } = await supabase
    .from("user_campus_role")
    .update({ role: newRole, updated_at: new Date().toISOString() })
    .eq("id", rowId);

  if (error) return { error: error.message };

  revalidatePath("/staff/team");
  return { error: null };
}

// ─── Remove a campus assignment from a staff member ───────────────────────────
// If it was their last campus, sets is_staff = false on user_profile.

export async function removeCampusFromMember(
  rowId: string,
  userId: string
): Promise<{ error: string | null }> {
  await requireMinRole("system_admin");

  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from("user_campus_role")
    .delete()
    .eq("id", rowId);

  if (error) return { error: error.message };

  // If no campus roles remain, revoke staff status
  const { count } = await supabase
    .from("user_campus_role")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (count === 0) {
    await supabase
      .from("user_profile")
      .update({ is_staff: false, updated_at: new Date().toISOString() })
      .eq("id", userId);
  }

  revalidatePath("/staff/team");
  return { error: null };
}
