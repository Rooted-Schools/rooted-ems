/**
 * Enrollment event notifications.
 *
 * All functions create `in_app` notifications, which work without any external
 * provider.  Family-facing milestone events (application received, offer
 * extended, offer accepted, registration complete, waitlist promotion) also
 * send a bilingual email to the guardian via Resend (lib/email.ts).  When
 * RESEND_API_KEY is unset, email sending is a silent no-op.
 *
 * Rule: never throw.  A notification failure must never roll back the
 * primary operation that triggered it.  In-app and email delivery are fired
 * independently — one failing never blocks the other.
 *
 * DELIVERY RECORD: every automated email and text written by this module also
 * writes one communication_log row per send attempt — the same table the staff
 * one-off send writes (sendOneOffEmail in lib/mutations/communications.ts) and
 * the same table the in-app path already writes through sendNotification. Until
 * this existed, a family saying "we never got the offer email" met a system
 * that had no record the message was ever attempted: the only trace of a
 * failure was a console.error nobody keeps.
 *
 * Two rules govern what those rows hold:
 *   1. The row records the ATTEMPT and its outcome, never a claim ahead of the
 *      provider — status is `sent` only when the provider confirmed, `failed`
 *      otherwise with the provider's own error text.
 *   2. The row records the TEMPLATE, not the rendered message. Family message
 *      subjects and bodies render the student's first name, and a recent pass
 *      deliberately removed student names from stored notification subjects.
 *      communication_log is readable by every staff member at the campus, so
 *      the template key identifies what was sent without putting a student's
 *      name in a field that was not already carrying one.
 *
 * Logging is best-effort in the strictest sense: a logging failure never
 * breaks a notification, never blocks the other channel, and never turns a
 * message the provider accepted into a reported failure.
 */

import { createServiceRoleClient } from "@rooted-ems/database/server";
import { sendNotification } from "@/lib/mutations";
import { sendEmail } from "@/lib/email";
import { sendSms, SMS_NOT_CONFIGURED } from "@/lib/sms";
import * as emailTemplates from "@/lib/email-templates";
import type { EmailTemplate } from "@/lib/email-templates";
import { recordWaitlistPositionHistory } from "@/lib/mutations/waitlist-history";
import { registrationNudgeSubject, registrationNudgeBody, registrationNudgeSms } from "@/lib/nudge-copy";
import { getCampusLogoAbsoluteUrl } from "@/lib/campus-identity";
import { getCampusMessageOverride } from "@/lib/queries/message-overrides";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Base URL used in SMS bodies (emails resolve their own via templates). */
const APP_LINK = process.env.NEXT_PUBLIC_APP_URL ?? "https://enroll.rootedschool.org";

interface GuardianContact {
  userId: string | null;
  email: string | null;
  phone: string | null;
  /** TCPA opt-in — automated texts go out only when this is true. */
  smsConsent: boolean;
}

/**
 * Resolve the Supabase auth user_id and contact details for the guardian on a
 * given application — one query for all needs.  Fields resolve to null on
 * failure so callers degrade gracefully.
 */
async function getGuardianContact(applicationId: string): Promise<GuardianContact> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("application")
    .select("guardian_id, guardian:guardian_id (user_id, email, phone, sms_consent)")
    .eq("id", applicationId)
    .single();
  if (error) {
    console.error("[getGuardianContact] query error", error.message, { applicationId });
    return { userId: null, email: null, phone: null, smsConsent: false };
  }
  const row = data as unknown as Record<string, unknown> | null;
  const guardian = row?.guardian as Record<string, string | boolean | null> | null;
  const userId = (guardian?.user_id as string | null) ?? null;
  if (!userId) {
    console.warn("[getGuardianContact] no user_id found", {
      applicationId,
      guardianId: row?.guardian_id ?? null,
    });
  }
  return {
    userId,
    email: (guardian?.email as string | null) ?? null,
    phone: (guardian?.phone as string | null) ?? null,
    smsConsent: guardian?.sms_consent === true,
  };
}

// ─── Delivery record (communication_log) ─────────────────────────────────────

/**
 * Who a send was for and what was sent, supplied by every call site so the
 * delivery record can answer a parent's phone call. Required, not optional:
 * an automated family message with no recorded campus or template is exactly
 * the un-answerable send this record exists to end.
 */
export interface DeliveryLogContext {
  /** Campus the message belongs to — the scope staff filter the log by. */
  campusId?: string | null;
  /** Guardian's auth user id, when the family has a portal account. */
  recipientUserId?: string | null;
  /**
   * The email template that was rendered (e.g. "offerExtended"), or for a
   * text, the message this call site sends. Recorded INSTEAD of the rendered
   * subject and body — see the note at the top of this file.
   */
  templateKey: string;
  /** 00045 engagement tracking — lead-oriented flows only. */
  leadId?: string;
  /** 00045 send kind. Defaults to the template key. */
  kind?: string;
}

/** One communication_log row, in the shape sendOneOffEmail already writes. */
export interface DeliveryLogRow {
  campus_id: string | null;
  recipient_user_id: string | null;
  recipient_address: string;
  channel: "email" | "sms";
  subject: string;
  body: string;
  status: "sent" | "failed";
  sent_at: string | null;
  delivered_at: string | null;
  error_message: string | null;
  external_id: string | null;
}

/**
 * Shape the delivery record for one send attempt. Pure — no I/O — so the
 * privacy rule (template key in, student name out) and the honesty rule
 * (`sent` only on a confirmed provider success) are testable without a
 * database or a provider.
 *
 * `delivered_at` is deliberately left null even on success: Resend accepting
 * a message is not the mailbox receiving it, and the Resend webhook is what
 * knows the difference. Stamping it here would tell staff a message was
 * delivered when all we know is that it was sent.
 */
export function buildDeliveryLogRow(input: {
  channel: "email" | "sms";
  recipientAddress: string;
  logTag: string;
  context: DeliveryLogContext;
  ok: boolean;
  error?: string;
  /** Provider message id, when the provider returned one (Resend). */
  providerMessageId?: string;
  at: string;
}): DeliveryLogRow {
  const channelWord = input.channel === "email" ? "email" : "text message";
  return {
    campus_id: input.context.campusId ?? null,
    recipient_user_id: input.context.recipientUserId ?? null,
    recipient_address: input.recipientAddress,
    channel: input.channel,
    // Label, not the rendered subject: family subjects name the student.
    subject: `Automated ${channelWord}: ${input.context.templateKey}`,
    body:
      `Automated ${channelWord} sent by ${input.logTag} from the ` +
      `${input.context.templateKey} template. The message text is not copied ` +
      `here because it names the student.`,
    status: input.ok ? "sent" : "failed",
    sent_at: input.ok ? input.at : null,
    delivered_at: null,
    error_message: input.ok ? null : input.error ?? "Delivery failed.",
    external_id: input.providerMessageId ?? null,
  };
}

/**
 * Write one delivery record. Swallows everything: a family that received
 * their offer email must never be reported as a failure because an audit
 * insert did not land, and a notification must never be blocked by one.
 */
async function recordDeliveryAttempt(row: DeliveryLogRow, logTag: string): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("communication_log").insert(row);
    if (error) {
      console.error(`[${logTag}] communication_log insert failed`, error.message, {
        channel: row.channel,
        status: row.status,
      });
    }
  } catch (err) {
    console.error(`[${logTag}] communication_log insert threw`, err instanceof Error ? err.message : err);
  }
}

