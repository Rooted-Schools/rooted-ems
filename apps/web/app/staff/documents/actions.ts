"use server";

import { revalidatePath } from "next/cache";
import { requireStaffSession } from "@/lib/auth/get-session";
import { reviewDocument } from "@/lib/mutations";

/**
 * Both actions delegate the real gate to reviewDocument, which resolves the
 * document's own campus and requires compliance_auditor on THAT campus. The
 * requireStaffSession here only fails non-staff callers fast.
 *
 * The family notification also lives in reviewDocument now. It used to be
 * sent from here using a `meta` payload the client supplied — including the
 * campus id that decides which school brands the message, which meant the
 * page could name any campus it liked. Nothing about the notification is
 * taken from the client any more.
 */

export async function staffApproveDocument(documentId: string) {
  await requireStaffSession();
  const result = await reviewDocument(documentId, "verified");

  if (!result.error) {
    revalidatePath("/staff/documents");
    revalidatePath("/staff/applications");
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/today");
  }

  return result;
}

export async function staffRejectDocument(
  documentId: string,
  reason: string,
  /** Retained for call-site compatibility and deliberately ignored — the
   *  application, document type, and campus all come from the document row. */
  _meta?: { applicationId: string; documentType: string; campusId?: string }
) {
  await requireStaffSession();
  if (!reason.trim()) {
    return { data: null, error: "A rejection reason is required." };
  }

  const result = await reviewDocument(documentId, "rejected", reason);

  if (!result.error) {
    revalidatePath("/staff/documents");
    revalidatePath("/staff/applications");
  }

  return result;
}
