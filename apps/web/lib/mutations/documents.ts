import { createServerClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";

// ─── Review Document (Staff) ───────────────────────────

/**
 * Approve or reject a document uploaded for an application.
 */
export async function reviewDocument(
  documentId: string,
  decision: "verified" | "rejected",
  rejectionReason?: string
): Promise<MutationResult> {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data: doc } = await supabase
    .from("document")
    .select("id, status")
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
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

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

  return { data: { id: doc.id }, error: null };
}