/**
 * Text the guardian — only when they explicitly opted in AND have a phone on
 * file. The consent gate lives here, not in lib/sms.ts, so every SMS in the
 * system passes through it. Never throws.
 *
 * A send that never happens (no consent, no phone) writes no delivery record:
 * the record is of attempts, and claiming a failed send for a family we were
 * never allowed to text would misstate both the consent state and the reach.
 */
async function smsGuardian(
  contact: Pick<GuardianContact, "phone" | "smsConsent">,
  body: string,
  logTag: string,
  context: DeliveryLogContext
): Promise<boolean> {
  if (!contact.smsConsent || !contact.phone) return false;
  const result = await sendSms({ to: contact.phone, body });
  if (!result.ok && result.error !== SMS_NOT_CONFIGURED) {
    console.error(`[${logTag}] sms failed`, result.error);
  }
  await recordDeliveryAttempt(
    buildDeliveryLogRow({
      channel: "sms",
      recipientAddress: contact.phone,
      logTag,
      context,
      ok: result.ok,
      error: result.error,
      at: new Date().toISOString(),
    }),
    logTag
  );
  return result.ok;
}

/**
 * Resolve the guardian's auth user_id and contact email for a given enrollment.
 */
async function getGuardianContactByEnrollment(enrollmentId: string): Promise<GuardianContact & { applicationId: string | null }> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("enrollment")
    .select("application_id, application:application_id (guardian:guardian_id (user_id, email, phone, sms_consent))")
    .eq("id", enrollmentId)
    .single();
  if (error) {
    console.error("[getGuardianContactByEnrollment] query error", error.message, { enrollmentId });
    return { userId: null, email: null, phone: null, smsConsent: false, applicationId: null };
  }
  const row = data as unknown as Record<string, unknown> | null;
  const applicationId = (row?.application_id as string) ?? null;
  const application = row?.application as Record<string, unknown> | null;
  const guardian = application?.guardian as Record<string, string | boolean | null> | null;
  return {
    userId: (guardian?.user_id as string | null) ?? null,
    email: (guardian?.email as string | null) ?? null,
    phone: (guardian?.phone as string | null) ?? null,
    smsConsent: guardian?.sms_consent === true,
    applicationId,
  };
}

/** First token of a full student name, for email greetings. */
function firstNameOf(studentName?: string): string | undefined {
  return studentName?.trim().split(/\s+/)[0] || undefined;
}

/**
 * Send a templated email to the guardian.  No-op when the guardian has no
 * email on file.  Never throws.
 *
 * Every attempt that reaches the provider writes a delivery record, including
 * the "email not configured" case: in an environment with no RESEND_API_KEY
 * nothing reaches the family, and a log that quietly omitted those sends would
 * be the same silence this record exists to end.
 *
 * `meta` always goes to lib/email.ts now, so a confirmed send is recorded in
 * email_event and the Resend webhook can stamp delivered/opened/clicked
 * against it. The template label rides along as `logSubject` so the student's
 * name stays out of that row (see lib/email.ts).
 */
async function emailGuardian(
  email: string | null,
  template: EmailTemplate,
  logTag: string,
  replyTo: string | null | undefined,
  context: DeliveryLogContext
): Promise<boolean> {
  if (!email) return false;
  const result = await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    replyTo: replyTo ?? undefined,
    meta: {
      leadId: context.leadId,
      kind: context.kind ?? context.templateKey,
      logSubject: `Automated email: ${context.templateKey}`,
    },
  });
  if (!result.ok && result.error !== "email not configured") {
    console.error(`[${logTag}] email failed`, result.error);
  }
  await recordDeliveryAttempt(
    buildDeliveryLogRow({
      channel: "email",
      recipientAddress: email,
      logTag,
      context,
      ok: result.ok,
      error: result.error,
      providerMessageId: result.id,
      at: new Date().toISOString(),
    }),
    logTag
  );
  // True only when the provider confirmed the send — callers that record
  // "sent" on a timeline must never log an attempt as a delivery.
  return result.ok;
}

/**
 * What actually reached the family, per channel. Callers that record a
 * "notified" state (the lottery notification ledger) must read this rather
 * than treating "did not throw" as delivery: these functions never throw, and
 * a guardian with no email and no portal account produces zero channels.
 */
export interface NotificationDelivery {
  inApp: boolean;
  email: boolean;
  sms: boolean;
}

const NO_DELIVERY: NotificationDelivery = { inApp: false, email: false, sms: false };

/** True when at least one channel actually delivered. */
export function anyChannelDelivered(delivery: NotificationDelivery): boolean {
  return delivery.inApp || delivery.email || delivery.sms;
}

interface CampusInfo {
  name: string;
  /** Campus inbox — used as the email Reply-To so family replies reach the school, not RSF central. */
  email: string | null;
  /**
   * IANA timezone for the campus (campus.timezone). Deadlines are rendered in
   * it, so "respond by Friday" means the family's Friday and not the server's.
   */
  timezone: string | null;
  /**
   * Absolute URL to the campus's logo (lib/campus-identity.ts), for the
   * email header. Undefined when the campus has no known short_code /
   * identity — callers pass it straight through as `campusLogoUrl`, and the
   * email header degrades to its current text-only look, never a broken
   * image.
   */
  logoUrl: string | undefined;
}

/**
 * The single place notify.ts resolves a campusId into the name/email/logo
 * every notification and email needs. Every call site below goes through
 * this function — see the module-level comment for why that matters for
 * threading the campus logo into email headers.
 */
async function resolveCampus(campusId?: string): Promise<CampusInfo> {
  if (!campusId) return { name: "your school", email: null, timezone: null, logoUrl: undefined };
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("campus")
    .select("name, email, short_code, timezone")
    .eq("id", campusId)
    .single();
  const row = data as unknown as Record<string, string | null> | null;
  return {
    name: row?.name ?? "your school",
    email: row?.email ?? null,
    timezone: row?.timezone ?? null,
    logoUrl: getCampusLogoAbsoluteUrl(row?.short_code, APP_LINK),
  };
}

/**
 * Render a deadline in the campus's own timezone. A 16:00 Pacific cutoff
 * stored as UTC renders as the NEXT day for a server in UTC, which is how a
 * family ends up told the wrong date for the day their seat expires.
 */
function formatDeadline(expiresAt: string, locale: string, timezone: string | null): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    month: "long",
    day: "numeric",
  };
  if (timezone) options.timeZone = timezone;
  try {
    return new Date(expiresAt).toLocaleDateString(locale, options);
  } catch {
    // An unrecognized timezone must never take down a notification.
    return new Date(expiresAt).toLocaleDateString(locale, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }
}

/** Returns true only when the in-app notification was actually recorded. */
async function notify(params: {
  userId: string;
  subject: string;
  body: string;
  link: string;
  campusId?: string;
  logTag: string;
}): Promise<boolean> {
  const result = await sendNotification({
    recipientUserIds: [params.userId],
    campusId: params.campusId,
    channel: "in_app",
    subject: params.subject,
    body: params.body,
    link: params.link,
  });
  if (result.error) {
    console.error(`[${params.logTag}]`, result.error);
    return false;
  }
  return true;
}

// ─── Application notifications ────────────────────────────────────────────────

