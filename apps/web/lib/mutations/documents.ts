import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";
import { AuditAction, logAuditEvent } from "@/lib/audit";
import { notifyFamilyDocumentVerified, notifyStaffDocumentUploaded } from "@/lib/notify";

// ─── Review Document (Staff) ───────────────────────────

/**
 * Approve or reject a document uploaded for an application.
 */
export async function reviewDocument(
  documentId: string,
  decision: "verified" | "rejected",
  rejectionReason?: string
): Promise<MutationResult> {
  // Auth check via user session
  const authClient = await createServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  // Service role bypasses RLS — staff must be able to read any family's document
  const supabase = createServiceRoleClient();

  // Fetch document with campus context for audit
  const { data: doc } = await supabase
    .from("document")
    .select("id, status, application_id, document_type, application:application_id (campus_id)")
    .eq("id", documentId)
    .single();

  if (!doc) return { data: null, error: "Document not found" };

  if (doc.status !== "pending") {
    return { data: null, error: `Document already ${doc.status}` };
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    status: decision,
    verified_by: user.id,
    verified_at: now,
  };

  if (decision === "rejected" && rejectionReason) {
    updates.rejection_reason = rejectionReason;
  }

  const { error } = await supabase
    .from("document")
    .update(updates)
    .eq("id", documentId);

  if (error) {
    console.error("[reviewDocument]", error.message);
    return { data: null, error: "Failed to review document" };
  }

  const campusId =
    (doc.application as unknown as Record<string, string> | null)?.campus_id ?? null;

  await logAuditEvent({
    table_name: "document",
    record_id: documentId,
    action: AuditAction.StatusChange,
    actor_id: user.id,
    campus_id: campusId,
    old_data: { status: "pending" },
    new_data: {
      status: decision,
      ...(decision === "rejected" && rejectionReason ? { rejection_reason: rejectionReason } : {}),
    },
    metadata: {
      application_id: doc.application_id ?? null,
      document_type: doc.document_type ?? null,
    },
  });

  // Notify family when document is verified — fire and forget
  if (decision === "verified" && doc.application_id) {
    notifyFamilyDocumentVerified({
      applicationId: doc.application_id,
      documentType: doc.document_type,
      campusId: campusId ?? undefined,
    }).catch(() => {});
  }

  return { data: null, error: null };
}

// ─── Create Document Record ────────────────────────────

/**
 * Create a document record (used after file upload to Supabase Storage).
 * File upload itself happens client-side; this creates the DB record.
 */
export async function createDocumentRecord(input: {
  application_id: string;
  student_id: string;
  document_type: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
}): Promise<MutationResult<{ id: string }>> {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const supabase = createServiceRoleClient();

  const { data: doc, error } = await supabase
    .from("document")
    .insert({
      application_id: input.application_id,
      student_id: input.student_id,
      document_type: input.document_type,
      file_name: input.file_name,
      file_size: input.file_size,
      mime_type: input.mime_type,
      storage_path: input.storage_path,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !doc) {
    console.error("[createDocumentRecord]", error?.message);
    return { data: null, error: "Failed to create document record" };
  }

  await logAuditEvent({
    table_name: "document",
    record_id: doc.id,
    action: AuditAction.Create,
    actor_id: user.id,
    campus_id: null, // not available without a join — low-risk omission for uploads
    new_data: {
      application_id: input.application_id,
      document_type: input.document_type,
      file_name: input.file_name,
      file_size: input.file_size,
      status: "pending",
    },
  });

  // Notify staff there's a new document to review — look up campus_id first
  const { data: appRow } = await supabase
    .from("application")
    .select("campus_id")
    .eq("id", input.application_id)
    .single();
  if (appRow?.campus_id) {
    notifyStaffDocumentUploaded({
      campusId: appRow.campus_id as string,
      documentType: input.document_type,
    }).catch(() => {});
  }

  return { data: { id: doc.id }, error: null };
}
