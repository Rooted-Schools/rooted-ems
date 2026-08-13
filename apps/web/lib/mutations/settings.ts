import { createServiceRoleClient } from "@rooted-ems/database/server";
import { requireMinRole, requireRoleOnCampus } from "@/lib/auth/get-session";
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

export interface UpdateEnrollmentWindowInput {
  name: string;
  open_date: string; // ISO date
  close_date: string; // ISO date
}

/**
 * Edits an existing window's name and dates. Status is deliberately out of
 * scope here — that stays on updateEnrollmentWindowStatus above, which the
 * client gates behind a confirmation when the transition is to "open".
 * The DB also enforces close_date > open_date (window_dates_check,
 * 00004_applications.sql); this validates first so the caller gets an
 * honest message instead of a raw constraint violation.
 */
export async function updateEnrollmentWindow(
  windowId: string,
  input: UpdateEnrollmentWindowInput
): Promise<MutationResult> {
  const session = await requireMinRole("enrollment_manager");
  try {
    const name = input.name.trim();
    if (!name) return { data: null, error: "Name is required." };
    if (!input.open_date || !input.close_date) {
      return { data: null, error: "Open and close dates are required." };
    }
    if (new Date(input.close_date).getTime() <= new Date(input.open_date).getTime()) {
      return { data: null, error: "Close date must be after open date." };
    }

    const supabase = createServiceRoleClient();

    const { data: before, error: beforeError } = await supabase
      .from("enrollment_window")
      .select("name, open_date, close_date, campus_id")
      .eq("id", windowId)
      .single();
    if (beforeError) return { data: null, error: beforeError.message };

    const { error } = await supabase
      .from("enrollment_window")
      .update({
        name,
        open_date: input.open_date,
        close_date: input.close_date,
      })
      .eq("id", windowId);

    if (error) return { data: null, error: error.message };

    await logAuditEvent({
      table_name: "enrollment_window",
      record_id: windowId,
      action: AuditAction.Update,
      actor_id: session.user_id,
      campus_id: before?.campus_id ?? null,
      old_data: before
        ? { name: before.name, open_date: before.open_date, close_date: before.close_date }
        : undefined,
      new_data: { name, open_date: input.open_date, close_date: input.close_date },
    });

    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: "Failed to update enrollment window" };
  }
}

// ─── Staff User Role Mutations ──────────────────────────

export interface AssignStaffRoleInput {
  user_email: string;
  campus_id: string;
  role: "system_admin" | "enrollment_manager" | "enrollment_staff" | "compliance_auditor";
}

/**
 * Access grants are the sharpest tool in this file, and until now all three
 * of them (assign / edit / remove) gated on requireMinRole("system_admin"),
 * which asks only whether the caller is an admin SOMEWHERE. A system_admin at
 * one campus could therefore grant themselves — or anyone — a role at every
 * other campus in the network, which is privilege escalation by design rather
 * than by bug. Each one now checks system_admin on the campus the grant
 * actually lands on, resolved from the row for edit/remove where the caller
 * only supplies an opaque row id.
 *
 * assigned_by likewise comes from the session, never the payload: it is the
 * audit trail for a privilege grant, and a caller-supplied value forges it.
 */

/**
 * Invite a staff user by email. Creates the auth user (sends invite email),
 * creates their user_profile as staff, and assigns their campus role —
 * all before they ever log in.
 */
