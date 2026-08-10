import { createServiceRoleClient } from "@rooted-ems/database/server";
import { requireMinRole } from "@/lib/auth/get-session";
import { AuditAction, logAuditEvent } from "@/lib/audit";
import type { MutationResult } from "./applications";

/** The real grade_level_code enum values (supabase/migrations/00001_enums.sql). */
export const GRADE_LEVEL_CODES = ["6", "7", "8", "9", "10", "11", "12"] as const;
export type GradeLevelCode = (typeof GRADE_LEVEL_CODES)[number];

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
  await requireMinRole("enrollment_manager");
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
  await requireMinRole("enrollment_manager");
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
  /**
   * The system_admin performing the grant. Server actions overwrite this with
   * the session user id before calling — a client-supplied value here is never
   * trusted, it would let a caller forge the audit trail on a privilege grant.
   */
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
  await requireMinRole("system_admin");
  try {
    const supabase = createServiceRoleClient();

    // Check if auth user already exists
    // NOTE: @supabase/auth-js@2.98.0 does not expose getUserByEmail on the admin API;
    // listUsers is the only available lookup. Upgrade to a newer SDK version to use
    // supabase.auth.admin.getUserByEmail() and eliminate this scan.
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
      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL is not configured");
      const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
        input.user_email,
        {
          redirectTo: `${appUrl}/staff/today`,
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
  await requireMinRole("system_admin");
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
  await requireMinRole("system_admin");
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
  await requireMinRole("enrollment_manager");
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
  await requireMinRole("enrollment_manager");
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

// ─── School Year Mutations ──────────────────────────────
//
// School-year setup used to require a developer running SQL by hand — the
// top operability gap flagged in the ops review. These mutations make a new
// enrollment cycle self-service for system_admin without giving that power
// to lower roles: requireMinRole is the actual enforcement boundary, the UI
// gate in settings-client.tsx is a courtesy that keeps lower roles from
// seeing controls they cannot use.
//
// Years are never deleted here — a school year anchors historical
// enrollment, application, and capacity data, so removing one would orphan
// records the compliance trail depends on. If a year was created in error,
// it stays in the list; nothing else points at it.

export interface CreateSchoolYearInput {
  name: string;
  start_date: string; // ISO date, e.g. "2028-08-01"
  end_date: string; // ISO date
  is_current: boolean;
}

export async function createSchoolYear(
  input: CreateSchoolYearInput
): Promise<MutationResult<{ id: string }>> {
  const session = await requireMinRole("system_admin");
  try {
    const name = input.name.trim();
    if (!name) return { data: null, error: "Name is required." };
    if (!input.start_date || !input.end_date) {
      return { data: null, error: "Start and end dates are required." };
    }
    if (new Date(input.end_date).getTime() <= new Date(input.start_date).getTime()) {
      return { data: null, error: "End date must be after start date." };
    }

    const supabase = createServiceRoleClient();

    // Case-insensitive dup check — the table has no unique constraint on
    // name, so this is the only thing standing between staff and two
    // "2028-29" rows that silently split enrollment windows across both.
    const { data: dup, error: dupError } = await supabase
      .from("school_year")
      .select("id")
      .ilike("name", name)
      .maybeSingle();
    if (dupError) return { data: null, error: dupError.message };
    if (dup) return { data: null, error: `A school year named "${name}" already exists.` };

    // Single-tenant system — one organization row anchors every school year.
    const { data: org, error: orgError } = await supabase
      .from("organization")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (orgError) return { data: null, error: orgError.message };
    if (!org) return { data: null, error: "No organization is configured. Contact a developer." };

    const { data, error } = await supabase
      .from("school_year")
      .insert({
        organization_id: org.id,
        name,
        start_date: input.start_date,
        end_date: input.end_date,
        is_current: input.is_current,
      })
      .select("id")
      .single();

    if (error) return { data: null, error: error.message };

    await logAuditEvent({
      table_name: "school_year",
      record_id: data.id,
      action: AuditAction.Create,
      actor_id: session.user_id,
      campus_id: null,
      new_data: { name, start_date: input.start_date, end_date: input.end_date, is_current: input.is_current },
    });

    return { data: { id: data.id }, error: null };
  } catch (err) {
    return { data: null, error: "Failed to create school year" };
  }
}

/**
 * Toggle a school year's is_current flag. Deliberately does not unset other
 * current years — RSF runs a recruiting year and an operating year current
 * at the same time, so "current" is not exclusive here.
 */
export async function updateSchoolYearCurrent(
  schoolYearId: string,
  isCurrent: boolean
): Promise<MutationResult> {
  const session = await requireMinRole("system_admin");
  try {
    const supabase = createServiceRoleClient();

    const { data: before } = await supabase
      .from("school_year")
      .select("is_current")
      .eq("id", schoolYearId)
      .single();

    const { error } = await supabase
      .from("school_year")
      .update({ is_current: isCurrent })
      .eq("id", schoolYearId);

    if (error) return { data: null, error: error.message };

    await logAuditEvent({
      table_name: "school_year",
      record_id: schoolYearId,
      action: AuditAction.StatusChange,
      actor_id: session.user_id,
      campus_id: null,
      old_data: before ? { is_current: before.is_current } : undefined,
      new_data: { is_current: isCurrent },
    });

    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: "Failed to update school year" };
  }
}

// ─── Grade Level Mutations ──────────────────────────────

export interface CreateGradeLevelInput {
  campus_id: string;
  school_year_id: string;
  /** grade_level_code enum values, e.g. ["6", "9"] */
  grades: string[];
}

export async function createGradeLevel(
  input: CreateGradeLevelInput
): Promise<MutationResult<{ inserted: number; skipped: string[] }>> {
  const session = await requireMinRole("system_admin");
  try {
    const requested = Array.from(new Set(input.grades)).filter((g) =>
      (GRADE_LEVEL_CODES as readonly string[]).includes(g)
    );
    if (requested.length === 0) {
      return { data: null, error: "Select at least one grade level." };
    }

    const supabase = createServiceRoleClient();

    // (campus_id, school_year_id, grade) is UNIQUE at the DB level — precheck
    // so the refusal is in plain English rather than a raw constraint error.
    const { data: existingRows, error: existingError } = await supabase
      .from("grade_level")
      .select("grade")
      .eq("campus_id", input.campus_id)
      .eq("school_year_id", input.school_year_id)
      .in("grade", requested);
    if (existingError) return { data: null, error: existingError.message };

    const existingGrades = new Set((existingRows ?? []).map((r) => r.grade as string));
    const toInsert = requested.filter((g) => !existingGrades.has(g));
    const skipped = requested.filter((g) => existingGrades.has(g));

    if (toInsert.length === 0) {
      return {
        data: null,
        error: `Grade${requested.length > 1 ? "s" : ""} ${requested.join(", ")} already ${
          requested.length > 1 ? "exist" : "exists"
        } for this campus and year.`,
      };
    }

    const { error } = await supabase.from("grade_level").insert(
      toInsert.map((grade) => ({
        campus_id: input.campus_id,
        school_year_id: input.school_year_id,
        grade,
      }))
    );

    if (error) return { data: null, error: error.message };

    await logAuditEvent({
      table_name: "grade_level",
      record_id: null,
      action: AuditAction.Create,
      actor_id: session.user_id,
      campus_id: input.campus_id,
      new_data: { school_year_id: input.school_year_id, grades: toInsert },
    });

    return { data: { inserted: toInsert.length, skipped }, error: null };
  } catch (err) {
    return { data: null, error: "Failed to add grade levels" };
  }
}

/**
 * Refuses honestly rather than deleting out from under live data: any
 * capacity plan or application referencing this grade level blocks the
 * delete, with a count so staff know exactly what's in the way.
 */
export async function deleteGradeLevel(gradeLevelId: string): Promise<MutationResult> {
  const session = await requireMinRole("system_admin");
  try {
    const supabase = createServiceRoleClient();

    const [
      { count: capacityCount, error: capError },
      { count: applicationCount, error: appError },
    ] = await Promise.all([
      supabase
        .from("capacity_plan")
        .select("id", { count: "exact", head: true })
        .eq("grade_level_id", gradeLevelId),
      supabase
        .from("application")
        .select("id", { count: "exact", head: true })
        .eq("grade_level_id", gradeLevelId),
    ]);

    if (capError) return { data: null, error: capError.message };
    if (appError) return { data: null, error: appError.message };

    if ((capacityCount ?? 0) > 0) {
      return {
        data: null,
        error: `Cannot delete: in use by ${capacityCount} capacity plan${capacityCount === 1 ? "" : "s"}.`,
      };
    }
    if ((applicationCount ?? 0) > 0) {
      return {
        data: null,
        error: `Cannot delete: in use by ${applicationCount} application${applicationCount === 1 ? "" : "s"}.`,
      };
    }

    const { data: gradeRow } = await supabase
      .from("grade_level")
      .select("campus_id, school_year_id, grade")
      .eq("id", gradeLevelId)
      .single();

    const { error } = await supabase.from("grade_level").delete().eq("id", gradeLevelId);
    if (error) {
      // Belt-and-suspenders: some other table (offer, waitlist, lottery
      // entry, reenrollment intent) still references this row via FK even
      // though the two checks above passed. Translate the raw constraint
      // violation into the same honest phrasing rather than a DB error code.
      if ((error as { code?: string }).code === "23503") {
        return { data: null, error: "Cannot delete: this grade level is still referenced by other records." };
      }
      return { data: null, error: error.message };
    }

    await logAuditEvent({
      table_name: "grade_level",
      record_id: gradeLevelId,
      action: AuditAction.Delete,
      actor_id: session.user_id,
      campus_id: gradeRow?.campus_id ?? null,
      old_data: gradeRow ?? undefined,
    });

    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: "Failed to delete grade level" };
  }
}

