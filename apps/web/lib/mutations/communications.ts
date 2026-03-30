/**
 * Communication mutations – send in-app notifications and log messages.
 */
import { createServiceRoleClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";

// ─── Types ──────────────────────────────────────────────

export interface SendNotificationInput {
  /** Target user IDs (guardians / families) */
  recipientUserIds: string[];
  /** Campus scope */
  campusId?: string;
  /** Message channel */
  channel: "email" | "sms" | "in_app";
  /** Email / notification subject */
  subject: string;
  /** Message body */
  body: string;
  /** Optional deep-link path for in-app notifications */
  link?: string;
  /** Optional message template used */
  templateId?: string;
}

export interface CreateTemplateInput {
  campusId?: string;
  name: string;
  subject?: string;
  body: string;
  channel: "email" | "sms" | "in_app";
  mergeFields?: string[];
  createdBy?: string;
}

export interface UpdateTemplateInput {
  id: string;
  name?: string;
  subject?: string;
  body?: string;
  channel?: "email" | "sms" | "in_app";
  mergeFields?: string[];
  isActive?: boolean;
}

// ─── Send Notification ──────────────────────────────────

export async function sendNotification(
  input: SendNotificationInput
): Promise<MutationResult<{ sentCount: number }>> {
  const supabase = createServiceRoleClient();

  const { recipientUserIds, campusId, channel, subject, body, link, templateId } = input;

  if (recipientUserIds.length === 0) {
    return { data: null, error: "No recipients selected." };
  }

  // For in_app channel, create notification records + communication_log entries
  // For email/sms, only create communication_log with "queued" status
  // (actual sending requires Resend/Twilio integration)

  let sentCount = 0;

  if (channel === "in_app") {
    // Create notification rows for each recipient
    const notificationRows = recipientUserIds.map((userId) => ({
      user_id: userId,
      title: subject,
      body,
      link: link ?? null,
      is_read: false,
    }));

    const { error: notifError } = await supabase
      .from("notification")
      .insert(notificationRows);

    if (notifError) {
      return { data: null, error: `Failed to create notifications: ${notifError.message}` };
    }

    // Also log in communication_log with "delivered" status (in-app is instant)
    const logRows = recipientUserIds.map((userId) => ({
      campus_id: campusId ?? null,
      template_id: templateId ?? null,
      recipient_user_id: userId,
      recipient_address: "in-app",
      channel: "in_app" as const,
      subject,
      body,
      status: "delivered" as const,
      sent_at: new Date().toISOString(),
      delivered_at: new Date().toISOString(),
    }));

    const { error: logError } = await supabase
      .from("communication_log")
      .insert(logRows);

    if (logError) {
      console.error("[sendNotification] log error:", logError.message);
      // Non-fatal: notifications were already created
    }

    sentCount = recipientUserIds.length;
  } else {
    // Email / SMS – log as "queued" (no provider integration yet)
    const logRows = recipientUserIds.map((userId) => ({
      campus_id: campusId ?? null,
      template_id: templateId ?? null,
      recipient_user_id: userId,
      recipient_address: channel === "email" ? "pending-email" : "pending-sms",
      channel,
      subject,
      body,
      status: "queued" as const,
    }));

    const { error: logError } = await supabase
      .from("communication_log")
      .insert(logRows);

    if (logError) {
      return { data: null, error: `Failed to queue messages: ${logError.message}` };
    }

    sentCount = recipientUserIds.length;
  }

  return { data: { sentCount }, error: null };
}

// ─── Message Templates ──────────────────────────────────

export async function createMessageTemplate(
  input: CreateTemplateInput
): Promise<MutationResult<{ id: string }>> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("message_template")
    .insert({
      campus_id: input.campusId ?? null,
      name: input.name,
      subject: input.subject ?? null,
      body: input.body,
      channel: input.channel,
      merge_fields: input.mergeFields ?? [],
      is_active: true,
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: { id: data.id }, error: null };
}

export async function updateMessageTemplate(
  input: UpdateTemplateInput
): Promise<MutationResult> {
  const supabase = createServiceRoleClient();

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.subject !== undefined) updates.subject = input.subject;
  if (input.body !== undefined) updates.body = input.body;
  if (input.channel !== undefined) updates.channel = input.channel;
  if (input.mergeFields !== undefined) updates.merge_fields = input.mergeFields;
  if (input.isActive !== undefined) updates.is_active = input.isActive;

  const { error } = await supabase
    .from("message_template")
    .update(updates)
    .eq("id", input.id);

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: null, error: null };
}

export async function deleteMessageTemplate(
  templateId: string
): Promise<MutationResult> {
  const supabase = createServiceRoleClient();

  // Soft-delete: set is_active to false
  const { error } = await supabase
    .from("message_template")
    .update({ is_active: false })
    .eq("id", templateId);

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: null, error: null };
}
