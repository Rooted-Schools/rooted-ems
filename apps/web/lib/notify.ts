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
  const { data, error } = await supabase
    .from("application")
    .select("guardian_id, guardian:guardian_id (user_id)")
    .eq("id", applicationId)
    .single();
  if (error) {
    console.error("[getGuardianUserId] query error", error.message, { applicationId });
    return null;
  }
  const row = data as unknown as Record<string, unknown> | null;
  const guardian = row?.guardian as Record<string, string> | null;
  const userId = guardian?.user_id ?? null;
  if (!userId) {
    console.warn("[getGuardianUserId] no user_id found", {
      applicationId,
      guardian_id: row?.guardian_id ?? null,
      guardian,
    });
  }
  return userId;
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
    body: `A new enrollment application has been submitted${studentName ? ` for ${studentName}` : ""}. Review it to begin the verification process.`,
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
    body: `${studentName ?? "A family"} has declined their seat offer. The next waitlist candidate has been automatically promoted if available.`,
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
  await notifyStaff({
    campusId,
    subject: `Document uploaded: ${readableType}${studentName ? ` for ${studentName}` : ""}`,
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
  const userId = await getGuardianUserId(applicationId);
  if (!userId) return;
  const campusName = await resolveCampusName(campusId);
  const grade = gradeLabel ? ` in ${gradeLabel}` : "";
  await notify({
    userId,
    subject: `🎉 ${studentName ?? "Your student"} is officially enrolled at ${campusName}!`,
    body: `Congratulations! ${studentName ?? "Your student"} is now fully enrolled${grade} at ${campusName}. Welcome to the Rooted Schools family — we can't wait to see them thrive. Check your enrollment portal for next steps and important information.`,
    link: `/family/applications/${applicationId}`,
    campusId,
    logTag: "notifyFamilyStudentEnrolled",
  });
}