/** Family submits an application — confirm receipt. */
export async function notifyFamilyApplicationReceived({
  applicationId,
  studentName,
  campusId,
}: {
  applicationId: string;
  studentName?: string;
  campusId?: string;
}): Promise<void> {
  const { userId, email } = await getGuardianContact(applicationId);
  if (!userId && !email) return;
  const { name: campusName, email: campusEmail, logoUrl: campusLogoUrl } = await resolveCampus(campusId);
  await Promise.all([
    userId
      ? notify({
          userId,
          subject: `Application received${studentName ? ` for ${studentName}` : ""}`,
          body: `We've received your enrollment application${studentName ? ` for ${studentName}` : ""} at ${campusName}. We'll be in touch as we review it.`,
          link: `/family/applications`,
          campusId,
          logTag: "notifyFamilyApplicationReceived",
        })
      : Promise.resolve(),
    emailGuardian(
      email,
      emailTemplates.applicationReceived({ studentFirstName: firstNameOf(studentName), campusName, campusLogoUrl }),
      "notifyFamilyApplicationReceived",
      campusEmail,
      { campusId, recipientUserId: userId, templateKey: "applicationReceived" }
    ),
  ]);
}

/** Staff marks application as verified / moves it to lottery. */
export async function notifyFamilyApplicationVerified({
  applicationId,
  studentName,
  campusId,
}: {
  applicationId: string;
  studentName?: string;
  campusId?: string;
}): Promise<void> {
  const { userId } = await getGuardianContact(applicationId);
  if (!userId) return;
  const { name: campusName } = await resolveCampus(campusId);
  await notify({
    userId,
    subject: `Application verified${studentName ? ` for ${studentName}` : ""}`,
    body: `Your application${studentName ? ` for ${studentName}` : ""} at ${campusName} has been verified and is ready for the enrollment lottery.`,
    link: `/family/applications`,
    campusId,
    logTag: "notifyFamilyApplicationVerified",
  });
}

/** Staff marks application as needs_info. */
export async function notifyFamilyNeedsInfo({
  applicationId,
  applicationIdForLink,
  message,
  campusId,
}: {
  applicationId: string;
  applicationIdForLink: string;
  message?: string;
  campusId?: string;
}): Promise<void> {
  const { userId } = await getGuardianContact(applicationId);
  if (!userId) return;
  await notify({
    userId,
    subject: "Your application needs attention",
    body: message ?? "Our enrollment team needs additional information to process your application. Open your application to see what we need.",
    link: `/family/applications/${applicationIdForLink}`,
    campusId,
    logTag: "notifyFamilyNeedsInfo",
  });
}

/**
 * Application placed on waitlist. Full fan-out: in-app + bilingual email +
 * consented SMS — a family that was in the lottery must hear their result,
 * so (like notifyFamilyOfOffer) this is transactional and is NOT gated by
 * marketing suppression. `position` is optional so existing callers
 * (lib/mutations/bulk.ts, lib/mutations/applications.ts) keep compiling and
 * behaving unchanged — they just don't have a rank number to include.
 */
export async function notifyFamilyApplicationWaitlisted({
  applicationId,
  studentName,
  campusId,
  position,
}: {
  applicationId: string;
  studentName?: string;
  campusId?: string;
  position?: number;
}): Promise<NotificationDelivery> {
  const contact = await getGuardianContact(applicationId);
  const { userId, email } = contact;
  if (!userId && !email) return { ...NO_DELIVERY };
  const { name: campusName, email: campusEmail, logoUrl: campusLogoUrl } = await resolveCampus(campusId);
  const studentFirstName = firstNameOf(studentName);
  const positionSuffix = position != null ? ` — currently #${position}` : "";
  const [inApp, emailed, texted] = await Promise.all([
    userId
      ? notify({
          userId,
          subject: `You're on the waitlist at ${campusName}`,
          body: `${studentName ? `${studentName}'s application` : "Your application"} has been placed on the waitlist at ${campusName}${positionSuffix}. We'll contact you as soon as a seat becomes available.`,
          link: `/family/applications`,
          campusId,
          logTag: "notifyFamilyApplicationWaitlisted",
        })
      : Promise.resolve(false),
    emailGuardian(
      email,
      emailTemplates.lotteryResultWaitlisted({ studentFirstName, campusName, position, campusLogoUrl }),
      "notifyFamilyApplicationWaitlisted",
      campusEmail,
      { campusId, recipientUserId: userId, templateKey: "lotteryResultWaitlisted" }
    ),
    smsGuardian(
      contact,
      `Rooted Schools: The lottery for ${campusName} has been held. ${studentFirstName ?? "Your student"} is ${
        position != null ? `#${position} on the waitlist` : "on the waitlist"
      } — we'll reach out if a seat opens. See your dashboard: ${APP_LINK}/family/dashboard\nEl sorteo para ${campusName} se realizó. ${
        studentFirstName ?? "Su estudiante"
      } está en la lista de espera — le avisaremos si se abre un cupo.`,
      "notifyFamilyApplicationWaitlisted",
      { campusId, recipientUserId: userId, templateKey: "lotteryResultWaitlistedSms" }
    ),
  ]);

  return { inApp: inApp === true, email: emailed === true, sms: texted === true };
}

/**
 * Families near the front get an email as well as the in-app notification;
 * further back, in-app only. Keeps a 30-family list from emailing 29 people
 * every time one student leaves, while the families for whom movement is
 * actionable hear about it on the channel they actually check.
 */
const WAITLIST_EMAIL_TOP_N = 3;

/**
 * An active entry left the waitlist (promoted or removed) — everyone behind
 * it just moved up one place. Notify each affected family of their new
 * effective position (rank among still-active entries, not the raw
 * position_number, which is never renumbered).
 */
export async function notifyWaitlistMovement({
  waitlistId,
  removedPositionNumber,
  campusId,
}: {
  waitlistId: string;
  removedPositionNumber: number;
  campusId?: string;
}): Promise<void> {
  try {
    const supabase = createServiceRoleClient();

    // All still-active entries, in line order — ranks derive from this list.
    const { data: active, error } = await supabase
      .from("waitlist_position")
      .select("id, application_id, position_number")
      .eq("waitlist_id", waitlistId)
      .is("removed_at", null)
      .order("position_number", { ascending: true });

    if (error) {
      console.error("[notifyWaitlistMovement]", error.message, { waitlistId });
      return;
    }

    const rows = (active ?? []) as Array<{ id: string; application_id: string; position_number: number }>;
    const improved = rows
      .map((row, index) => ({ ...row, rank: index + 1 }))
      .filter((row) => row.position_number > removedPositionNumber);
    if (improved.length === 0) return;

    // Log the honest new effective rank for every family who moved up so the
    // family portal can show real movement later — never inferred. One row
    // per affected waitlist_position; failures here never block notification.
    await Promise.all(
      improved.map((row) =>
        recordWaitlistPositionHistory({
          waitlistPositionId: row.id,
          applicationId: row.application_id,
          positionNumber: row.rank,
          changeType: "recalculated",
          reason: "Moved up after another family left the waitlist",
        })
      )
    );

    // Batch-resolve guardian contact + student name for the affected apps
    const { data: apps, error: appsError } = await supabase
      .from("application")
      .select("id, guardian:guardian_id (user_id, email), student:student_id (first_name)")
      .in("id", improved.map((row) => row.application_id));

    if (appsError) {
      console.error("[notifyWaitlistMovement] apps", appsError.message, { waitlistId });
      return;
    }

    const appById = new Map(
      (apps ?? []).map((a: Record<string, unknown>) => [a.id as string, a])
    );
    const { name: campusName, email: campusEmail, logoUrl: campusLogoUrl } = await resolveCampus(campusId);
    const total = rows.length;

    for (const row of improved) {
      const app = appById.get(row.application_id);
      if (!app) continue;
      const guardian = app.guardian as Record<string, string | null> | null;
      const student = app.student as Record<string, string | null> | null;
      const studentFirst = student?.first_name ?? undefined;

      if (guardian?.user_id) {
        await notify({
          userId: guardian.user_id,
          subject: `You moved up the waitlist at ${campusName}`,
          body: `${studentFirst ?? "Your student"} is now #${row.rank} of ${total} on the waitlist at ${campusName}.`,
          link: `/family/dashboard`,
          campusId,
          logTag: "notifyWaitlistMovement",
        });
      }

      if (row.rank <= WAITLIST_EMAIL_TOP_N) {
        await emailGuardian(
          guardian?.email ?? null,
          emailTemplates.waitlistPositionImproved({
            studentFirstName: studentFirst,
            campusName,
            position: row.rank,
            campusLogoUrl,
          }),
          "notifyWaitlistMovement",
          campusEmail,
          {
            campusId,
            recipientUserId: guardian?.user_id ?? null,
            templateKey: "waitlistPositionImproved",
          }
        );
      }
    }
  } catch (err) {
    // Never let a movement notification failure surface to the caller.
    console.error("[notifyWaitlistMovement] unexpected", err);
  }
}

