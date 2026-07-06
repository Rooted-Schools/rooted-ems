"use server";

import { revalidatePath } from "next/cache";
import { requireStaffSession } from "@/lib/auth/get-session";
import {
  createLeadByStaff,
  logLeadActivity,
  updateLead,
  type CreateLeadInput,
  type UpdateLeadInput,
} from "@/lib/mutations";

export async function staffCreateLead(input: CreateLeadInput, actorId: string) {
  await requireStaffSession();
  const result = await createLeadByStaff(input, actorId);
  if (!result.error) revalidatePath("/staff/recruitment");
  return result;
}

export async function staffLogLeadActivity(
  leadId: string,
  activityType: string,
  body: string,
  actorId: string
) {
  await requireStaffSession();
  const result = await logLeadActivity(leadId, activityType, body, actorId);
  if (!result.error) {
    revalidatePath("/staff/recruitment");
    revalidatePath(`/staff/recruitment/${leadId}`);
  }
  return result;
}

export async function staffUpdateLead(leadId: string, input: UpdateLeadInput, actorId: string) {
  await requireStaffSession();
  const result = await updateLead(leadId, input, actorId);
  if (!result.error) {
    revalidatePath("/staff/recruitment");
    revalidatePath(`/staff/recruitment/${leadId}`);
  }
  return result;
}