// ─── Capacity Plan Mutations ────────────────────────────

export interface CreateCapacityPlanInput {
  campus_id: string;
  grade_level_id: string;
  school_year_id: string;
  total_seats: number;
}

export async function createCapacityPlan(
  input: CreateCapacityPlanInput
): Promise<MutationResult<{ id: string }>> {
  const session = await requireMinRole("system_admin");
  try {
    if (!Number.isFinite(input.total_seats) || input.total_seats < 0) {
      return { data: null, error: "Total seats must be zero or a positive number." };
    }

    const supabase = createServiceRoleClient();

    // (campus_id, grade_level_id, school_year_id) is UNIQUE — precheck for
    // an honest error instead of surfacing the raw constraint violation.
    const { data: existing, error: existingError } = await supabase
      .from("capacity_plan")
      .select("id")
      .eq("campus_id", input.campus_id)
      .eq("grade_level_id", input.grade_level_id)
      .eq("school_year_id", input.school_year_id)
      .maybeSingle();
    if (existingError) return { data: null, error: existingError.message };
    if (existing) {
      return { data: null, error: "A capacity plan already exists for this campus, grade, and school year." };
    }

    const { data, error } = await supabase
      .from("capacity_plan")
      .insert({
        campus_id: input.campus_id,
        grade_level_id: input.grade_level_id,
        school_year_id: input.school_year_id,
        total_seats: Math.round(input.total_seats),
      })
      .select("id")
      .single();

    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return { data: null, error: "A capacity plan already exists for this campus, grade, and school year." };
      }
      return { data: null, error: error.message };
    }

    await logAuditEvent({
      table_name: "capacity_plan",
      record_id: data.id,
      action: AuditAction.Create,
      actor_id: session.user_id,
      campus_id: input.campus_id,
      new_data: {
        grade_level_id: input.grade_level_id,
        school_year_id: input.school_year_id,
        total_seats: Math.round(input.total_seats),
      },
    });

    return { data: { id: data.id }, error: null };
  } catch (err) {
    return { data: null, error: "Failed to create capacity plan" };
  }
}
