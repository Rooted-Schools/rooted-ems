/**
 * Communication mutations – send in-app notifications and log messages.
 */
import { createServiceRoleClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";
import { sendSms, isSmsConfigured } from "@/lib/sms";
import { sendEmail, isEmailConfigured } from "@/lib/email";

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

export interface SendNotificationResult {
  sentCount: number;
  /** Recipients not reached, and why — no email on file, no phone/consent,
   *  or the provider rejected the send. Surfaced so staff know the real
   *  reach of a send rather than trusting a single "sent" number. */
  skipped: { name: string; reason: string }[];
  /** False when the channel's provider has no credentials configured
   *  (RESEND_API_KEY / TWILIO_*). The caller must show this honestly
   *  instead of reporting a false success. */
  configured: boolean;
}

export async function sendNotification(
  input: SendNotificationInput
): Promise<MutationResult<SendNotificationResult>> {
  const supabase = createServiceRoleClient();

  const { recipientUserIds, campusId, channel, subject, body, link, templateId } = input;

  if (recipientUserIds.length === 0) {
    return { data: null, error: "No recipients selected." };
  }

  if (channel === "in_app") {
    // In-app has no external provider — always "configured" and always
    // reaches every recipient (a notification row is enough; whether the
    // family later reads it is a separate concern from delivery).
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

    const { error: logError } = await supabase.from("communication_log").insert(logRows);
    if (logError) {
      // Non-fatal: the notifications the family actually sees were already
      // created; only the audit log entry failed.
      console.error("[sendNotification] log error:", logError.message);
    }

    return { data: { sentCount: recipientUserIds.length, skipped: [], configured: true }, error: null };
  }

  // Email / SMS — resolve real contact info per recipient and actually send,
  // rather than only logging a "queued" row that nothing ever advances.
  const { data: guardians, error: guardianError } = await supabase
    .from("guardian")
    .select("user_id, first_name, last_name, email, phone, sms_consent")
    .in("user_id", recipientUserIds);

  if (guardianError) {
    return { data: null, error: `Failed to load recipient contact info: ${guardianError.message}` };
  }

  const byUser = new Map(
    (guardians ?? []).map((g) => [
      g.user_id as string,
      {
        name: `${g.first_name ?? ""} ${g.last_name ?? ""}`.trim() || "Unknown family",
        email: g.email as string | null,
        phone: g.phone as string | null,
        smsConsent: g.sms_consent === true,
      },
    ])
  );

  const configured = channel === "email" ? isEmailConfigured() : isSmsConfigured();

  let sentCount = 0;
  const skipped: { name: string; reason: string }[] = [];
  const logRows: Array<{
    campus_id: string | null;
    template_id: string | null;
    recipient_user_id: string;
    recipient_address: string;
    channel: "email" | "sms";
    subject: string;
    body: string;
    status: "delivered" | "failed";
    sent_at: string | null;
    delivered_at: string | null;
    error_message: string | null;
  }> = [];

  for (const userId of recipientUserIds) {
    const contact = byUser.get(userId);
    const name = contact?.name ?? "Unknown family";

    if (!configured) {
      skipped.push({
        name,
        reason: channel === "email" ? "Email isn't connected in this environment." : "Texting isn't connected in this environment.",
      });
      logRows.push({
        campus_id: campusId ?? null,
        template_id: templateId ?? null,
        recipient_user_id: userId,
        recipient_address: channel === "email" ? "pending-email" : "pending-sms",
        channel,
        subject,
        body,
        status: "failed",
        sent_at: null,
        delivered_at: null,
        error_message: `${channel} not configured`,
      });
      continue;
    }

    if (channel === "email") {
      if (!contact?.email) {
        skipped.push({ name, reason: "No email on file." });
        continue;
      }
      const result = await sendEmail({ to: contact.email, subject, html: body, text: body });
      if (result.ok) {
        sentCount += 1;
        logRows.push({
          campus_id: campusId ?? null,
          template_id: templateId ?? null,
          recipient_user_id: userId,
          recipient_address: contact.email,
          channel: "email",
          subject,
          body,
          status: "delivered",
          sent_at: new Date().toISOString(),
          delivered_at: new Date().toISOString(),
          error_message: null,
        });
      } else {
        const reason = result.error ?? "Delivery failed.";
        skipped.push({ name, reason });
        logRows.push({
          campus_id: campusId ?? null,
          template_id: templateId ?? null,
          recipient_user_id: userId,
          recipient_address: contact.email,
          channel: "email",
          subject,
          body,
          status: "failed",
          sent_at: null,
          delivered_at: null,
          error_message: reason,
        });
      }
    } else {
      // sms — same consent gate the rest of the app already enforces
      // (see e.g. staff/today/actions.ts textExpiringOffers): never text a
      // family who hasn't opted in, regardless of what the compose UI sent.
      if (!contact?.phone) {
        skipped.push({ name, reason: "No phone on file." });
        continue;
      }
      if (!contact.smsConsent) {
        skipped.push({ name, reason: "Hasn't opted in to texting." });
        continue;
      }
      const result = await sendSms({ to: contact.phone, body });
      if (result.ok) {
        sentCount += 1;
        logRows.push({
          campus_id: campusId ?? null,
          template_id: templateId ?? null,
          recipient_user_id: userId,
          recipient_address: contact.phone,
          channel: "sms",
          subject,
          body,
          status: "delivered",
          sent_at: new Date().toISOString(),
          delivered_at: new Date().toISOString(),
          error_message: null,
        });
      } else {
        const reason = result.error ?? "Delivery failed.";
        skipped.push({ name, reason });
        logRows.push({
          campus_id: campusId ?? null,
          template_id: templateId ?? null,
          recipient_user_id: userId,
          recipient_address: contact.phone,
          channel: "sms",
          subject,
          body,
          status: "failed",
          sent_at: null,
          delivered_at: null,
          error_message: reason,
        });
      }
    }
  }

  if (logRows.length > 0) {
    const { error: logError } = await supabase.from("communication_log").insert(logRows);
    if (logError) {
      // Non-fatal: the sends themselves already happened; only the audit
      // trail failed to record. Surface it, but don't claim the sends
      // didn't happen — they did.
      console.error("[sendNotification] log error:", logError.message);
    }
  }

  return { data: { sentCount, skipped, configured }, error: null };
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
