/**
 * Enrollment event notifications.
 *
 * All functions use the `in_app` channel which works without any external
 * provider.  Email/SMS uses the same `sendNotification` path once a provider
 * (e.g. Resend) is configured — no code changes needed.
 *
 * Rule: never throw.  A notification failure must never roll back the
 * primary operation that triggered it.
 */

import { createServiceRoleClient } from "@rooted-ems/database/server";
import { sendNotification } from "@/lib/mutations";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve the Supabase auth user_id for the guardian on a given application.
 * Returns null if the lookup fails — callers degrade gracefully.
 */
async function getGuardianUserId(applicationId: string): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("application")
    .select("guardian:guardian_id (user_id)")
    .eq("id", applicationId)
    .single();
  const guardian = (data as unknown as Record<string, unknown> | null)?.guardian as Record<string, string> | null;
  return guardian?.user_id ?? null;
}

/**
 * Resolve the Supabase auth user_id for the guardian on a given enrollment.
 */
async function getGuardianUserIdByEnrollment(enrollmentId: string): Promise<{ userId: string | null; applicationId: string | null }> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("enrollment")
    .select("application_id, application:application_id (guardian:guardian_id (user_id))")
    .eq("id", enrollmentId)
    .single();
  const row = data as unknown as Record<string, unknown> | null;
  const applicationId = (row?.application_id as string) ?? null;
  const application = row?.application as Record<string, unknown> | null;
  const guardian = application?.guardian as Record<string, string> | null;
  return { userId: guardian?.user_id ?? null, applicationId };
}

async function resolveCampusName(campusId?: string): Promise<string> {
  if (!campusId) return "your school";
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from("campus").select("name").eq("id", campusId).single();
  return (data as unknown as Record<string, string> | null)?.name ?? "your school";
}

async function notify(params: {
  userId: string;
  subject: string;
  body: string;
  link: string;
  campusId?: string;
  logTag: string;
}): Promise<void> {
  const result = await sendNotification({
    recipientUserIds: [params.userId],
    campusId: params.campusId,
    channel: "in_app",
    subject: params.subject,
    body: params.body,
    link: params.link,
  });
  if (result.error) console.error(`[${params.logTag}]`, result.error);
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
  const userId = await getGuardianUserId(applicationId);
  if (!userId) return;
  const campusName = await resolveCampusName(campusId);
  await notify({
    userId,
    subject: `Application received${studentName ? ` for ${studentName}` : ""}`,
    body: `We've received your enrollment application${studentName ? ` for ${studentName}` : ""} at ${campusName}. We'll be in touch as we review it.`,
    link: `/family/applications`,
    campusId,
    logTag: "notifyFamilyApplicationReceived",
  });
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
  const userId = await getGuardianUserId(applicationId);
  if (!userId) return;
  const campusName = await resolveCampusName(campusId);
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
  const userId = await getGuardianUserId(applicationId);
  if (!userId) return;
  await notify({
    userId,
    subject: "Your application needs attention",
    body: message ?? "Our enrollment team needs additional information to process your application. Please check your application for details.",
    link: `/family/applications/${applicationIdForLink}`,
    campusId,
    logTag: "notifyFamilyNeedsInfo",
  });
}

/** Application placed on waitlist. */
export async function notifyFamilyApplicationWaitlisted({
  applicationId,
  studentName,
  campusId,
}: {
  applicationId: string;
  studentName?: string;
  campusId?: string;
}): Promise<void> {
  const userId = await getGuardianUserId(applicationId);
  if (!userId) return;
  const campusName = await resolveCampusName(campusId);
  await notify({
    userId,
    subject: `You're on the waitlist at ${campusName}`,
    body: `${studentName ? `${studentName}'s application` : "Your application"} has been placed on the waitlist at ${campusName}. We'll notify you right away if a seat opens up.`,
    link: `/family/applications`,
    campusId,
    logTag: "notifyFamilyApplicationWaitlisted",
  });
}

// ─── Offer notifications ──────────────────────────────────────────────────────

/** A seat offer has been made. */
export async function notifyFamilyOfOffer({
  applicationId,
  offerId,
  campusName: campusNameProp,
  studentName,
  expiresAt,
  campusId,
}: {
  applicationId: string;
  offerId: string;
  campusName?: string;
  studentName?: string;
  expiresAt: string;
  campusId?: string;
}): Promise<void> {
  const userId = await getGuardianUserId(applicationId);
  if (!userId) return;
  const campusName = campusNameProp ?? await resolveCampusName(campusId);
  const deadline = new Date(expiresAt).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
  await notify({
    userId,
    subject: studentName ? `🎉 Seat offer for ${studentName} at ${campusName}` : `🎉 You have a seat offer at ${campusName}`,
    body: `Congratulations! A seat has been offered${studentName ? ` for ${studentName}` : ""} at ${campusName}. Please respond by ${deadline} to secure your spot.`,
    link: `/family/offers/${offerId}`,
    campusId,
    logTag: "notifyFamilyOfOffer",
  });
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
  const userId = await getGuardianUserId(applicationId);
  if (!userId) return;
  const readableType = documentType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  await notify({
    userId,
    subject: `Action needed: ${readableType} needs to be re-uploaded`,
    body: `Your ${readableType} could not be verified. Reason: ${reason}. Please upload a new copy to continue your enrollment.`,
    link: `/family/documents`,
    campusId,
    logTag: "notifyFamilyDocumentRejected",
  });
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
  const userId = await getGuardianUserId(applicationId);
  if (!userId) return;
  const readableType = documentType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  await notify({
    userId,
    subject: `✅ ${readableType} verified`,
    body: `Your ${readableType} has been reviewed and verified by the enrollment team. No further action needed for this document.`,
    link: `/family/documents`,
    campusId,
    logTag: "notifyFamilyDocumentVerified",
  });
}

// ─── Registration notifications ───────────────────────────────────────────────

/** Registration packet is ready for the family to complete. */
export async function notifyFamilyRegistrationReady({
  applicationId,
  studentName,
  campusId,
}: {
  applicationId: string;
  studentName?: string;
  campusId?: string;
}): Promise<void> {
  const userId = await getGuardianUserId(applicationId);
  if (!userId) return;
  const campusName = await resolveCampusName(campusId);
  await notify({
    userId,
    subject: `Registration is ready${studentName ? ` for ${studentName}` : ""}`,
    body: `Your enrollment packet is ready to complete${studentName ? ` for ${studentName}` : ""} at ${campusName}. Please log in and complete all required items to finalize enrollment.`,
    link: `/family/registration`,
    campusId,
    logTag: "notifyFamilyRegistrationReady",
  });
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
  const { userId } = await getGuardianUserIdByEnrollment(enrollmentId);
  if (!userId) return;
  const campusName = await resolveCampusName(campusId);
  await notify({
    userId,
    subject: `Registration packet submitted${studentName ? ` for ${studentName}` : ""}`,
    body: `We've received ${studentName ? `${studentName}'s` : "your"} registration packet at ${campusName}. Our team will review it and notify you when it's verified.`,
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
  const { userId } = await getGuardianUserIdByEnrollment(enrollmentId);
  if (!userId) return;
  const campusName = await resolveCampusName(campusId);
  await notify({
    userId,
    subject: `🎓 Enrollment complete${studentName ? ` for ${studentName}` : ""}!`,
    body: `All registration items have been verified. ${studentName ? `${studentName} is` : "Your student is"} officially enrolled at ${campusName}. Welcome to the Rooted Schools family!`,
    link: `/family/registration`,
    campusId,
    logTag: "notifyFamilyRegistrationComplete",
  });
}
