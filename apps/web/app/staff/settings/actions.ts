"use server";

import { revalidatePath } from "next/cache";
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

export async function staffCreateEnrollmentWindow(input: CreateEnrollmentWindowInput) {
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
  const result = await updateEnrollmentWindowStatus(windowId, status);
  if (!result.error) {
    revalidatePath("/staff/settings");
  }
  return result;
}

export async function staffAssignRole(input: AssignStaffRoleInput) {
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
  const result = await editStaffRole(roleId, updates);
  if (!result.error) {
    revalidatePath("/staff/settings");
  }
  return result;
}

export async function staffRemoveRole(roleId: string) {
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
  const result = await bulkUpdatePacketRequirements(requirementIds, updates);
  if (!result.error) {
    revalidatePath("/staff/settings");
    revalidatePath("/family/registration");
  }
  return result;
}
