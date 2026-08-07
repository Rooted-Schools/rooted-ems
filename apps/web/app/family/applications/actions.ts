"use server";

import { revalidatePath } from "next/cache";
import {
  createApplication,
  updateApplication,
  submitApplication,
  withdrawApplication,
  acceptOffer,
  declineOffer,
  createDocumentRecord,
  type CreateApplicationInput,
  type UpdateApplicationInput,
} from "@/lib/mutations";
import { createFamilyResponse } from "@/lib/mutations/notes";
import { createEnrollment, initializeRegistrationPacket } from "@/lib/mutations";
import {
  familyUpdateApplicationStatus,
  requireApplicationOwner,
} from "@/lib/mutations/applications";
import { notifyStaffOfFamilyResponse, notifyOnApplicationSubmit } from "@/lib/notify";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { requireSession } from "@/lib/auth/get-session";

// ─── Create Draft ──────────────────────────────────────

export async function familyCreateApplication(input: CreateApplicationInput) {
  await requireSession();
  const result = await createApplication(input);

  if (!result.error) {
    revalidatePath("/family/applications");
    revalidatePath("/family/dashboard");
  }

  return result;
}

// ─── Update Draft ──────────────────────────────────────

export async function familyUpdateApplication(input: UpdateApplicationInput) {
  await requireSession();
  const result = await updateApplication(input);

  if (!result.error) {
    revalidatePath("/family/applications");
    revalidatePath(`/family/applications/${input.application_id}`);
  }

  return result;
}

// ─── Submit ────────────────────────────────────────────

export async function familySubmitApplication(applicationId: string) {
  await requireSession();
  const result = await submitApplication(applicationId);

  if (!result.error) {
    revalidatePath("/family/applications");
    revalidatePath(`/family/applications/${applicationId}`);
    revalidatePath("/family/dashboard");

    // Non-blocking: confirm receipt to the family + alert enrollment staff
    notifyOnApplicationSubmit(applicationId).catch((err) =>
      console.error("[familySubmitApplication] notification failed", err)
    );
  }

  return result;
}

// ─── Withdraw ──────────────────────────────────────────

export async function familyWithdrawApplication(
  applicationId: string,
  reason?: string
) {
  await requireSession();
  const result = await withdrawApplication(applicationId, reason);

  if (!result.error) {
    revalidatePath("/family/applications");
    revalidatePath(`/family/applications/${applicationId}`);
    revalidatePath("/family/dashboard");
  }

  return result;
}

// ─── Accept Offer ─────────────────────────────────────

export async function familyAcceptOffer(
  offerId: string,
  guardianId: string,
  applicationId: string
) {
  await requireSession();
  const result = await acceptOffer(offerId, guardianId);

  if (!result.error) {
    revalidatePath("/family/applications");
    revalidatePath(`/family/applications/${applicationId}`);
    revalidatePath("/family/dashboard");
    revalidatePath("/family/registration");
    revalidatePath("/staff/enrollment");
    revalidatePath("/staff/offers");
  }

  return result;
}

// ─── Decline Offer ────────────────────────────────────

export async function familyDeclineOffer(
  offerId: string,
  applicationId: string
) {
  await requireSession();
  const result = await declineOffer(offerId);

  if (!result.error) {
    revalidatePath("/family/applications");
    revalidatePath(`/family/applications/${applicationId}`);
    revalidatePath("/family/dashboard");
  }

  return result;
}

// ─── Upload Document Record ──────────────────────────

export async function familyCreateDocumentRecord(input: {
  application_id: string;
  student_id: string;
  document_type: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
}) {
  await requireSession();
  const result = await createDocumentRecord(input);

  if (!result.error) {
    revalidatePath("/family/documents");
    revalidatePath("/family/applications");
    revalidatePath(`/family/applications/${input.application_id}`);
    // Also bust the staff view so the document shows immediately
    revalidatePath(`/staff/applications/${input.application_id}`);
  }

  return result;
}

/** Fallback accept when no offer record exists — transitions status and creates enrollment. */
export async function familyAcceptDirect(applicationId: string) {
  await requireSession();

  // requireSession only proves someone is signed in. Accepting a seat, and
  // the enrollment record it creates, must be provably this family's own
  // application — otherwise any signed-in guardian could accept on behalf of
  // any applicant whose id they knew.
  const owner = await requireApplicationOwner(applicationId);
  if (owner.error) return { data: null, error: owner.error };

  const supabase = createServiceRoleClient();

  // Fetch the application to get student/campus/grade/school_year
  const { data: app } = await supabase
    .from("application")
    .select("student_id, campus_id, grade_level_id, enrollment_window:enrollment_window_id (school_year_id)")
    .eq("id", applicationId)
    .single();

  const result = await familyUpdateApplicationStatus(applicationId, "accepted");
  if (result.error) return result;

  // Create enrollment record
  if (app?.student_id) {
    const schoolYearId =
      (app.enrollment_window as unknown as Record<string, string> | null)?.school_year_id ?? "";
    const enrollResult = await createEnrollment({
      student_id: app.student_id,
      campus_id: app.campus_id,
      grade_level_id: app.grade_level_id,
      school_year_id: schoolYearId,
      application_id: applicationId,
    });
    if (!enrollResult.error && enrollResult.data && schoolYearId) {
      await initializeRegistrationPacket({
        enrollment_id: enrollResult.data.id,
        campus_id: app.campus_id,
        school_year_id: schoolYearId,
      });
    }
  }

  revalidatePath("/family/applications");
  revalidatePath(`/family/applications/${applicationId}`);
  revalidatePath("/family/dashboard");
  revalidatePath("/family/registration");
  return result;
}

export async function familyDeclineDirect(applicationId: string) {
  await requireSession();
  // Ownership is proven inside familyUpdateApplicationStatus — declining is
  // terminal, so acting on someone else's application would be unrecoverable.
  const result = await familyUpdateApplicationStatus(applicationId, "declined");
  if (!result.error) {
    revalidatePath("/family/applications");
    revalidatePath(`/family/applications/${applicationId}`);
    revalidatePath("/family/dashboard");
  }
  return result;
}

export async function familySubmitResponse(applicationId: string, message: string) {
  await requireSession();

  // Prove ownership before writing a note onto the application — the note is
  // visible to staff and attributed to this family, so it must be theirs.
  const owner = await requireApplicationOwner(applicationId);
  if (owner.error) return { data: null, error: owner.error };

  const result = await createFamilyResponse(applicationId, message);
  if (!result.error) {
    // Move status back to submitted so staff can see the family responded
    // and so the "needs info" form disappears for the family
    await familyUpdateApplicationStatus(
      applicationId,
      "submitted",
      "Family responded to information request"
    );
    revalidatePath(`/family/applications/${applicationId}`);
    revalidatePath("/family/applications");
    revalidatePath("/family/dashboard");

    // Non-blocking: notify staff that the family responded — failure must not affect the family's submission
    notifyStaffOfFamilyResponse(applicationId).catch((err) =>
      console.error("[familySubmitResponse] notification failed", err)
    );
  }
  return result;
}
