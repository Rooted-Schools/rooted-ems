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
import { updateApplicationStatus } from "@/lib/mutations";

// ─── Create Draft ──────────────────────────────────────

export async function familyCreateApplication(input: CreateApplicationInput) {
  const result = await createApplication(input);

  if (!result.error) {
    revalidatePath("/family/applications");
    revalidatePath("/family/dashboard");
  }

  return result;
}

// ─── Update Draft ──────────────────────────────────────

export async function familyUpdateApplication(input: UpdateApplicationInput) {
  const result = await updateApplication(input);

  if (!result.error) {
    revalidatePath("/family/applications");
    revalidatePath(`/family/applications/${input.application_id}`);
  }

  return result;
}

// ─── Submit ────────────────────────────────────────────

export async function familySubmitApplication(applicationId: string) {
  const result = await submitApplication(applicationId);

  if (!result.error) {
    revalidatePath("/family/applications");
    revalidatePath(`/family/applications/${applicationId}`);
    revalidatePath("/family/dashboard");
  }

  return result;
}

// ─── Withdraw ──────────────────────────────────────────

export async function familyWithdrawApplication(
  applicationId: string,
  reason?: string
) {
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
  const result = await createDocumentRecord(input);

  if (!result.error) {
    revalidatePath("/family/documents");
    revalidatePath("/family/applications");
    revalidatePath(`/family/applications/${input.application_id}`);
  }

  return result;
}

/** Fallback accept/decline when no offer record exists (legacy or direct-offer flow). */
export async function familyAcceptDirect(applicationId: string) {
  const result = await updateApplicationStatus(applicationId, "accepted");
  if (!result.error) {
    revalidatePath("/family/applications");
    revalidatePath(`/family/applications/${applicationId}`);
    revalidatePath("/family/dashboard");
    revalidatePath("/family/registration");
  }
  return result;
}

export async function familyDeclineDirect(applicationId: string) {
  const result = await updateApplicationStatus(applicationId, "declined");
  if (!result.error) {
    revalidatePath("/family/applications");
    revalidatePath(`/family/applications/${applicationId}`);
    revalidatePath("/family/dashboard");
  }
  return result;
}

export async function familySubmitResponse(applicationId: string, message: string) {
  const result = await createFamilyResponse(applicationId, message);
  if (!result.error) {
    revalidatePath(`/family/applications/${applicationId}`);
  }
  return result;
}
