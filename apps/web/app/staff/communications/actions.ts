"use server";

import { revalidatePath } from "next/cache";
import { requireStaffSession } from "@/lib/auth/get-session";
import {
  sendNotification,
  createMessageTemplate,
  updateMessageTemplate,
  deleteMessageTemplate,
  type SendNotificationInput,
  type CreateTemplateInput,
  type UpdateTemplateInput,
} from "@/lib/mutations";

export async function staffSendNotification(input: SendNotificationInput) {
  await requireStaffSession();
  const result = await sendNotification(input);
  if (!result.error) {
    revalidatePath("/staff/communications");
  }
  return result;
}

export async function staffCreateTemplate(input: CreateTemplateInput) {
  await requireStaffSession();
  const result = await createMessageTemplate(input);
  if (!result.error) {
    revalidatePath("/staff/communications");
  }
  return result;
}

export async function staffUpdateTemplate(input: UpdateTemplateInput) {
  await requireStaffSession();
  const result = await updateMessageTemplate(input);
  if (!result.error) {
    revalidatePath("/staff/communications");
  }
  return result;
}

export async function staffDeleteTemplate(templateId: string) {
  await requireStaffSession();
  const result = await deleteMessageTemplate(templateId);
  if (!result.error) {
    revalidatePath("/staff/communications");
  }
  return result;
}
