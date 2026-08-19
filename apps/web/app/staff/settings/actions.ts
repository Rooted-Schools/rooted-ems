"use server";

import { revalidatePath } from "next/cache";
import {
  requireMinRole,
  requireRoleOnCampus,
  requireNetworkAccess,
} from "@/lib/auth/get-session";
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
import {
  saveCampusMessageOverride,
  resetCampusMessageOverride,
  type SaveCampusMessageOverrideInput,
} from "@/lib/mutations/message-overrides";

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
  // The campus this window lands on is known here, so gate on it directly —
  // the mutation checks the same thing independently.
  await requireRoleOnCampus(input.campus_id, "enrollment_manager");
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
  // windowId is opaque here — the mutation resolves the window's real campus
  // and gates enrollment_manager on THAT. Keeping the gate singular there
  // avoids a weaker requireMinRole check masking the per-campus one.
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
  // windowId is opaque here — the mutation resolves the window's real campus
  // and gates enrollment_manager on THAT.
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
  // requirementId is opaque here — the mutation resolves the requirement's
  // real campus and gates enrollment_manager on THAT.
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
  // The ids are opaque here — the mutation resolves every row's campus and
  // rejects the whole call if any falls outside the caller's enrollment_manager
  // campuses.
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
 * School-year setup actions. Creating a year is system_admin; flipping which
 * year is current is network-wide state and requires network access. The
 * mutation layer enforces each independently (see lib/mutations/settings.ts);
 * the gate here just fails fast before any DB round trip. The settings UI hides
 * these controls for lower roles, but that is a courtesy, not the boundary.
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
  // school_year is network-wide (no campus_id): flipping the current year moves
  // it for every campus, so this requires network access, not system_admin on
  // any single campus. The mutation enforces the same independently.
  await requireNetworkAccess();
  const result = await updateSchoolYearCurrent(schoolYearId, isCurrent);
  if (!result.error) {
    revalidatePath("/staff/settings");
    revalidatePath("/staff/seats");
  }
  return result;
}

export async function staffCreateGradeLevel(input: CreateGradeLevelInput) {
  // The campus is known here, so gate on it directly — the mutation checks the
  // same thing independently.
  await requireRoleOnCampus(input.campus_id, "system_admin");
  const result = await createGradeLevel(input);
  if (!result.error) {
    revalidatePath("/staff/settings");
  }
  return result;
}

export async function staffDeleteGradeLevel(gradeLevelId: string) {
  // gradeLevelId is opaque here — the mutation resolves the grade level's real
  // campus and gates system_admin on THAT.
  const result = await deleteGradeLevel(gradeLevelId);
  if (!result.error) {
    revalidatePath("/staff/settings");
  }
  return result;
}

/**
 * Owner-facing pause switch for the instant bilingual welcome (see
 * lib/messaging-flags.ts). Network access only — this is a network-wide
 * on/off, not an operational setting a single-campus admin or an
 * enrollment_manager should be able to flip while a campus team is mid-training.
 */
export async function staffSetWelcomeMessages(enabled: boolean) {
  // Network-wide on/off switch — requires network access (system_admin on 2+
  // campuses), not merely system_admin on one campus.
  const session = await requireNetworkAccess();
  const result = await setWelcomeMessagingEnabled(enabled, session.user_id);
  if (!result.error) {
    revalidatePath("/staff/settings");
    revalidatePath("/staff/communications/automated-messages");
  }
  return result;
}

/**
 * Per-campus message overrides. Gated on enrollment_manager for the campus
 * the row lands on, not merely on being a manager somewhere — this copy is
 * mailed to that campus's families the moment it saves. The mutations check
 * the same thing independently; these calls just fail fast.
 */

export async function staffSaveMessageOverride(input: SaveCampusMessageOverrideInput) {
  await requireRoleOnCampus(input.campusId, "enrollment_manager");
  const result = await saveCampusMessageOverride(input);
  if (!result.error) {
    revalidatePath("/staff/settings");
    revalidatePath("/staff/communications/automated-messages");
  }
  return result;
}

export async function staffResetMessageOverride(campusId: string, templateKey: string) {
  await requireRoleOnCampus(campusId, "enrollment_manager");
  const result = await resetCampusMessageOverride(campusId, templateKey);
  if (!result.error) {
    revalidatePath("/staff/settings");
    revalidatePath("/staff/communications/automated-messages");
  }
  return result;
}

export async function staffCreateCapacityPlan(input: CreateCapacityPlanInput) {
  // The campus is known here, so gate on it directly — the mutation checks the
  // same thing independently.
  await requireRoleOnCampus(input.campus_id, "system_admin");
  const result = await createCapacityPlan(input);
  if (!result.error) {
    revalidatePath("/staff/settings");
    revalidatePath("/staff/seats");
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/today");
  }
  return result;
}