// ─── Offer notifications ──────────────────────────────────────────────────────

/**
 * A seat offer has been made.  Pass `viaWaitlist: true` when the offer was
 * created by a waitlist promotion so the email leads with "a seat opened".
 */
export async function notifyFamilyOfOffer({
  applicationId,
  offerId,
  campusName: campusNameProp,
  studentName,
  expiresAt,
  campusId,
  viaWaitlist,
}: {
  applicationId: string;
  offerId: string;
  campusName?: string;
  studentName?: string;
  expiresAt: string;
  campusId?: string;
  viaWaitlist?: boolean;
}): Promise<NotificationDelivery> {
  const contact = await getGuardianContact(applicationId);
  const { userId, email } = contact;
  if (!userId && !email) return { ...NO_DELIVERY };
  const {
    name: resolvedCampusName,
    email: campusEmail,
    timezone: campusTimezone,
    logoUrl: campusLogoUrl,
  } = await resolveCampus(campusId);
  const campusName = campusNameProp ?? resolvedCampusName;
  const deadline = formatDeadline(expiresAt, "en-US", campusTimezone);
  const deadlineEs = formatDeadline(expiresAt, "es-US", campusTimezone);
  const studentFirstName = firstNameOf(studentName);
  const template = viaWaitlist
    ? emailTemplates.waitlistPromoted({ studentFirstName, campusName, campusLogoUrl, expiresAt, offerId, timeZone: campusTimezone })
    : emailTemplates.offerExtended({ studentFirstName, campusName, expiresAt, campusLogoUrl, offerId, timeZone: campusTimezone });
  const [inApp, emailed, texted] = await Promise.all([
    userId
      ? notify({
          userId,
          subject: studentName ? `Seat offer for ${studentName} at ${campusName}` : `You have a seat offer at ${campusName}`,
          body: `Congratulations! A seat has been offered${studentName ? ` for ${studentName}` : ""} at ${campusName}. Please respond by ${deadline} to secure your spot.`,
          link: `/family/offers/${offerId}`,
          campusId,
          logTag: "notifyFamilyOfOffer",
        })
      : Promise.resolve(false),
    emailGuardian(email, template, "notifyFamilyOfOffer", campusEmail, {
      campusId,
      recipientUserId: userId,
      templateKey: viaWaitlist ? "waitlistPromoted" : "offerExtended",
    }),
    smsGuardian(
      contact,
      `Rooted Schools: A seat has been offered${studentFirstName ? ` for ${studentFirstName}` : ""} at ${campusName}! Respond by ${deadline}: ${APP_LINK}/family/offers/${offerId}\nSe ofreció un cupo. Responda antes del ${deadlineEs}.`,
      "notifyFamilyOfOffer",
      {
        campusId,
        recipientUserId: userId,
        templateKey: viaWaitlist ? "waitlistPromotedSms" : "offerExtendedSms",
      }
    ),
  ]);

  return { inApp: inApp === true, email: emailed === true, sms: texted === true };
}

/**
 * A pending offer is approaching its deadline — send the family an urgent
 * (but warm) email reminder.  Intended to be called from a reminder cron.
 */
export async function notifyFamilyOfferExpiringSoon({
  applicationId,
  offerId,
  studentName,
  expiresAt,
  campusId,
}: {
  applicationId: string;
  offerId: string;
  studentName?: string;
  expiresAt: string;
  campusId?: string;
}): Promise<void> {
  const contact = await getGuardianContact(applicationId);
  const { userId, email } = contact;
  if (!userId && !email) return;
  const {
    name: campusName,
    email: campusEmail,
    timezone: campusTimezone,
    logoUrl: campusLogoUrl,
  } = await resolveCampus(campusId);
  const deadline = formatDeadline(expiresAt, "en-US", campusTimezone);
  const deadlineEs = formatDeadline(expiresAt, "es-US", campusTimezone);
  await Promise.all([
    userId
      ? notify({
          userId,
          subject: `Your seat offer at ${campusName} expires soon`,
          body: `Your seat offer${studentName ? ` for ${studentName}` : ""} at ${campusName} expires on ${deadline}. Please respond before the deadline to keep your spot.`,
          link: `/family/offers/${offerId}`,
          campusId,
          logTag: "notifyFamilyOfferExpiringSoon",
        })
      : Promise.resolve(),
    emailGuardian(
      email,
      emailTemplates.offerExpiringSoon({ studentFirstName: firstNameOf(studentName), campusName, expiresAt, campusLogoUrl, offerId, timeZone: campusTimezone }),
      "notifyFamilyOfferExpiringSoon",
      campusEmail,
      { campusId, recipientUserId: userId, templateKey: "offerExpiringSoon" }
    ),
    smsGuardian(
      contact,
      `Rooted Schools: Your seat offer at ${campusName} expires ${deadline}. Respond now to keep your spot: ${APP_LINK}/family/offers/${offerId}\nSu oferta de cupo vence el ${deadlineEs}. Responda ahora.`,
      "notifyFamilyOfferExpiringSoon",
      { campusId, recipientUserId: userId, templateKey: "offerExpiringSoonSms" }
    ),
  ]);
}

// ─── Document notifications ───────────────────────────────────────────────────

/** Staff rejects a document — family must re-upload. */
export async function notifyFamilyDocumentRejected({
  applicationId,
  documentType,
  reason,
  campusId,
}: {
  applicationId: string;
  documentType: string;
  reason: string;
  campusId?: string;
}): Promise<void> {
  const contact = await getGuardianContact(applicationId);
  const { userId } = contact;
  if (!userId) return;
  const readableType = documentType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  await Promise.all([
    notify({
      userId,
      subject: `Please re-upload your ${readableType}`,
      body: `We reviewed your ${readableType} and need a new copy. Reason: ${reason}. Log in to your documents page and upload a replacement to keep your enrollment moving.`,
      link: `/family/documents`,
      campusId,
      logTag: "notifyFamilyDocumentRejected",
    }),
    // The SMS stays generic on purpose — a text is visible on a lock screen,
    // and a document type like "Iep Records" would disclose a student's
    // disability-services status to anyone who glances at the phone. The
    // specific type is only named in the in-app and email versions above,
    // where the family has actually signed in.
    smsGuardian(
      contact,
      `Rooted Schools: We need a new copy of a document for your application. Upload here: ${APP_LINK}/family/documents\nNecesitamos una nueva copia de un documento para su solicitud. Súbala en el enlace.`,
      "notifyFamilyDocumentRejected",
      // The template key stays as generic as the message: naming the document
      // type here would put a student's disability-services status in the log
      // for exactly the reason the SMS body avoids it.
      { campusId, recipientUserId: userId, templateKey: "documentRejectedSms" }
    ),
  ]);
}

