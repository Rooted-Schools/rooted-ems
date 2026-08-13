"use server";

import { revalidatePath } from "next/cache";
import { requireMinRole, requireRoleOnCampus } from "@/lib/auth/get-session";
import { setWelcomeMessagingEnabled } from "@/lib/messaging-flags";
import {
  createEnrollmentWindow,
  updateEnrollmentWindowStatus,
  updateEnrollmentWindow,
  assignStaffRole,
  editStaffRole,
  removeStaffRole,
  updatePacketRequirement,
  bulkUpdatePacketRequirements,
  createPacketRequirement,
  copyPacketRequirementsFromYear,
  createSchoolYear,
  updateSchoolYearCurrent,
  createGradeLevel,
  deleteGradeLevel,
  createCapacityPlan,
  type CreateEnrollmentWindowInput,
  type UpdateEnrollmentWindowInput,
  type AssignStaffRoleInput,
  type CreatePacketRequirementInput,
  type CreateSchoolYearInput,
  type CreateGradeLevelInput,
  type CreateCapacityPlanInput,
} from "@/lib/mutations/settings";

/**
 * Settings actions inherit the gate the settings page itself applies:
 * enrollment_manager for the operational settings, system_admin for anything
 * that grants or removes access. requireStaffSession (is_staff only) let any
 * staff account — including a compliance auditor — hand out system_admin.
 *
 * For the three access-grant actions, requireMinRole is not the boundary
 * either: it only asks whether the caller is an admin on SOME campus. The
 * mutations in lib/mutations/settings.ts check system_admin on the campus the
 * grant actually lands on, which for editRole/removeRole means reading the
 * row first. The requireMinRole calls here just fail obvious non-admins fast.
 */

export async function staffCreateEnrollmentWindow(input: CreateEnrollmentWindowInput) {
  await requireMinRole("enrollment_manager");
  const result = await createEnrollmentWindow(input);
  if (!result.error) {
    revalidatePath("/staff/settings");
  }
  return result;
}

export async function staffUpdateWindowStatus(
  windowId: string,
  status: "draft" | "open" | "closed" | "archived"
) {
  await requireMinRole("enrollment_manager");
  const result = await updateEnrollmentWindowStatus(windowId, status);
  if (!result.error) {
    revalidatePath("/staff/settings");
  }
  return result;
}

export async function staffUpdateEnrollmentWindow(
  windowId: string,
  input: UpdateEnrollmentWindowInput
) {
  await requireMinRole("enrollment_manager");
  const result = await updateEnrollmentWindow(windowId, input);
  if (!result.error) {
    revalidatePath("/staff/settings");
  }
  return result;
}

export async function staffAssignRole(input: AssignStaffRoleInput) {
  // The campus the grant lands on is known here, so gate on it directly.
  // assigned_by is no longer part of the payload at all — the mutation stamps
  // it from the session, so a privilege grant's audit trail cannot be forged.
  await requireRoleOnCampus(input.campus_id, "system_admin");
  const result = await assignStaffRole(input);
  if (!result.error) {
    revalidatePath("/staff/settings");
  }
  return result;
}

export async function staffEditRole(
  roleId: string,
  updates: { role?: string; campus_id?: string }
) {
  await requireMinRole("system_admin");
  const result = await editStaffRole(roleId, updates);
  if (!result.error) {
    revalidatePath("/staff/settings");
  }
  return result;
}

export async function staffRemoveRole(roleId: string) {
  await requireMinRole("system_admin");
  const result = await removeStaffRole(roleId);
  if (!result.error) {
    revalidatePath("/staff/settings");
  }
  return result;
}

export async function staffUpdatePacketRequirement(
  requirementId: string,
  updates: { is_active?: boolean; is_required?: boolean }
) {
  await requireMinRole("enrollment_manager");
  const result = await updatePacketRequirement(requirementId, updates);
  if (!result.error) {
    revalidatePath("/staff/settings");
    revalidatePath("/family/registration");
  }
  return result;
}

export async function staffBulkUpdatePacketRequirements(
  requirementIds: string[],
  updates: { is_active?: boolean; is_required?: boolean }
) {
  await requireMinRole("enrollment_manager");
  const result = await bulkUpdatePacketRequirements(requirementIds, updates);
  if (!result.error) {
    revalidatePath("/staff/settings");
    revalidatePath("/family/registration");
  }
  return result;
}

/**
 * Creating requirements and carrying them into a new school year are
 * system_admin, on the campus in question — a campus opening a new year with
 * no requirements produces packets with zero items that read as complete, so
 * this is closer to schema setup than to day-to-day settings.
 */

export async function staffCreatePacketRequirement(input: CreatePacketRequirementInput) {
  await requireRoleOnCampus(input.campus_id, "system_admin");
  const result = await createPacketRequirement(input);
  if (!result.error) {
    revalidatePath("/staff/settings");
    revalidatePath("/family/registration");
  }
  return result;
}

export async function staffCopyPacketRequirements(
  campusId: string,
  fromYearId: string,
  toYearId: string
) {
  await requireRoleOnCampus(campusId, "system_admin");
  const result = await copyPacketRequirementsFromYear(campusId, fromYearId, toYearId);
  if (!result.error) {
    revalidatePath("/staff/settings");
    revalidatePath("/family/registration");
  }
  return result;
}

/**
 * School-year setup actions. All gated system_admin — the mutation layer
 * enforces this independently (see lib/mutations/settings.ts), the gate here
 * just fails fast before any DB round trip. The settings UI hides these
 * controls for lower roles, but that is a courtesy, not the boundary.
 */

export async function staffCreateSchoolYear(input: CreateSchoolYearInput) {
  await requireMinRole("system_admin");
  const result = await createSchoolYear(input);
  if (!result.error) {
    revalidatePath("/staff/settings");
  }
  return result;
}

export async function staffUpdateSchoolYearCurrent(schoolYearId: string, isCurrent: boolean) {
  await requireMinRole("system_admin");
  const result = await updateSchoolYearCurrent(schoolYearId, isCurrent);
  if (!result.error) {
    revalidatePath("/staff/settings");
    revalidatePath("/staff/seats");
  }
  return result;
}

export async function staffCreateGradeLevel(input: CreateGradeLevelInput) {
  await requireMinRole("system_admin");
  const result = await createGradeLevel(input);
  if (!result.error) {
    revalidatePath("/staff/settings");
  }
  return result;
}

export async function staffDeleteGradeLevel(gradeLevelId: string) {
  await requireMinRole("system_admin");
  const result = await deleteGradeLevel(gradeLevelId);
  if (!result.error) {
    revalidatePath("/staff/settings");
  }
  return result;
}

/**
 * Owner-facing pause switch for the instant bilingual welcome (see
 * lib/messaging-flags.ts). system_admin only — this is a network-wide
 * on/off, not an operational setting an enrollment_manager should be able
 * to flip while a campus team is mid-training.
 */
export async function staffSetWelcomeMessages(enabled: boolean) {
  const session = await requireMinRole("system_admin");
  const result = await setWelcomeMessagingEnabled(enabled, session.user_id);
  if (!result.error) {
    revalidatePath("/staff/settings");
    revalidatePath("/staff/communications/automated-messages");
  }
  return result;
}

export async function staffCreateCapacityPlan(input: CreateCapacityPlanInput) {
  await requireMinRole("system_admin");
  const result = await createCapacityPlan(input);
  if (!result.error) {
    revalidatePath("/staff/settings");
    revalidatePath("/staff/seats");
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/today");
  }
  return result;
}
