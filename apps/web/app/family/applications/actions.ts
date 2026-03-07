"use server";

import { revalidatePath } from "next/cache";
import {
  createApplication,
  updateApplication,
  submitApplication,
  withdrawApplication,
  acceptOffer,
  declineOffer,
  type CreateApplicationInput,
  type UpdateApplicationInput,
} from "@/lib/mutations";

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