/** Staff verifies a document — let the family know. */
export async function notifyFamilyDocumentVerified({
  applicationId,
  documentType,
  campusId,
}: {
  applicationId: string;
  documentType: string;
  campusId?: string;
}): Promise<void> {
  const { userId } = await getGuardianContact(applicationId);
  if (!userId) return;
  const readableType = documentType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  await notify({
    userId,
    subject: `${readableType} verified`,
    body: `Your ${readableType} has been reviewed and verified by the enrollment team. You're all set on this one.`,
    link: `/family/documents`,
    campusId,
    logTag: "notifyFamilyDocumentVerified",
  });
}

// ─── Registration notifications ───────────────────────────────────────────────

/**
 * Registration packet is ready for the family to complete.  Fires right
 * after an offer is accepted, so the email doubles as the offer-accepted
 * congratulations with registration as the next step.
 */
export async function notifyFamilyRegistrationReady({
  applicationId,
  studentName,
  campusId,
}: {
  applicationId: string;
  studentName?: string;
  campusId?: string;
}): Promise<void> {
  const { userId, email } = await getGuardianContact(applicationId);
  if (!userId && !email) return;
  const { name: campusName, email: campusEmail, logoUrl: campusLogoUrl } = await resolveCampus(campusId);
  await Promise.all([
    userId
      ? notify({
          userId,
          subject: `Registration is ready${studentName ? ` for ${studentName}` : ""}`,
          body: `Your enrollment packet is ready to complete${studentName ? ` for ${studentName}` : ""} at ${campusName}. Please log in and complete all required items to finalize enrollment.`,
          link: `/family/registration`,
          campusId,
          logTag: "notifyFamilyRegistrationReady",
        })
      : Promise.resolve(),
    emailGuardian(
      email,
      emailTemplates.offerAccepted({ studentFirstName: firstNameOf(studentName), campusName, campusLogoUrl }),
      "notifyFamilyRegistrationReady",
      campusEmail,
      { campusId, recipientUserId: userId, templateKey: "offerAccepted" }
    ),
  ]);
}

/** Family submits their registration packet — confirm receipt. */
export async function notifyFamilyRegistrationSubmitted({
  enrollmentId,
  studentName,
  campusId,
}: {
  enrollmentId: string;
  studentName?: string;
  campusId?: string;
}): Promise<void> {
  const { userId } = await getGuardianContactByEnrollment(enrollmentId);
  if (!userId) return;
  const { name: campusName } = await resolveCampus(campusId);
  await notify({
    userId,
    subject: `Registration packet submitted${studentName ? ` for ${studentName}` : ""}`,
    body: `We've received ${studentName ? `${studentName}'s` : "your"} registration packet at ${campusName}. Our team will review it and reach out when it's verified.`,
    link: `/family/registration`,
    campusId,
    logTag: "notifyFamilyRegistrationSubmitted",
  });
}

/** Staff fully verifies the registration packet — enrollment is complete. */
export async function notifyFamilyRegistrationComplete({
  enrollmentId,
  studentName,
  campusId,
}: {
  enrollmentId: string;
  studentName?: string;
  campusId?: string;
}): Promise<void> {
  const contact = await getGuardianContactByEnrollment(enrollmentId);
  const { userId, email } = contact;
  if (!userId && !email) return;
  const { name: campusName, email: campusEmail, logoUrl: campusLogoUrl } = await resolveCampus(campusId);
  const studentFirstName = firstNameOf(studentName);
  await Promise.all([
    userId
      ? notify({
          userId,
          // Completing the packet moves the application to placement_review,
          // not enrolled. Saying "officially enrolled" here told families
          // something that had not happened yet; the real enrollment message
          // is notifyFamilyStudentEnrolled, sent when staff finish placement.
          subject: `Registration complete${studentName ? ` for ${studentName}` : ""}`,
          body: `All registration items have been verified. Our team at ${campusName} is finishing a final placement review. Nothing more is needed from you right now, and we will let you know as soon as enrollment is confirmed.`,
          link: `/family/registration`,
          campusId,
          logTag: "notifyFamilyRegistrationComplete",
        })
      : Promise.resolve(),
    emailGuardian(
      email,
      emailTemplates.registrationComplete({ studentFirstName, campusName, campusLogoUrl }),
      "notifyFamilyRegistrationComplete",
      campusEmail,
      { campusId, recipientUserId: userId, templateKey: "registrationComplete" }
    ),
    smsGuardian(
      contact,
      `Rooted Schools: registration is complete for ${studentFirstName ?? "your student"} at ${campusName}. We are finishing a final placement review and will confirm enrollment soon. Nothing is needed from you now.\nRooted Schools: la inscripcion esta completa para ${studentFirstName ?? "su estudiante"} en ${campusName}. Estamos terminando una revision final de colocacion y le confirmaremos pronto. No necesita hacer nada ahora.`,
      "notifyFamilyRegistrationComplete",
      { campusId, recipientUserId: userId, templateKey: "registrationCompleteSms" }
    ),
  ]);
}

/**
 * Registration packet has been stalled on missing items — nudge the family.
 * Called by the nudge cron, which owns the throttle (registration_packet.
 * last_nudged_at), so this function just delivers on all channels.
 */
export async function notifyFamilyRegistrationNudge({
  applicationId,
  studentName,
  campusId,
  missingNames,
}: {
  applicationId: string;
  studentName?: string;
  campusId?: string;
  missingNames: string[];
}): Promise<void> {
  const contact = await getGuardianContact(applicationId);
  const { userId, email } = contact;
  if (!userId && !email) return;
  const { name: campusName, email: campusEmail, logoUrl: campusLogoUrl } = await resolveCampus(campusId);
  const studentFirstName = firstNameOf(studentName);
  const count = missingNames.length;
  // Copy lives in lib/nudge-copy.ts (pure module) so the staff preview on
  // /staff/today shows exactly what is sent here.
  await Promise.all([
    userId
      ? notify({
          userId,
          subject: registrationNudgeSubject(count),
          body: registrationNudgeBody({ studentName, campusName, missingNames }),
          link: `/family/registration`,
          campusId,
          logTag: "notifyFamilyRegistrationNudge",
        })
      : Promise.resolve(),
    emailGuardian(
      email,
      emailTemplates.registrationNudge({ studentFirstName, campusName, missingNames, campusLogoUrl }),
      "notifyFamilyRegistrationNudge",
      campusEmail,
      { campusId, recipientUserId: userId, templateKey: "registrationNudge" }
    ),
    smsGuardian(
      contact,
      registrationNudgeSms({ studentFirstName, campusName, count }),
      "notifyFamilyRegistrationNudge",
      { campusId, recipientUserId: userId, templateKey: "registrationNudgeSms" }
    ),
  ]);
}

/**
 * Registration is complete and the school year hasn't started yet — one warm
 * "you're all set, here's what's next" touch during the summer melt window.
 * Sent once per enrollment by the keep-the-seat cron, which owns the
 * dedupe/throttle (registration_packet.keep_the_seat_sent_at from migration
 * 00036), so this function just delivers on all channels, matching
 * notifyFamilyRegistrationNudge's split of responsibility.
 */
export async function notifyFamilyKeepTheSeat({
  enrollmentId,
  studentName,
  campusId,
  startDate,
}: {
  enrollmentId: string;
  studentName?: string;
  campusId?: string;
  /** ISO date string for the school year's first day, when known. */
  startDate?: string;
}): Promise<void> {
  const contact = await getGuardianContactByEnrollment(enrollmentId);
  const { userId, email } = contact;
  if (!userId && !email) return;
  const { name: campusName, email: campusEmail, logoUrl: campusLogoUrl } = await resolveCampus(campusId);
  const studentFirstName = firstNameOf(studentName);
  await Promise.all([
    userId
      ? notify({
          userId,
          subject: `You're all set at ${campusName}`,
          body: `${
            studentName ? `${studentName}'s` : "Your student's"
          } registration is complete at ${campusName}. Watch your email and phone this summer for orientation details and what to bring.`,
          link: `/family/registration`,
          campusId,
          logTag: "notifyFamilyKeepTheSeat",
        })
      : Promise.resolve(),
    emailGuardian(
      email,
      emailTemplates.keepTheSeat({ studentFirstName, campusName, startDate, campusLogoUrl }),
      "notifyFamilyKeepTheSeat",
      campusEmail,
      { campusId, recipientUserId: userId, templateKey: "keepTheSeat" }
    ),
    smsGuardian(
      contact,
      `Rooted Schools: registration is complete for ${studentFirstName ?? "your student"} at ${campusName}. Watch for orientation details this summer.\nRooted Schools: la inscripcion esta completa para ${
        studentFirstName ?? "su estudiante"
      } en ${campusName}. Este atento(a) a los detalles de orientacion este verano.`,
      "notifyFamilyKeepTheSeat",
      { campusId, recipientUserId: userId, templateKey: "keepTheSeatSms" }
    ),
  ]);
}

/**
 * Spring re-enrollment intent pulse: staff-triggered only (no automated cron
 * — spring timing is a human decision, per staffSendReenrollmentPulse in
 * app/staff/enrollment/re-enrollment-actions.ts). Asks the family a one-tap
 * question on their currently active enrollment — is your student coming
 * back? — via in-app, bilingual email, and consented SMS.
 */
export async function notifyFamilyReenrollmentPulse({
  enrollmentId,
  studentName,
  campusId,
  nextSchoolYearName,
}: {
  enrollmentId: string;
  studentName?: string;
  campusId?: string;
  nextSchoolYearName?: string;
}): Promise<void> {
  const contact = await getGuardianContactByEnrollment(enrollmentId);
  const { userId, email } = contact;
  if (!userId && !email && !contact.phone) return;
  const { name: campusName, email: campusEmail, logoUrl: campusLogoUrl } = await resolveCampus(campusId);
  const studentFirstName = firstNameOf(studentName);
  await Promise.all([
    userId
      ? notify({
          userId,
          subject: `Is ${studentName ?? "your student"} returning to ${campusName}?`,
          body: `We're planning seats${
            nextSchoolYearName ? ` for ${nextSchoolYearName}` : " for next year"
          } and want to hold ${
            studentName ?? "your student"
          }'s spot at ${campusName}. Tap here to let us know in one tap — yes, still deciding, or not returning.`,
          link: `/family/reenrollment`,
          campusId,
          logTag: "notifyFamilyReenrollmentPulse",
        })
      : Promise.resolve(),
    emailGuardian(
      email,
      emailTemplates.reenrollmentPulse({ studentFirstName, campusName, nextSchoolYearName, campusLogoUrl }),
      "notifyFamilyReenrollmentPulse",
      campusEmail,
      { campusId, recipientUserId: userId, templateKey: "reenrollmentPulse" }
    ),
    smsGuardian(
      contact,
      `Rooted Schools: Is ${studentFirstName ?? "your student"} coming back${
        nextSchoolYearName ? ` for ${nextSchoolYearName}` : " next year"
      }? One tap to let us know: ${APP_LINK}/family/reenrollment\n¿${
        studentFirstName ?? "Su estudiante"
      } regresará${nextSchoolYearName ? ` para ${nextSchoolYearName}` : " el próximo año"}? Responda con un toque: ${APP_LINK}/family/reenrollment`,
      "notifyFamilyReenrollmentPulse",
      { campusId, recipientUserId: userId, templateKey: "reenrollmentPulseSms" }
    ),
  ]);
}

