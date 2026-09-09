"use server";

import { revalidatePath } from "next/cache";
import { requireStaffSession, getAccessibleCampusIds } from "@/lib/auth/get-session";
import { reviewDocument } from "@/lib/mutations";
import { createServiceRoleClient } from "@rooted-ems/database/server";

/**
 * Return a short-lived signed URL so staff can actually SEE a pending document
 * before approving or rejecting it. The queue previously offered Approve and
 * Reject with no way to view the file, so staff were deciding blind.
 *
 * Resolved by document id (not a client-supplied path): the id is looked up,
 * the document's application campus is checked against the caller's accessible
 * campuses, and only then is a signed URL minted. "Not found" and "not your
 * campus" return the same message so a staff user on another campus learns
 * nothing about what exists here.
 */
export async function staffGetDocumentUrl(
  documentId: string
): Promise<{ url: string | null; error: string | null }> {
  if (!documentId) return { url: null, error: "No document specified." };

  const session = await requireStaffSession();
  const supabase = createServiceRoleClient();

  const { data: doc } = await supabase
    .from("document")
    .select("id, storage_path, application:application_id (campus_id)")
    .eq("id", documentId)
    .maybeSingle();

  const docRow = doc as unknown as {
    storage_path: string | null;
    application: { campus_id: string } | null;
  } | null;

  if (!docRow || !docRow.storage_path) {
    return { url: null, error: "File not found." };
  }

  const accessibleCampusIds = getAccessibleCampusIds(session);
  const docCampusId = docRow.application?.campus_id;
  if (
    accessibleCampusIds.length > 0 &&
    (!docCampusId || !accessibleCampusIds.includes(docCampusId))
  ) {
    return { url: null, error: "File not found." };
  }

  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(docRow.storage_path, 3600); // 1-hour link

  if (error) return { url: null, error: "Could not open the file." };
  return { url: data.signedUrl, error: null };
}

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
