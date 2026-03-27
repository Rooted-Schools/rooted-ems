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

import { createServerClient } from "@rooted-ems/database/server";
import { sendNotification } from "@/lib/mutations";

// ─── Guardian lookup ─────────────────────────────────────────────────────────

/**
 * Resolve the Supabase auth user_id for the guardian on a given application.
 * Returns null if the lookup fails — callers degrade gracefully.
 */
async function getGuardianUserId(applicationId: string): Promise<string | null> {
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("application")
    .select("guardian:guardian_id (user_id)")
    .eq("id", applicationId)
    .single();

  const guardian = (data as unknown as Record<string, unknown> | null)?.guardian as Record<string, string> | null;
  return guardian?.user_id ?? null;
}

// ─── Offer notifications ─────────────────────────────────────────────────────

/**
 * Notify a family that a seat offer has been made.
 * Called from sendOffer() and promoteFromWaitlist().
 */
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
  /** Optional — resolved from campusId if omitted */
  campusName?: string;
  studentName?: string;
  expiresAt: string;
  campusId?: string;
}): Promise<void> {
  const userId = await getGuardianUserId(applicationId);
  if (!userId) return;

  // Resolve campus name if not provided
  let campusName = campusNameProp ?? "";
  if (!campusName && campusId) {
    const supabase = await createServerClient();
    const { data: campus } = await supabase
      .from("campus")
      .select("name")
      .eq("id", campusId)
      .single();
    campusName = (campus as unknown as Record<string, string> | null)?.name ?? "your school";
  }
  if (!campusName) campusName = "your school";

  const deadline = new Date(expiresAt).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const subject = studentName
    ? `🎉 Seat offer for ${studentName} at ${campusName}`
    : `🎉 You have a seat offer at ${campusName}`;

  const body = `Congratulations! A seat has been offered${studentName ? ` for ${studentName}` : ""} at ${campusName}. ` +
    `Please respond by ${deadline} to secure your spot.`;

  const result = await sendNotification({
    recipientUserIds: [userId],
    campusId,
    channel: "in_app",
    subject,
    body,
    link: `/family/offers/${offerId}`,
  });

  if (result.error) {
    console.error("[notifyFamilyOfOffer]", result.error);
  }
}

// ─── Document notifications ──────────────────────────────────────────────────

/**
 * Notify a family that a document has been rejected and needs re-uploading.
 */
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

  const readableType = documentType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const result = await sendNotification({
    recipientUserIds: [userId],
    campusId,
    channel: "in_app",
    subject: `Action needed: ${readableType} needs to be re-uploaded`,
    body: `Your ${readableType} document could not be verified. Reason: ${reason}. Please upload a new copy to continue.`,
    link: `/family/documents`,
  });

  if (result.error) {
    console.error("[notifyFamilyDocumentRejected]", result.error);
  }
}

// ─── Application status notifications ────────────────────────────────────────

/**
 * Notify a family that their application requires additional information.
 */
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

  const result = await sendNotification({
    recipientUserIds: [userId],
    campusId,
    channel: "in_app",
    subject: "Your application needs attention",
    body: message ?? "Our enrollment team needs additional information to process your application. Please check your application for details.",
    link: `/family/applications/${applicationIdForLink}`,
  });

  if (result.error) {
    console.error("[notifyFamilyNeedsInfo]", result.error);
  }
}