/**
 * Staff initiated re-enrollment for next year: a new application sits at
 * "offered" and the family accepts or declines at /family/reenrollment.
 *
 * This used to reuse notifyFamilyStudentEnrolled, which told the family their
 * student was "officially enrolled" — the opposite of the truth, since the
 * whole point is that nothing is settled until they answer.
 *
 * Email reuses reenrollmentPulse: it is the only existing template that lands
 * on /family/reenrollment and speaks about next year. offerExtended would fit
 * the "respond to your offer" framing but is built around a deadline, and the
 * re-enrollment path has no expiry date to state — inventing one is not an
 * option. Never throws.
 */
export async function notifyFamilyReenrollmentOffer({
  applicationId,
  studentName,
  campusId,
  nextSchoolYearName,
}: {
  applicationId: string;
  studentName?: string;
  campusId?: string;
  nextSchoolYearName?: string;
}): Promise<void> {
  const contact = await getGuardianContact(applicationId);
  const { userId, email } = contact;
  if (!userId && !email && !contact.phone) return;
  const { name: campusName, email: campusEmail, logoUrl: campusLogoUrl } = await resolveCampus(campusId);
  const studentFirstName = firstNameOf(studentName);
  const yearEn = nextSchoolYearName ? ` for ${nextSchoolYearName}` : " for next year";
  const yearEs = nextSchoolYearName ? ` para ${nextSchoolYearName}` : " para el próximo año";
  await Promise.all([
    userId
      ? notify({
          userId,
          subject: `A seat is reserved${studentName ? ` for ${studentName}` : ""} at ${campusName}`,
          body: `We've held ${
            studentName ?? "your student"
          }'s seat at ${campusName}${yearEn}. Confirm or decline it in your family portal so we know how to plan.`,
          link: `/family/reenrollment`,
          campusId,
          logTag: "notifyFamilyReenrollmentOffer",
        })
      : Promise.resolve(),
    emailGuardian(
      email,
      emailTemplates.reenrollmentPulse({ studentFirstName, campusName, nextSchoolYearName, campusLogoUrl }),
      "notifyFamilyReenrollmentOffer",
      campusEmail,
      { campusId, recipientUserId: userId, templateKey: "reenrollmentPulse" }
    ),
    smsGuardian(
      contact,
      `Rooted Schools: We've held ${
        studentFirstName ?? "your student"
      }'s seat at ${campusName}${yearEn}. Confirm or decline: ${APP_LINK}/family/reenrollment\nHemos reservado el cupo de ${
        studentFirstName ?? "su estudiante"
      } en ${campusName}${yearEs}. Confirme o rechace: ${APP_LINK}/family/reenrollment`,
      "notifyFamilyReenrollmentOffer",
      { campusId, recipientUserId: userId, templateKey: "reenrollmentOfferSms" }
    ),
  ]);
}

// ─── Lead (CRM) notifications ─────────────────────────────────────────────────

interface LeadContact {
  first_name: string;
  email: string | null;
  phone: string | null;
  sms_consent: boolean;
}

/**
 * The campus's edited welcome copy, or undefined for the built-in message.
 *
 * Wrapped rather than called inline because this whole file's contract is
 * that it never throws: a customization a campus may not even have made must
 * never be the reason a family's first email fails to send. Both outcomes —
 * no row, and a lookup that blew up — land on the built-in default.
 */
