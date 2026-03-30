import { createServiceRoleClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";

// ─── Enrollment Window Mutations ────────────────────────

export interface CreateEnrollmentWindowInput {
  campus_id: string;
  school_year_id: string;
  name: string;
  open_date: string; // ISO date
  close_date: string; // ISO date
  status: "draft" | "open" | "closed" | "archived";
  description?: string;
}

export async function createEnrollmentWindow(
  input: CreateEnrollmentWindowInput
): Promise<MutationResult<{ id: string }>> {
  try {
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from("enrollment_window")
      .insert({
        campus_id: input.campus_id,
        school_year_id: input.school_year_id,
        name: input.name,
        open_date: input.open_date,
        close_date: input.close_date,
        status: input.status,
        description: input.description ?? null,
      })
      .select("id")
      .single();

    if (error) return { data: null, error: error.message };
    return { data: { id: data.id }, error: null };
  } catch (err) {
    return { data: null, error: "Failed to create enrollment window" };
  }
}

export async function updateEnrollmentWindowStatus(
  windowId: string,
  status: "draft" | "open" | "closed" | "archived"
): Promise<MutationResult> {
  try {
    const supabase = createServiceRoleClient();

    const { error } = await supabase
      .from("enrollment_window")
      .update({ status })
      .eq("id", windowId);

    if (error) return { data: null, error: error.message };
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: "Failed to update enrollment window status" };
  }
}

// ─── Staff User Role Mutations ──────────────────────────

export interface AssignStaffRoleInput {
  user_email: string;
  campus_id: string;
  role: "system_admin" | "enrollment_manager" | "enrollment_staff" | "compliance_auditor";
  assigned_by: string;
}

/**
 * Invite a staff user by email. Creates the auth user (sends invite email),
 * creates their user_profile as staff, and assigns their campus role —
 * all before they ever log in.
 */
export async function assignStaffRole(
  input: AssignStaffRoleInput
): Promise<MutationResult<{ id: string; invited: boolean }>> {
  try {
    const supabase = createServiceRoleClient();

    // Check if auth user already exists
    const { data: existingList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const existingAuthUser = existingList?.users?.find(
      (u) => u.email?.toLowerCase() === input.user_email.toLowerCase()
    );

    let authUserId: string;
    let invited = false;

    if (existingAuthUser) {
      authUserId = existingAuthUser.id;
    } else {
      // Invite via Supabase Auth — creates user + sends invite email
      const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
        input.user_email,
        {
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/staff/dashboard`,
        }
      );
      if (inviteError) return { data: null, error: inviteError.message };
      authUserId = inviteData.user.id;
      invited = true;
    }

    // Ensure user_profile exists and is flagged as staff
    await supabase.from("user_profile").upsert(
      { id: authUserId, email: input.user_email, is_staff: true },
      { onConflict: "id" }
    );

    // Assign campus role
    const { data, error } = await supabase
      .from("user_campus_role")
      .upsert(
        {
          user_id: authUserId,
          campus_id: input.campus_id,
          role: input.role,
          assigned_by: input.assigned_by,
        },
        { onConflict: "user_id,campus_id,role" }
      )
      .select("id")
      .single();

    if (error) return { data: null, error: error.message };
    return { data: { id: data.id, invited }, error: null };
  } catch (err) {
    return { data: null, error: "Failed to invite staff user" };
  }
}

export async function editStaffRole(
  roleId: string,
  updates: { role?: string; campus_id?: string }
): Promise<MutationResult> {
  try {
    const supabase = createServiceRoleClient();

    const { error } = await supabase
      .from("user_campus_role")
      .update(updates)
      .eq("id", roleId);

    if (error) return { data: null, error: error.message };
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: "Failed to update staff role" };
  }
}

export async function removeStaffRole(roleId: string): Promise<MutationResult> {
  try {
    const supabase = createServiceRoleClient();

    // Grab the user_id before deleting
    const { data: roleRow } = await supabase
      .from("user_campus_role")
      .select("user_id")
      .eq("id", roleId)
      .single();

    const { error } = await supabase
      .from("user_campus_role")
      .delete()
      .eq("id", roleId);

    if (error) return { data: null, error: error.message };

    // If user has no remaining roles, remove staff flag
    if (roleRow?.user_id) {
      const { data: remaining } = await supabase
        .from("user_campus_role")
        .select("id")
        .eq("user_id", roleRow.user_id);

      if (!remaining || remaining.length === 0) {
        await supabase
          .from("user_profile")
          .update({ is_staff: false })
          .eq("id", roleRow.user_id);
      }
    }

    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: "Failed to remove staff user" };
  }
}

// ─── Packet Requirement Mutations ──────────────────────

export async function updatePacketRequirement(
  requirementId: string,
  updates: { is_active?: boolean; is_required?: boolean }
): Promise<MutationResult> {
  try {
    const supabase = createServiceRoleClient();

    const { error } = await supabase
      .from("packet_requirement")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requirementId);

    if (error) return { data: null, error: error.message };
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: "Failed to update packet requirement" };
  }
}

export async function bulkUpdatePacketRequirements(
  requirementIds: string[],
  updates: { is_active?: boolean; is_required?: boolean }
): Promise<MutationResult> {
  try {
    const supabase = createServiceRoleClient();

    const { error } = await supabase
      .from("packet_requirement")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .in("id", requirementIds);

    if (error) return { data: null, error: error.message };
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: "Failed to update packet requirements" };
  }
}