export async function assignStaffRole(
  input: AssignStaffRoleInput
): Promise<MutationResult<{ id: string; invited: boolean }>> {
  const session = await requireRoleOnCampus(input.campus_id, "system_admin");
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
          assigned_by: session.user_id,
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

/**
 * Moving a role row is two grants in one: it revokes access on the campus the
 * row currently sits on and creates it on the campus it moves to. Both ends
 * are checked, or a single-campus admin could relocate someone else's role
 * onto a campus they have no authority over.
 */
export async function editStaffRole(
  roleId: string,
  updates: { role?: string; campus_id?: string }
): Promise<MutationResult> {
  const supabase = createServiceRoleClient();

  const { data: roleRow } = await supabase
    .from("user_campus_role")
    .select("campus_id")
    .eq("id", roleId)
    .single();

  await requireRoleOnCampus(roleRow?.campus_id as string | undefined, "system_admin");
  if (updates.campus_id && updates.campus_id !== roleRow?.campus_id) {
    await requireRoleOnCampus(updates.campus_id, "system_admin");
  }

  try {
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
  const supabase = createServiceRoleClient();

  // Grab the campus + user_id before deleting — the campus is what the gate
  // below is checked against, so it has to be read first.
  const { data: roleRow } = await supabase
    .from("user_campus_role")
    .select("user_id, campus_id")
    .eq("id", roleId)
    .single();

  await requireRoleOnCampus(roleRow?.campus_id as string | undefined, "system_admin");

  try {
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

/**
 * Until now this file could only toggle packet requirements that already
 * existed. There was no way to create one, and no way to carry a campus's
 * requirement set into a new school year — so a new year opened with an empty
 * requirement list, and every registration packet built against it came out
 * with zero items and read as complete. Settings owns the fix; lib/mutations/
 * registration.ts refuses to build a packet against an empty set as the
 * backstop.
 */

export interface CreatePacketRequirementInput {
  campus_id: string;
  school_year_id: string;
  /** Matches registration_item.item_type — the join key for the whole packet. */
  item_type: string;
  name: string;
  description?: string;
  is_required?: boolean;
  sort_order?: number;
}

export async function createPacketRequirement(
  input: CreatePacketRequirementInput
): Promise<MutationResult<{ id: string }>> {
  const session = await requireRoleOnCampus(input.campus_id, "system_admin");
  try {
    const itemType = input.item_type.trim();
    const name = input.name.trim();
    if (!itemType) return { data: null, error: "An item type is required." };
    if (!name) return { data: null, error: "A display name is required." };
    if (!input.school_year_id) return { data: null, error: "A school year is required." };

    const supabase = createServiceRoleClient();

    // (campus_id, school_year_id, item_type) is UNIQUE — precheck so the
    // refusal is plain English rather than a raw constraint violation.
    const { data: existing, error: existingError } = await supabase
      .from("packet_requirement")
      .select("id")
      .eq("campus_id", input.campus_id)
      .eq("school_year_id", input.school_year_id)
      .eq("item_type", itemType)
      .maybeSingle();
    if (existingError) return { data: null, error: existingError.message };
    if (existing) {
      return {
        data: null,
        error: `A "${itemType}" requirement already exists for this campus and school year.`,
      };
    }

    const { data, error } = await supabase
      .from("packet_requirement")
      .insert({
        campus_id: input.campus_id,
        school_year_id: input.school_year_id,
        item_type: itemType,
        name,
        description: input.description?.trim() || null,
        is_required: input.is_required ?? true,
        sort_order: input.sort_order ?? 0,
        is_active: true,
      })
      .select("id")
      .single();

    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return {
          data: null,
          error: `A "${itemType}" requirement already exists for this campus and school year.`,
        };
      }
      return { data: null, error: error.message };
    }

    await logAuditEvent({
      table_name: "packet_requirement",
      record_id: data.id,
      action: AuditAction.Create,
      actor_id: session.user_id,
      campus_id: input.campus_id,
      new_data: {
        school_year_id: input.school_year_id,
        item_type: itemType,
        name,
        is_required: input.is_required ?? true,
      },
    });

    return { data: { id: data.id }, error: null };
  } catch (err) {
    return { data: null, error: "Failed to create packet requirement" };
  }
}

/** One source requirement, as read for a copy-forward. */
export interface PacketRequirementSeed {
  item_type: string;
  name: string;
  description: string | null;
  is_required: boolean;
  sort_order: number | null;
}

/**
 * Decide what a copy-forward would write. Pure, and exported so the skip rule
 * is testable without a database: an item_type that already exists in the
 * target year is left alone rather than overwritten, because the target row
 * may have been edited deliberately since it was created.
 */
export function planPacketRequirementCopy(
  source: PacketRequirementSeed[],
  existingTargetItemTypes: string[]
): { toInsert: PacketRequirementSeed[]; skipped: string[] } {
  const existing = new Set(existingTargetItemTypes);
  const toInsert: PacketRequirementSeed[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const req of source) {
    if (seen.has(req.item_type)) continue;
    seen.add(req.item_type);
    if (existing.has(req.item_type)) skipped.push(req.item_type);
    else toInsert.push(req);
  }
  return { toInsert, skipped };
}

/**
 * Copy a campus's active packet requirements from one school year to the
 * next. Requirements that already exist in the target year are skipped and
 * reported, never overwritten.
 */
export async function copyPacketRequirementsFromYear(
  campusId: string,
  fromYearId: string,
  toYearId: string
): Promise<MutationResult<{ copied: number; skipped: string[] }>> {
  const session = await requireRoleOnCampus(campusId, "system_admin");
  try {
    if (!fromYearId || !toYearId) {
      return { data: null, error: "Both a source and a target school year are required." };
    }
    if (fromYearId === toYearId) {
      return { data: null, error: "Choose two different school years." };
    }

    const supabase = createServiceRoleClient();

    const { data: sourceRows, error: sourceError } = await supabase
      .from("packet_requirement")
      .select("item_type, name, description, is_required, sort_order")
      .eq("campus_id", campusId)
      .eq("school_year_id", fromYearId)
      .eq("is_active", true)
      .order("sort_order");
    if (sourceError) return { data: null, error: sourceError.message };

    const source = (sourceRows ?? []) as unknown as PacketRequirementSeed[];
    if (source.length === 0) {
      return {
        data: null,
        error: "That school year has no active registration requirements to copy.",
      };
    }

    const { data: targetRows, error: targetError } = await supabase
      .from("packet_requirement")
      .select("item_type")
      .eq("campus_id", campusId)
      .eq("school_year_id", toYearId);
    if (targetError) return { data: null, error: targetError.message };

    const { toInsert, skipped } = planPacketRequirementCopy(
      source,
      (targetRows ?? []).map((r) => r.item_type as string)
    );

    if (toInsert.length === 0) {
      return { data: { copied: 0, skipped }, error: null };
    }

    const { error } = await supabase.from("packet_requirement").insert(
      toInsert.map((req) => ({
        campus_id: campusId,
        school_year_id: toYearId,
        item_type: req.item_type,
        name: req.name,
        description: req.description ?? null,
        is_required: req.is_required,
        sort_order: req.sort_order ?? 0,
        is_active: true,
      }))
    );

    if (error) return { data: null, error: error.message };

    await logAuditEvent({
      table_name: "packet_requirement",
      record_id: null,
      action: AuditAction.Create,
      actor_id: session.user_id,
      campus_id: campusId,
      new_data: {
        copied_from_school_year_id: fromYearId,
        school_year_id: toYearId,
        item_types: toInsert.map((r) => r.item_type),
      },
      metadata: { skipped },
    });

    return { data: { copied: toInsert.length, skipped }, error: null };
  } catch (err) {
    return { data: null, error: "Failed to copy packet requirements" };
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