async function resolveInquiryWelcomeOverride(
  campusId: string
): Promise<emailTemplates.InquiryWelcomeOverride | undefined> {
  try {
    const row = await getCampusMessageOverride(campusId, "inquiryWelcome");
    if (!row) return undefined;
    return {
      subjectEn: row.subject_en,
      subjectEs: row.subject_es,
      bodyEn: row.body_en,
      bodyEs: row.body_es,
    };
  } catch (err) {
    console.error("[notifyLeadWelcome] message override lookup failed", err);
    return undefined;
  }
}

/**
 * Response-engine first touch: a new inquiry gets a warm bilingual welcome
 * within minutes (email + SMS when consented), and campus staff get an
 * in-app ping so a human call follows. Speed-to-lead is the point — Harmony
 * saw 40% higher 7-day conversion from exactly this flow.
 */
export async function notifyLeadWelcome({
  lead,
  campusId,
  leadId,
}: {
  lead: LeadContact;
  campusId: string;
  /** When provided, confirmed sends are recorded on the lead's timeline so
   *  staff can always answer "who got the welcome, and when". */
  leadId?: string;
}): Promise<void> {
  const { name: campusName, email: campusEmail, logoUrl: campusLogoUrl } = await resolveCampus(campusId);
  const override = await resolveInquiryWelcomeOverride(campusId);
  const [emailSent, smsSent] = await Promise.all([
    emailGuardian(
      lead.email,
      emailTemplates.inquiryWelcome({ guardianFirstName: lead.first_name, campusName, campusLogoUrl, override }),
      "notifyLeadWelcome",
      campusEmail,
      { campusId, templateKey: "inquiryWelcome", leadId, kind: "welcome" }
    ),
    smsGuardian(
      { phone: lead.phone, smsConsent: lead.sms_consent },
      `Rooted Schools: Hi ${lead.first_name}! Thanks for your interest in ${campusName}. A member of our team will reach out soon. Questions? Just reply.\n¡Gracias por su interés! Nuestro equipo le contactará pronto.`,
      "notifyLeadWelcome",
      { campusId, templateKey: "inquiryWelcomeSms", leadId }
    ),
  ]);

  // Timeline record — only for sends the provider actually confirmed.
  if (leadId && (emailSent || smsSent)) {
    try {
      const supabase = createServiceRoleClient();
      const channels = [emailSent ? "email" : null, smsSent ? "text" : null]
        .filter(Boolean)
        .join(" and ");
      await supabase.from("lead_activity").insert({
        lead_id: leadId,
        activity_type: "email",
        body: `Welcome message sent (${channels}).`,
      });
    } catch (err) {
      console.error("[notifyLeadWelcome] activity log failed", err);
    }
  }
}

/** New inquiry — route to campus staff so a human follows up fast. */
export async function notifyStaffNewLead({
  campusId,
  leadId,
  leadName,
  source,
}: {
  campusId: string;
  leadId: string;
  leadName: string;
  source: string;
}): Promise<void> {
  await notifyStaff({
    campusId,
    subject: `New inquiry from ${leadName}`,
    body: `${leadName} just asked about your school (source: ${source.replace(/_/g, " ")}). Fast follow-up wins — call or text within a day.`,
    link: `/staff/recruitment/${leadId}`,
    logTag: "notifyStaffNewLead",
  });
}

