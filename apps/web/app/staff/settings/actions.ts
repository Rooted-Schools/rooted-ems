"use server";

import { revalidatePath } from "next/cache";
import {
  createEnrollmentWindow,
  updateEnrollmentWindowStatus,
  assignStaffRole,
  removeStaffRole,
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

export async function staffRemoveRole(roleId: string) {
  const result = await removeStaffRole(roleId);
  if (!result.error) {
    revalidatePath("/staff/settings");
  }
  return result;
}
