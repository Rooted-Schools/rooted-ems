"use server";

import { revalidatePath } from "next/cache";
import { updateApplicationStatus, withdrawApplication, createNote, reviewDocument } from "@/lib/mutations";
import { sendOffer } from "@/lib/mutations/offers";
import { verifyRegistrationItem, skipRegistrationItem } from "@/lib/mutations/registration";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { requireStaffSession } from "@/lib/auth/get-session";
import { notifyFamilyStudentEnrolled, notifyFamilyNeedsInfo, notifyFamilyDocumentRejected } from "@/lib/notify";

// ─── Status Transition ─────────────────────────────────

export async function changeApplicationStatus(
  applicationId: string,
  newStatus: string,
  reason?: string
) {
  await requireStaffSession();
  const result = await updateApplicationStatus(applicationId, newStatus, reason);

  if (!result.error) {
    revalidatePath(`/staff/applications/${applicationId}`);
    revalidatePath("/staff/applications");
    revalidatePath("/staff/dashboard");

    // When staff requests more info, notify the family — non-blocking so a
    // notification failure never prevents the status transition from succeeding.
    if (newStatus === "needs_info") {
      const supabase = createServiceRoleClient();
      supabase
        .from("application")
        .select("campus_id")
        .eq("id", applicationId)
        .single()
        .then(({ data: app }) => {
          notifyFamilyNeedsInfo({
            applicationId,
            applicationIdForLink: applicationId,
            message: reason,
            campusId: app?.campus_id ?? undefined,
          }).catch((err) =>
            console.error("[changeApplicationStatus] notifyFamilyNeedsInfo failed", err)
          );
        });
    }
  }

  return result;
}

// ─── Withdraw ──────────────────────────────────────────

export async function staffWithdrawApplication(
  applicationId: string,
  reason?: string
) {
  await requireStaffSession();
  const result = await withdrawApplication(applicationId, reason);

  if (!result.error) {
    revalidatePath(`/staff/applications/${applicationId}`);
    revalidatePath("/staff/applications");
    revalidatePath("/staff/dashboard");
  }

  return result;
}

// ─── Add Note ──────────────────────────────────────────

export async function addApplicationNote(
  applicationId: string,
  campusId: string,
  content: string
) {
  await requireStaffSession();
  const result = await createNote({
    entity_type: "application",
    entity_id: applicationId,
    campus_id: campusId,
    content,
    is_internal: true,
  });

  if (!result.error) {
    revalidatePath(`/staff/applications/${applicationId}`);
  }

  return result;
}

// ─── Review Document ───────────────────────────────────

export async function staffReviewDocument(
  documentId: string,
  applicationId: string,
  decision: "verified" | "rejected",
  rejectionReason?: string
) {
  await requireStaffSession();
  const result = await reviewDocument(documentId, decision, rejectionReason);

  if (!result.error) {
    revalidatePath(`/staff/applications/${applicationId}`);

    // On rejection, notify the family to re-upload — fire and forget
    if (decision === "rejected" && rejectionReason) {
      const supabase = createServiceRoleClient();
      const { data: doc } = await supabase
        .from("document")
        .select("document_type, application:application_id (campus_id)")
        .eq("id", documentId)
        .single();
      const docRow = doc as unknown as {
        document_type: string;
        application: { campus_id: string } | null;
      } | null;
      if (docRow?.document_type) {
        notifyFamilyDocumentRejected({
          applicationId,
          documentType: docRow.document_type,
          reason: rejectionReason,
          campusId: docRow.application?.campus_id,
        }).catch((err) =>
          console.error("[staffReviewDocument] rejection notification failed", err)
        );
      } else {
        console.warn("[staffReviewDocument] skipped rejection notification — document_type not found for document", documentId);
      }
    }
  }

  return result;
}

// ─── Make Offer ────────────────────────────────────────

export async function staffMakeOffer(
  applicationId: string,
  campusId: string,
  gradeLevelId: string,
  expiresAt: string,
  offeredBy: string
) {
  await requireStaffSession();
  const result = await sendOffer({
    application_id: applicationId,
    campus_id: campusId,
    grade_level_id: gradeLevelId,
    expires_at: expiresAt,
    offered_by: offeredBy,
  });

  if (!result.error) {
    revalidatePath(`/staff/applications/${applicationId}`);
    revalidatePath("/staff/applications");
    revalidatePath("/staff/offers");
    revalidatePath("/staff/dashboard");
  }

  return result;
}

// ─── Verify Registration Item ──────────────────────────

