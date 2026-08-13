import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";
import { AuditAction, logAuditEvent } from "@/lib/audit";
import {
  notifyFamilyDocumentRejected,
  notifyFamilyDocumentVerified,
  notifyStaffDocumentUploaded,
} from "@/lib/notify";
import { requireRoleOnCampus, requireStaffSession } from "@/lib/auth/get-session";

// ─── Review Document (Staff) ───────────────────────────

/**
 * Approve or reject a document uploaded for an application.
 *
 * The campus gate lives HERE rather than in the callers so every path
 * inherits it — /staff/documents, the application detail panel, and anything
 * added later. requireStaffSession alone (is_staff only) let a staff member
 * at one campus verify or reject another campus's family documents by
 * supplying that document's id; the record's real campus_id is resolved from
 * the document's application first, and the role is checked on THAT campus.
 */
export async function reviewDocument(
  documentId: string,
  decision: "verified" | "rejected",
  rejectionReason?: string
): Promise<MutationResult> {
  // Fail fast for non-staff before any read; the campus-specific gate below
  // needs the record's campus, which we can only learn by reading it first.
  await requireStaffSession();

  // Service role bypasses RLS — staff must be able to read any family's document
  const supabase = createServiceRoleClient();

  // Fetch document with campus context for the gate, the audit row, and the
  // family notification's campus branding.
  const { data: doc } = await supabase
    .from("document")
    .select("id, status, application_id, document_type, application:application_id (campus_id)")
    .eq("id", documentId)
    .single();

  if (!doc) return { data: null, error: "Document not found" };

  const campusId =
    (doc.application as unknown as Record<string, string> | null)?.campus_id ?? null;

  // Campus-scoped gate — resolved from the record, never from client input.
  const session = await requireRoleOnCampus(campusId, "compliance_auditor");

  if (doc.status !== "pending") {
    return { data: null, error: `Document already ${doc.status}` };
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    status: decision,
    verified_by: session.user_id,
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

  await logAuditEvent({
    table_name: "document",
    record_id: documentId,
    action: AuditAction.StatusChange,
    actor_id: session.user_id,
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

  // Notify the family either way — fire and forget.
  //
  // A rejection is the notification that actually matters: without it the
  // family never learns their document was turned down, and the packet stalls
  // on a document nobody told them to replace. It lives here, not in the
  // callers, so every review path sends it. The campus comes from the
  // resolved record so the email is branded by the school that actually owns
  // the application.
  if (doc.application_id) {
    if (decision === "verified") {
      notifyFamilyDocumentVerified({
        applicationId: doc.application_id,
        documentType: doc.document_type,
        campusId: campusId ?? undefined,
      }).catch(() => {});
    } else {
      notifyFamilyDocumentRejected({
        applicationId: doc.application_id,
        documentType: doc.document_type,
        reason: rejectionReason?.trim() || "No reason was recorded. Contact the enrollment team for details.",
        campusId: campusId ?? undefined,
      }).catch(() => {});
    }
  }

  return { data: null, error: null };
}

// ─── Create Document Record ────────────────────────────

/**
 * True when `storagePath` sits inside the authenticated user's own upload
 * folder — the `{userId}/...` layout lib/storage/upload.ts writes.
 *
 * Pure and exported so the rule is unit-testable on its own. Fails closed on
 * anything that isn't a plain single-segment-prefixed path: a leading slash,
 * an empty first segment, or any `..` traversal component all read as not
 * mine, because none of them is a path this app ever produces.
 */
export function isOwnStoragePath(storagePath: string, userId: string): boolean {
  if (!storagePath || !userId) return false;
  if (storagePath.includes("..")) return false;
  const [first, ...rest] = storagePath.split("/");
  if (rest.length === 0) return false; // a bare filename belongs to no folder
  return first === userId;
}

/**
 * Create a document record (used after file upload to Supabase Storage).
 * File upload itself happens client-side; this creates the DB record.
 *
 * Two fields the client sends are NOT taken at face value:
 *
 *   storage_path — uploads land at `{userId}/{timestamp}_{name}` (see
 *   lib/storage/upload.ts). Accepting an arbitrary path let a guardian point
 *   a row on their own application at another family's uploaded file, and
 *   every staff preview of that row would then serve the other family's
 *   document. The first path segment must be the authenticated user's own id.
 *
 *   student_id — nothing tied it to the application being uploaded against,
 *   so a document could be filed against a student the uploader has no
 *   relationship to. It is resolved from the application row instead.
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

  // The uploader may only claim a file stored under their own user folder.
  if (!isOwnStoragePath(input.storage_path, user.id)) {
    return { data: null, error: "Not authorized" };
  }

  // Verify calling user owns this application, and take the student from it
  const { data: appOwner } = await supabase
    .from("application")
    .select("id, student_id, guardian:guardian_id (user_id)")
    .eq("id", input.application_id)
    .single();
  const appGuardian = appOwner?.guardian as unknown as { user_id: string } | null;
  if (!appGuardian || appGuardian.user_id !== user.id) {
    return { data: null, error: "Not authorized" };
  }

  const studentId = (appOwner?.student_id as string | null) ?? null;
  if (!studentId) {
    return { data: null, error: "This application has no student on file." };
  }

  const { data: doc, error } = await supabase
    .from("document")
    .insert({
      application_id: input.application_id,
      student_id: studentId,
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
