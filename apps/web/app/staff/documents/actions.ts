"use server";

import { revalidatePath } from "next/cache";
import { requireStaffSession } from "@/lib/auth/get-session";
import { reviewDocument } from "@/lib/mutations";
import { notifyFamilyDocumentRejected } from "@/lib/notify";

export async function staffApproveDocument(documentId: string) {
  await requireStaffSession();
  const result = await reviewDocument(documentId, "verified");

  if (!result.error) {
    revalidatePath("/staff/documents");
    revalidatePath("/staff/applications");
    revalidatePath("/staff/dashboard");
  }

  return result;
}

export async function staffRejectDocument(
  documentId: string,
  reason: string,
  /** Passed so the notification can be sent without an extra DB lookup */
  meta?: { applicationId: string; documentType: string; campusId?: string }
) {
  await requireStaffSession();
  if (!reason.trim()) {
    return { data: null, error: "A rejection reason is required." };
  }

  const result = await reviewDocument(documentId, "rejected", reason);

  if (!result.error) {
    revalidatePath("/staff/documents");
    revalidatePath("/staff/applications");

    // Notify the family so they know to re-upload — fire and forget
    if (meta?.applicationId) {
      await notifyFamilyDocumentRejected({
        applicationId: meta.applicationId,
        documentType: meta.documentType,
        reason,
        campusId: meta.campusId,
      });
    }
  }

  return result;
}
