"use server";

import { revalidatePath } from "next/cache";
import { updateApplicationStatus, withdrawApplication } from "@/lib/mutations";
import { createNote } from "@/lib/mutations";
import { reviewDocument } from "@/lib/mutations";
import { sendOffer } from "@/lib/mutations/offers";
import { verifyRegistrationItem } from "@/lib/mutations/registration";
import { getSession } from "@/lib/auth/get-session";

// ─── Status Transition ─────────────────────────────────

export async function changeApplicationStatus(
  applicationId: string,
  newStatus: string,
  reason?: string
) {
  const result = await updateApplicationStatus(applicationId, newStatus, reason);

  if (!result.error) {
    revalidatePath(`/staff/applications/${applicationId}`);
    revalidatePath("/staff/applications");
    revalidatePath("/staff/dashboard");
  }

  return result;
}

// ─── Withdraw ──────────────────────────────────────────

export async function staffWithdrawApplication(
  applicationId: string,
  reason?: string
) {
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
  const result = await reviewDocument(documentId, decision, rejectionReason);

  if (!result.error) {
    revalidatePath(`/staff/applications/${applicationId}`);
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
  const session = await getSession();
  if (!session?.user_id) return { data: null, error: "Not authenticated" };

  const result = await verifyRegistrationItem(itemId, session.user_id);

  if (!result.error) {
    revalidatePath(`/staff/applications/${applicationId}`);
    revalidatePath("/staff/enrollment");
  }

  return result;
}