export async function staffVerifyRegistrationItem(
  itemId: string,
  applicationId: string
) {
  const session = await requireStaffSession();

  const result = await verifyRegistrationItem(itemId, session.user_id);

  if (!result.error) {
    revalidatePath(`/staff/applications/${applicationId}`);
    revalidatePath("/staff/enrollment");
    revalidatePath("/staff/dashboard");
  }

  return result;
}

// ─── Skip Optional Registration Item ──────────────────

export async function staffSkipRegistrationItem(
  itemId: string,
  applicationId: string
) {
  const session = await requireStaffSession();

  const result = await skipRegistrationItem(itemId, session.user_id);

  if (!result.error) {
    revalidatePath(`/staff/applications/${applicationId}`);
    revalidatePath("/staff/enrollment");
    revalidatePath("/staff/dashboard");
  }

  return result;
}

// ─── Complete Academic Audit ───────────────────────────

export async function staffCompleteAcademicAudit(
  applicationId: string,
  campusId: string,
  auditData: {
    confirmedGrade: string;
    placementNotes: string;
    academicSupports: string[];
    reviewedBy: string;
  }
) {
  await requireStaffSession();
  // Record audit as an internal note
  const noteContent = [
    `ACADEMIC AUDIT COMPLETE`,
    `Confirmed Grade: ${auditData.confirmedGrade}`,
    auditData.academicSupports.length > 0
      ? `Academic Supports: ${auditData.academicSupports.join(", ")}`
      : null,
    auditData.placementNotes ? `Notes: ${auditData.placementNotes}` : null,
    `Reviewed by: ${auditData.reviewedBy}`,
  ]
    .filter(Boolean)
    .join("\n");

  await createNote({
    entity_type: "application",
    entity_id: applicationId,
    campus_id: campusId,
    content: noteContent,
    is_internal: true,
  });

  // Advance application status to enrolled
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("application")
    .update({ status: "enrolled", updated_at: new Date().toISOString() })
    .eq("id", applicationId);

  if (error) return { data: null, error: error.message };

  // Fetch application details (student + campus) for enrollment activation + notification
  const { data: app } = await supabase
    .from("application")
    .select("student_id, campus_id, student:student_id (first_name, last_name)")
    .eq("id", applicationId)
    .single();

  // Activate the enrollment record — try application_id first, fall back to student+campus match
  const primaryUpdate = await supabase
    .from("enrollment")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("application_id", applicationId)
    .select("id");

  const noneUpdated = !primaryUpdate.data || primaryUpdate.data.length === 0;
  if (noneUpdated && app?.student_id) {
    // Fallback: match by student + campus for legacy records without application_id set
    const { data: fallbackEnrollment } = await supabase
      .from("enrollment")
      .select("id")
      .eq("student_id", app.student_id as string)
      .eq("campus_id", app.campus_id as string)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (fallbackEnrollment) {
      await supabase
        .from("enrollment")
        .update({ status: "active", application_id: applicationId, updated_at: new Date().toISOString() })
        .eq("id", fallbackEnrollment.id);
    }
  }

  const student = (app as unknown as Record<string, unknown>)?.student as Record<string, string> | null;
  const studentName = student ? `${student.first_name} ${student.last_name}` : undefined;
  const gradeLabel = auditData.confirmedGrade ?? undefined;

  // Fire celebratory notification — never block on this
  notifyFamilyStudentEnrolled({
    applicationId,
    studentName,
    campusId,
    gradeLabel,
  }).catch(() => {});

  revalidatePath(`/staff/applications/${applicationId}`);
  revalidatePath("/staff/applications");
  revalidatePath("/staff/enrollment");
  revalidatePath("/staff/dashboard");
  revalidatePath("/family/dashboard");
  revalidatePath("/family/registration");

  return { data: null, error: null };
}

// ─── Manually advance packet-complete application to placement_review ─────

export async function staffConfirmPacketComplete(applicationId: string) {
  await requireStaffSession();
  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from("application")
    .update({ status: "placement_review", updated_at: new Date().toISOString() })
    .eq("id", applicationId)
    .in("status", ["accepted", "registered"]);

  if (error) return { data: null, error: error.message };

  revalidatePath(`/staff/applications/${applicationId}`);
  revalidatePath("/staff/applications");
  revalidatePath("/staff/enrollment");
  revalidatePath("/staff/dashboard");

  return { data: null, error: null };
}

// ─── Generate Signed URL (service-role, bypasses storage RLS) ──────────────

export async function staffGetSignedUrl(
  storagePath: string
): Promise<{ url: string | null; error: string | null }> {
  if (!storagePath) return { url: null, error: "No file path provided." };

  await requireStaffSession();

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(storagePath, 3600); // 1-hour link

  if (error) return { url: null, error: error.message };
  return { url: data.signedUrl, error: null };
}
