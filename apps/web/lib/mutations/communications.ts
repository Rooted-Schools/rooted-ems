/**
 * Communication mutations – send in-app notifications and log messages.
 */
import { createServiceRoleClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";
import { isCMOAdmin, requireRoleOnCampus, requireStaffSession } from "@/lib/auth/get-session";
import { sendSms, isSmsConfigured } from "@/lib/sms";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { staffComposedEmail } from "@/lib/email-templates";
import { getSuppressedEmails } from "@/lib/email-compliance";
import { logLeadActivity } from "./leads";
import { createNote } from "./notes";

// ─── Types ──────────────────────────────────────────────

export interface SendNotificationInput {
  /** Target user IDs (guardians / families) */
  recipientUserIds: string[];
  /**
   * Fallback campus for the communication_log row. Only used for recipients
   * whose real campus cannot be resolved (staff recipients on system
   * notifications). It is never used to decide who may be messaged.
   */
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
  /**
   * Campus scope of the staff member who triggered this send, resolved from
   * their session by the server action (getAccessibleCampusIds). When
   * present, recipients whose campus falls outside it are skipped and
   * reported rather than messaged.
   *
   * Omitted by the system paths (lib/notify.ts, inbound email/SMS), which
   * have no staff session and address recipients the app itself chose.
   * `undefined` and `[]` both mean "no restriction" — the empty list is the
   * org-wide convention from getAccessibleCampusIds.
   */
  accessibleCampusIds?: string[];
}

export interface CreateTemplateInput {
  campusId?: string;
  name: string;
  subject?: string;
  body: string;
  channel: "email" | "sms" | "in_app";
  mergeFields?: string[];
  /** Kept for call-site compatibility and ignored — authorship comes from
   *  the session, so it cannot be attributed to someone else. */
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

/** Reported for recipients the caller may not message. */
const OUT_OF_SCOPE = "Not on a campus you can access.";

interface RecipientInfo {
  name: string;
  email: string | null;
  phone: string | null;
  smsConsent: boolean;
  /** Campus resolved from the recipient's own application, never from input. */
  campusId: string | null;
}

/**
 * Resolve each recipient's contact details AND the campus they actually
 * belong to, walking guardian → application. Recipients with no guardian row
 * (staff receiving a system notification) resolve to a null campus, which
 * callers treat as "fall back to the input campus for logging only".
 *
 * A guardian with applications at more than one campus resolves to whichever
 * of those the caller can access, so a legitimate cross-campus family is not
 * skipped on the strength of an arbitrary row order.
 */
async function resolveRecipients(
  supabase: ReturnType<typeof createServiceRoleClient>,
  recipientUserIds: string[],
  accessibleCampusIds?: string[]
): Promise<Map<string, RecipientInfo>> {
  const byUser = new Map<string, RecipientInfo>();

  const { data: guardians, error } = await supabase
    .from("guardian")
    .select("id, user_id, first_name, last_name, email, phone, sms_consent")
    .in("user_id", recipientUserIds);

  if (error) {
    console.error("[resolveRecipients]", error.message);
    return byUser;
  }

  const rows = (guardians ?? []) as Array<Record<string, unknown>>;
  const guardianIdToUserId = new Map<string, string>();
  for (const g of rows) {
    const userId = g.user_id as string;
    guardianIdToUserId.set(g.id as string, userId);
    byUser.set(userId, {
      name: `${g.first_name ?? ""} ${g.last_name ?? ""}`.toString().trim() || "Unknown family",
      email: (g.email as string | null) ?? null,
      phone: (g.phone as string | null) ?? null,
      smsConsent: g.sms_consent === true,
      campusId: null,
    });
  }

  if (guardianIdToUserId.size === 0) return byUser;

  const { data: apps, error: appError } = await supabase
    .from("application")
    .select("guardian_id, campus_id")
    .in("guardian_id", [...guardianIdToUserId.keys()]);

  if (appError) {
    console.error("[resolveRecipients] applications", appError.message);
    return byUser;
  }

  const scoped = accessibleCampusIds && accessibleCampusIds.length > 0 ? accessibleCampusIds : null;
  for (const row of (apps ?? []) as Array<Record<string, unknown>>) {
    const userId = guardianIdToUserId.get(row.guardian_id as string);
    if (!userId) continue;
    const info = byUser.get(userId);
    if (!info) continue;
    const campusId = (row.campus_id as string | null) ?? null;
    if (!campusId) continue;
    // Prefer a campus the caller can act on; otherwise keep the first seen.
    if (info.campusId === null || (scoped && !scoped.includes(info.campusId) && scoped.includes(campusId))) {
      info.campusId = campusId;
    }
  }

  return byUser;
}

export async function sendNotification(
  input: SendNotificationInput
): Promise<MutationResult<SendNotificationResult>> {
  const supabase = createServiceRoleClient();

  const {
    recipientUserIds,
    campusId,
    channel,
    subject,
    body,
    link,
    templateId,
    accessibleCampusIds,
  } = input;

  if (recipientUserIds.length === 0) {
    return { data: null, error: "No recipients selected." };
  }

  // Campus resolution runs for every channel: the recipient list arrives from
  // the client, and the campus stamped on communication_log used to come from
  // the same place, so a staff member could message another campus's families
  // and file the record under a campus of their choosing. The campus is now
  // the recipient's own, and when the caller passed a scope, recipients
  // outside it never receive anything.
  const byUser = await resolveRecipients(supabase, recipientUserIds, accessibleCampusIds);
  const scoped = accessibleCampusIds && accessibleCampusIds.length > 0 ? accessibleCampusIds : null;

  const skipped: { name: string; reason: string }[] = [];
  let targets = recipientUserIds;
  if (scoped) {
    targets = [];
    for (const userId of recipientUserIds) {
      const info = byUser.get(userId);
      if (!info?.campusId || !scoped.includes(info.campusId)) {
        skipped.push({ name: info?.name ?? "Unknown family", reason: OUT_OF_SCOPE });
        continue;
      }
      targets.push(userId);
    }
    if (targets.length === 0) {
      return { data: { sentCount: 0, skipped, configured: true }, error: null };
    }
  }

  /** Log campus: the recipient's own, falling back to the caller's only when
   *  the recipient has no application (system notifications to staff). */
  const logCampusFor = (userId: string): string | null =>
    byUser.get(userId)?.campusId ?? campusId ?? null;

  if (channel === "in_app") {
    // In-app has no external provider — always "configured" and always
    // reaches every recipient (a notification row is enough; whether the
    // family later reads it is a separate concern from delivery).
    const notificationRows = targets.map((userId) => ({
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

    const logRows = targets.map((userId) => ({
      campus_id: logCampusFor(userId),
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

    return { data: { sentCount: targets.length, skipped, configured: true }, error: null };
  }

  // Email / SMS — contact info came back with the campus resolution above.
  const configured = channel === "email" ? isEmailConfigured() : isSmsConfigured();

  let sentCount = 0;
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

  for (const userId of targets) {
    const contact = byUser.get(userId);
    const name = contact?.name ?? "Unknown family";

    if (!configured) {
      skipped.push({
        name,
        reason: channel === "email" ? "Email isn't connected in this environment." : "Texting isn't connected in this environment.",
      });
      logRows.push({
        campus_id: logCampusFor(userId),
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
          campus_id: logCampusFor(userId),
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
          campus_id: logCampusFor(userId),
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
          campus_id: logCampusFor(userId),
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
          campus_id: logCampusFor(userId),
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

/**
 * Templates are campus property: they carry a campus's voice, and the
 * automated sends read from them. All three mutations ran on the service-role
 * client behind requireStaffSession alone, so any staff account could rewrite
 * or soft-delete another campus's template by id.
 *
 * A template with a NULL campus_id is a network-level template shared by every
 * campus, and changing one changes messaging everywhere. There is no
 * org-wide-mutation guard in lib/auth/get-session for this shape (
 * requireNetworkAccess keys on having zero campus rows, which is a different
 * population), so the check here is isCMOAdmin: system_admin on 2+ campuses.
 * It returns an error rather than redirecting, because the caller is a valid
 * staff member on a legitimate page who simply cannot edit this row.
 */
const NETWORK_TEMPLATE_DENIED =
  "Network templates can only be changed by a network administrator.";

async function authorizeTemplate(
  campusId: string | null | undefined
): Promise<{ userId: string } | { error: string }> {
  if (!campusId) {
    const session = await requireStaffSession();
    if (!isCMOAdmin(session)) return { error: NETWORK_TEMPLATE_DENIED };
    return { userId: session.user_id };
  }
  const session = await requireRoleOnCampus(campusId, "enrollment_manager");
  return { userId: session.user_id };
}

export async function createMessageTemplate(
  input: CreateTemplateInput
): Promise<MutationResult<{ id: string }>> {
  const auth = await authorizeTemplate(input.campusId);
  if ("error" in auth) return { data: null, error: auth.error };

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
      // Authorship is an audit field — from the session, never the payload.
      created_by: auth.userId,
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

  const { data: template } = await supabase
    .from("message_template")
    .select("campus_id")
    .eq("id", input.id)
    .single();
  if (!template) return { data: null, error: "Template not found." };

  const auth = await authorizeTemplate(template.campus_id as string | null);
  if ("error" in auth) return { data: null, error: auth.error };

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

  const { data: template } = await supabase
    .from("message_template")
    .select("campus_id")
    .eq("id", templateId)
    .single();
  if (!template) return { data: null, error: "Template not found." };

  const auth = await authorizeTemplate(template.campus_id as string | null);
  if ("error" in auth) return { data: null, error: auth.error };

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

// ─── One-off staff email (tracked 1:1 send) ─────────────

export interface SendOneOffEmailInput {
  /** Exactly one of leadId / applicationId is expected — the caller resolves
   *  which surface (recruitment vs. application) it was opened from. */
  leadId?: string;
  applicationId?: string;
  subject: string;
  message: string;
}

export type SendOneOffEmailResult = { ok: true } | { ok: false; error: string };

/**
 * Staff sends a single tracked email to a lead or application guardian from
 * inside the app. Honest by construction: every early return states the real
 * reason nothing was sent, and the activity/note that makes the send visible
 * on the family's history is only written after sendEmail reports ok:true —
 * never in advance, never on a provider failure.
 *
 * Campus scope must be checked by the caller (the server action, which holds
 * the session) — accessibleCampusIds is passed in rather than resolved here.
 * An empty list means org-wide access (see getAccessibleCampusIds).
 */
export async function sendOneOffEmail(
  input: SendOneOffEmailInput,
  actorId: string,
  accessibleCampusIds: string[]
): Promise<SendOneOffEmailResult> {
  const subject = input.subject?.trim();
  const message = input.message?.trim();
  if (!subject || !message) {
    return { ok: false, error: "Write a subject and a message before sending." };
  }
  if (!input.leadId && !input.applicationId) {
    return { ok: false, error: "No recipient specified." };
  }

  const supabase = createServiceRoleClient();

  let recipientEmail: string | null = null;
  let recipientCampusId: string | null = null;
  let recipientUserId: string | null = null;

  if (input.leadId) {
    const { data: lead } = await supabase
      .from("lead")
      .select("id, campus_id, email, unsubscribed_at")
      .eq("id", input.leadId)
      .single();
    if (!lead) return { ok: false, error: "Lead not found." };
    if (lead.unsubscribed_at) {
      return { ok: false, error: "This family has unsubscribed from email." };
    }
    recipientEmail = (lead.email as string | null) ?? null;
    recipientCampusId = (lead.campus_id as string | null) ?? null;
  } else if (input.applicationId) {
    const { data: app } = await supabase
      .from("application")
      .select("id, campus_id, guardian:guardian_id (user_id, email)")
      .eq("id", input.applicationId)
      .single();
    if (!app) return { ok: false, error: "Application not found." };
    const guardian = app.guardian as unknown as
      | { user_id: string | null; email: string | null }
      | null;
    recipientEmail = guardian?.email ?? null;
    recipientCampusId = (app.campus_id as string | null) ?? null;
    recipientUserId = guardian?.user_id ?? null;
  }

  // Campus scope — empty accessibleCampusIds means org-wide (system) access,
  // matching getAccessibleCampusIds elsewhere in the app.
  if (
    accessibleCampusIds.length > 0 &&
    (!recipientCampusId || !accessibleCampusIds.includes(recipientCampusId))
  ) {
    return { ok: false, error: "Not on a campus you can access." };
  }

  if (!recipientEmail) {
    return { ok: false, error: "No email on file for this family." };
  }

  // Address-level suppression (bounce/complaint) applies regardless of
  // whether this is a lead or an applied family — it's keyed on the address.
  const suppressed = await getSuppressedEmails([recipientEmail]);
  if (suppressed.has(recipientEmail.toLowerCase())) {
    return {
      ok: false,
      error: "This email address is suppressed — a previous message bounced or was marked as spam.",
    };
  }

  if (!isEmailConfigured()) {
    return { ok: false, error: "Email isn't connected in this environment." };
  }

  const { data: campus } = await supabase
    .from("campus")
    .select("name, email")
    .eq("id", recipientCampusId ?? "")
    .single();
  const campusName = (campus?.name as string | null) ?? "Rooted Schools";
  const campusEmail = (campus?.email as string | null) ?? undefined;

  const template = staffComposedEmail({ subject, message, campusName });

  const sendResult = await sendEmail({
    to: recipientEmail,
    subject: template.subject,
    html: template.html,
    text: template.text,
    replyTo: campusEmail,
  });

  if (!sendResult.ok) {
    return { ok: false, error: sendResult.error ?? "Delivery failed." };
  }

  // Log the send on the family's real history — only reached on a confirmed
  // provider success, so this is never a claim ahead of the facts.
  const excerpt = message.length > 200 ? `${message.slice(0, 200)}…` : message;
  if (input.leadId) {
    // logLeadActivity also stamps lead.last_contact_at and (for a
    // brand-new lead) advances the stage to "contacted" — same as a logged
    // call — since "email" is one of CONTACT_ACTIVITY_TYPES.
    const activityResult = await logLeadActivity(
      input.leadId,
      "email",
      `Email sent: ${subject} — ${excerpt}`,
      actorId
    );
    if (activityResult.error) {
      console.error("[sendOneOffEmail] lead_activity log failed", activityResult.error);
    }
  } else if (input.applicationId) {
    const now = new Date().toISOString();
    const { error: logError } = await supabase.from("communication_log").insert({
      campus_id: recipientCampusId,
      recipient_user_id: recipientUserId,
      recipient_address: recipientEmail,
      channel: "email",
      subject,
      body: message,
      status: "delivered",
      sent_at: now,
      delivered_at: now,
    });
    if (logError) {
      console.error("[sendOneOffEmail] communication_log insert failed", logError.message);
    }

    // The application detail page's "Internal notes" list (ContextRail) is
    // what staff actually look at — communication_log isn't surfaced
    // anywhere on that page — so the send also lands there or it's
    // effectively invisible to the reviewing staff member.
    const noteResult = await createNote({
      entity_type: "application",
      entity_id: input.applicationId,
      campus_id: recipientCampusId ?? undefined,
      content: `Email sent: ${subject}\n\n${excerpt}`,
      is_internal: true,
    });
    if (noteResult.error) {
      console.error("[sendOneOffEmail] note log failed", noteResult.error);
    }
  }

  return { ok: true };
}
