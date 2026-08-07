"use server";

import { revalidatePath } from "next/cache";
import { requireMinRole } from "@/lib/auth/get-session";
import {
  createEnrollmentWindow,
  updateEnrollmentWindowStatus,
  assignStaffRole,
  editStaffRole,
  removeStaffRole,
  updatePacketRequirement,
  bulkUpdatePacketRequirements,
  type CreateEnrollmentWindowInput,
  type AssignStaffRoleInput,
} from "@/lib/mutations/settings";

/**
 * Settings actions inherit the gate the settings page itself applies:
 * enrollment_manager for the operational settings, system_admin for anything
 * that grants or removes access. requireStaffSession (is_staff only) let any
 * staff account — including a compliance auditor — hand out system_admin.
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

export async function staffAssignRole(input: AssignStaffRoleInput) {
  const session = await requireMinRole("system_admin");
  // assigned_by is the audit trail for a privilege grant — take it from the
  // session, never from whatever the caller put in the payload.
  const result = await assignStaffRole({ ...input, assigned_by: session.user_id });
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