/** Gone-quiet lead — one warm bilingual check-in (throttled by the cron). */
export async function notifyLeadReengagement({
  lead,
  campusId,
  unsubscribeToken,
  leadId,
}: {
  lead: LeadContact;
  campusId: string;
  /** LG-0.1: per-lead one-click unsubscribe (bulk send → link + headers required). */
  unsubscribeToken?: string | null;
  /** 00045 engagement tracking — when provided, the send is recorded in email_event (kind: "reengagement"). */
  leadId?: string;
}): Promise<void> {
  const { name: campusName, email: campusEmail, logoUrl: campusLogoUrl } = await resolveCampus(campusId);
  const template = emailTemplates.leadReengagement({
    guardianFirstName: lead.first_name,
    campusName,
    campusLogoUrl,
  });
  const { unsubscribeUrl } = await import("@/lib/email-compliance");
  const unsub = unsubscribeToken ? unsubscribeUrl(unsubscribeToken) : `${APP_LINK}/unsubscribe`;
  await Promise.all([
    lead.email
      ? sendEmail({
          to: lead.email,
          subject: template.subject,
          html: template.html.replaceAll(emailTemplates.UNSUB_PLACEHOLDER, unsub),
          text: template.text.replaceAll(emailTemplates.UNSUB_PLACEHOLDER, unsub),
          replyTo: campusEmail ?? undefined,
          headers: {
            "List-Unsubscribe": `<${unsub}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
          meta: { leadId, kind: "reengagement", logSubject: "Automated email: leadReengagement" },
        }).then(async (r) => {
          if (!r.ok && r.error !== "email not configured")
            console.error("[notifyLeadReengagement] email failed", r.error);
          // Sent through sendEmail rather than emailGuardian (the unsubscribe
          // headers), so the delivery record is written here by hand.
          await recordDeliveryAttempt(
            buildDeliveryLogRow({
              channel: "email",
              recipientAddress: lead.email as string,
              logTag: "notifyLeadReengagement",
              context: { campusId, templateKey: "leadReengagement", leadId },
              ok: r.ok,
              error: r.error,
              providerMessageId: r.id,
              at: new Date().toISOString(),
            }),
            "notifyLeadReengagement"
          );
        })
      : Promise.resolve(),
    smsGuardian(
      { phone: lead.phone, smsConsent: lead.sms_consent },
      `Rooted Schools: Hi ${lead.first_name} — still thinking about ${campusName}? We'd love to help with any questions. Just reply, or apply here: ${APP_LINK}/login\n¿Aún considerando ${campusName}? Responda con sus preguntas.`,
      "notifyLeadReengagement",
      { campusId, templateKey: "leadReengagementSms", leadId }
    ),
  ]);
}

// ─── Staff notifications ──────────────────────────────────────────────────────

/**
 * Get all staff auth user IDs assigned to a campus.
 */
async function getStaffUserIdsForCampus(campusId: string): Promise<string[]> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("user_campus_role")
    .select("user_id")
    .eq("campus_id", campusId);
  return (data ?? []).map((r: Record<string, string>) => r.user_id).filter(Boolean);
}

async function notifyStaff(params: {
  campusId: string;
  subject: string;
  body: string;
  link: string;
  logTag: string;
}): Promise<void> {
  const userIds = await getStaffUserIdsForCampus(params.campusId);
  if (userIds.length === 0) return;
  const result = await sendNotification({
    recipientUserIds: userIds,
    campusId: params.campusId,
    channel: "in_app",
    subject: params.subject,
    body: params.body,
    link: params.link,
  });
  if (result.error) console.error(`[${params.logTag}]`, result.error);
}

/** Family submits a new application — alert enrollment staff to begin review. */
export async function notifyStaffNewApplication({
  campusId,
  studentName,
  applicationId,
}: {
  campusId: string;
  studentName?: string;
  applicationId: string;
}): Promise<void> {
  await notifyStaff({
    campusId,
    subject: `New application${studentName ? ` from ${studentName}` : ""} submitted`,
    body: `A new application has been submitted${studentName ? ` for ${studentName}` : ""}. Review it to get started.`,
    link: `/staff/applications/${applicationId}`,
    logTag: "notifyStaffNewApplication",
  });
}

/** Family accepts a seat offer — alert staff to prepare enrollment. */
export async function notifyStaffOfferAccepted({
  campusId,
  studentName,
  applicationId,
}: {
  campusId: string;
  studentName?: string;
  applicationId: string;
}): Promise<void> {
  await notifyStaff({
    campusId,
    subject: `Offer accepted${studentName ? ` by ${studentName}` : ""}`,
    body: `${studentName ?? "A family"} has accepted their seat offer. Their registration packet has been created and is ready for them to complete.`,
    link: `/staff/applications/${applicationId}`,
    logTag: "notifyStaffOfferAccepted",
  });
}

/** Family declines a seat offer — alert staff so they can promote the waitlist. */
export async function notifyStaffOfferDeclined({
  campusId,
  studentName,
  applicationId,
}: {
  campusId: string;
  studentName?: string;
  applicationId: string;
}): Promise<void> {
  await notifyStaff({
    campusId,
    subject: `Offer declined${studentName ? ` by ${studentName}` : ""}`,
    body: `${studentName ?? "A family"} has declined their seat offer. Check the waitlist to promote the next eligible student.`,
    link: `/staff/applications/${applicationId}`,
    logTag: "notifyStaffOfferDeclined",
  });
}

/** Family uploads a document — alert staff there's something to review. */
export async function notifyStaffDocumentUploaded({
  campusId,
  documentType,
  studentName,
}: {
  campusId: string;
  documentType: string;
  studentName?: string;
}): Promise<void> {
  const readableType = documentType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  // Subject stays generic on purpose: documentType values include iep_records
  // and 504_plan, and a subject like "Document uploaded: Iep Records for
  // Jordan Rivera" would store a student's disability-services status next to
  // their full name in a field every staff member at the campus can read.
  // The specific type + student name belong in the body only.
  await notifyStaff({
    campusId,
    subject: "New document uploaded for review",
    body: `A new document (${readableType}) has been uploaded${studentName ? ` for ${studentName}` : ""} and is pending review.`,
    link: `/staff/documents`,
    logTag: "notifyStaffDocumentUploaded",
  });
}

/** Family submits their registration packet — alert staff to begin verification. */
export async function notifyStaffRegistrationSubmitted({
  campusId,
  studentName,
  enrollmentId,
}: {
  campusId: string;
  studentName?: string;
  enrollmentId: string;
}): Promise<void> {
  // Try to resolve application_id so the link goes directly to the registration review tab
  const supabase = createServiceRoleClient();
  const { data: row } = await supabase
    .from("enrollment")
    .select("application_id")
    .eq("id", enrollmentId)
    .single();
  const applicationId = (row as unknown as Record<string, string> | null)?.application_id;
  const link = applicationId
    ? `/staff/applications/${applicationId}?tab=registration`
    : `/staff/enrollment`;

  await notifyStaff({
    campusId,
    subject: `Registration packet submitted${studentName ? ` for ${studentName}` : ""}`,
    body: `${studentName ?? "A student"}'s registration packet has been submitted and is ready for staff verification.`,
    link,
    logTag: "notifyStaffRegistrationSubmitted",
  });
}

/** Family responds to a needs_info request — alert the assigned staff member or all enrollment managers. */
export async function notifyStaffOfFamilyResponse(applicationId: string): Promise<void> {
  const supabase = createServiceRoleClient();

  // Look up campus_id, assigned_staff_id, and student name in one query
  const { data, error } = await supabase
    .from("application")
    .select("campus_id, assigned_staff_id, student:student_id (first_name, last_name)")
    .eq("id", applicationId)
    .single();

  if (error) {
    console.error("[notifyStaffOfFamilyResponse] failed to load application", error.message, { applicationId });
    return;
  }

  const row = data as unknown as {
    campus_id: string | null;
    assigned_staff_id: string | null;
    student: { first_name?: string; last_name?: string } | null;
  } | null;

  if (!row?.campus_id) {
    console.warn("[notifyStaffOfFamilyResponse] no campus_id on application", { applicationId });
    return;
  }

  const studentName = row.student
    ? [row.student.first_name, row.student.last_name].filter(Boolean).join(" ") || undefined
    : undefined;

  const subject = "Family responded to information request";
  const body = studentName
    ? `${studentName}'s family has submitted a response to your information request. Review the application to continue processing.`
    : "A family has submitted a response to an information request. Review the application to continue processing.";
  const link = `/staff/applications/${applicationId}`;

  if (row.assigned_staff_id) {
    // Notify the assigned staff member directly
    await notify({
      userId: row.assigned_staff_id,
      subject,
      body,
      link,
      campusId: row.campus_id,
      logTag: "notifyStaffOfFamilyResponse",
    });
  } else {
    // Fall back to all enrollment_managers for the campus
    const { data: roleRows } = await supabase
      .from("user_campus_role")
      .select("user_id")
      .eq("campus_id", row.campus_id)
      .eq("role", "enrollment_manager");

    const userIds = ((roleRows ?? []) as Array<{ user_id: string }>)
      .map((r) => r.user_id)
      .filter(Boolean);

    if (userIds.length === 0) {
      console.warn("[notifyStaffOfFamilyResponse] no enrollment_managers found for campus", { campusId: row.campus_id });
      return;
    }

    const result = await sendNotification({
      recipientUserIds: userIds,
      campusId: row.campus_id,
      channel: "in_app",
      subject,
      body,
      link,
    });
    if (result.error) console.error("[notifyStaffOfFamilyResponse]", result.error);
  }
}

/**
 * Called immediately after a family submits an application.
 * Looks up campus + student name once, then fires both:
 *   1. Family confirmation (application received)
 *   2. Staff alert (new application to review)
 */
export async function notifyOnApplicationSubmit(applicationId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("application")
    .select("campus_id, guardian:guardian_id (email), student:student_id (first_name, last_name)")
    .eq("id", applicationId)
    .single();

  const row = data as unknown as {
    campus_id: string | null;
    guardian: { email?: string | null } | null;
    student: { first_name?: string; last_name?: string } | null;
  } | null;

  const campusId = row?.campus_id ?? undefined;
  const studentName = row?.student
    ? [row.student.first_name, row.student.last_name].filter(Boolean).join(" ") || undefined
    : undefined;

  // CRM attribution stitch: if this family started as a lead, mark it
  // converted. Lazy import avoids a module cycle (leads.ts imports notify).
  const { stitchLeadToApplication } = await import("@/lib/mutations/leads");

  await Promise.all([
    notifyFamilyApplicationReceived({ applicationId, studentName, campusId }),
    campusId
      ? notifyStaffNewApplication({ campusId, studentName, applicationId })
      : Promise.resolve(),
    stitchLeadToApplication(applicationId, row?.guardian?.email ?? null, row?.campus_id ?? null),
  ]);
}

/** Student fully enrolled after academic audit — send family a celebratory message. */
export async function notifyFamilyStudentEnrolled({
  applicationId,
  studentName,
  campusId,
  gradeLabel,
}: {
  applicationId: string;
  studentName?: string;
  campusId?: string;
  gradeLabel?: string;
}): Promise<void> {
  // In-app only: the family already received the registrationComplete email
  // when their packet was verified — a second identical email would be noise.
  const { userId } = await getGuardianContact(applicationId);
  if (!userId) return;
  const { name: campusName } = await resolveCampus(campusId);
  const grade = gradeLabel ? ` in ${gradeLabel}` : "";
  await notify({
    userId,
    subject: `${studentName ?? "Your student"} is officially enrolled at ${campusName}!`,
    body: `Congratulations! ${studentName ?? "Your student"} is now fully enrolled${grade} at ${campusName}. At Rooted Schools, every student graduates with a career credential and a clear plan. We're excited to get started. Log in to your portal to view orientation details and next steps.`,
    link: `/family/applications/${applicationId}`,
    campusId,
    logTag: "notifyFamilyStudentEnrolled",
  });
}
