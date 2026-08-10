"use server";

import { revalidatePath } from "next/cache";
import { requireStaffSession, getAccessibleCampusIds } from "@/lib/auth/get-session";
import {
  sendNotification,
  createMessageTemplate,
  updateMessageTemplate,
  deleteMessageTemplate,
  sendOneOffEmail,
  type SendNotificationInput,
  type CreateTemplateInput,
  type UpdateTemplateInput,
  type SendOneOffEmailInput,
  type SendOneOffEmailResult,
} from "@/lib/mutations";

/**
 * Notification links are the audience signal both portals filter on (see
 * applyContextFilter in lib/queries/family.ts): a family bell only shows
 * notifications whose link is null or starts with /family, a staff bell only
 * null or /staff. A free-text link typed in the compose box — "google.com",
 * "/dashboard", an absolute URL — matches neither prefix, so the notification
 * lands in the table and is invisible in both portals.
 *
 * These are family-facing sends, so anything that isn't a /family path is
 * dropped to null: the message still reaches the family (null links pass both
 * filters), it just carries no deep link. Logged once per rejected value so
 * staff behavior can be corrected rather than silently swallowed.
 */
function normalizeFamilyLink(link: string | undefined): string | undefined {
  const trimmed = link?.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("/family")) return trimmed;
  console.warn(
    "[staffSendNotification] dropping link that would be invisible in both portals — only /family paths are deliverable here",
    { link: trimmed }
  );
  return undefined;
}

export async function staffSendNotification(input: SendNotificationInput) {
  await requireStaffSession();
  const result = await sendNotification({
    ...input,
    link: normalizeFamilyLink(input.link),
  });
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

/**
 * Send a single tracked email to a lead or an application's guardian from
 * inside the app (compose-email-dialog.tsx). This is the enforcement
 * boundary: the session and the caller's accessible campuses are resolved
 * here and handed to sendOneOffEmail, which rejects any record outside that
 * scope before it reads or sends anything else. An empty accessible-campus
 * list means org-wide (system_admin) access — see getAccessibleCampusIds.
 */
export async function staffSendOneOffEmail(
  input: SendOneOffEmailInput
): Promise<SendOneOffEmailResult> {
  const session = await requireStaffSession();
  const accessibleCampusIds = getAccessibleCampusIds(session);
  const result = await sendOneOffEmail(input, session.user_id, accessibleCampusIds);
  if (result.ok) {
    if (input.leadId) {
      revalidatePath("/staff/recruitment");
      revalidatePath(`/staff/recruitment/${input.leadId}`);
    }
    if (input.applicationId) {
      revalidatePath(`/staff/applications/${input.applicationId}`);
    }
  }
  return result;
}
