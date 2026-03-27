"use server";

import { revalidatePath } from "next/cache";
import { reviewDocument } from "@/lib/mutations";

export async function staffApproveDocument(documentId: string) {
  const result = await reviewDocument(documentId, "verified");

  if (!result.error) {
    revalidatePath("/staff/documents");
    revalidatePath("/staff/applications");
  }

  return result;
}

export async function staffRejectDocument(documentId: string, reason: string) {
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
