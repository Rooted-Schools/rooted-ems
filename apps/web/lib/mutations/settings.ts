import { createServerClient } from "@rooted-ems/database/server";
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
    const supabase = await createServerClient();

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
    const supabase = await createServerClient();

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
  assigned_by: string; // user_profile.id of the assigning admin
}

export async function assignStaffRole(
  input: AssignStaffRoleInput
): Promise<MutationResult<{ id: string }>> {
  try {
    const supabase = await createServerClient();

    // Look up user_profile by email
    const { data: profile, error: profileError } = await supabase
      .from("user_profile")
      .select("id")
      .eq("email", input.user_email)
      .single();

    if (profileError || !profile) {
      return {
        data: null,
        error: `No user found with email "${input.user_email}". They must log in at least once first.`,
      };
    }

    // Mark as staff
    await supabase
      .from("user_profile")
      .update({ is_staff: true })
      .eq("id", profile.id);

    // Assign role
    const { data, error } = await supabase
      .from("user_campus_role")
      .upsert(
        {
          user_id: profile.id,
          campus_id: input.campus_id,
          role: input.role,
          assigned_by: input.assigned_by,
        },
        { onConflict: "user_id,campus_id,role" }
      )
      .select("id")
      .single();

    if (error) return { data: null, error: error.message };
    return { data: { id: data.id }, error: null };
  } catch (err) {
    return { data: null, error: "Failed to assign staff role" };
  }
}

export async function removeStaffRole(
  roleId: string
): Promise<MutationResult> {
  try {
    const supabase = await createServerClient();

    const { error } = await supabase
      .from("user_campus_role")
      .delete()
      .eq("id", roleId);

    if (error) return { data: null, error: error.message };
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: "Failed to remove staff role" };
  }
}

// ─── Packet Requirement Mutations ──────────────────────

export async function updatePacketRequirement(
  requirementId: string,
  updates: { is_active?: boolean; is_required?: boolean }
): Promise<MutationResult> {
  try {
    const supabase = await createServerClient();

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
    const supabase = await createServerClient();

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
