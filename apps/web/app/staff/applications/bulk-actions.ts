"use server";

import { revalidatePath } from "next/cache";
import { requireStaffSession } from "@/lib/auth/get-session";
import {
  bulkChangeApplicationStatus,
  bulkSendOffers,
  type BulkItemResult,
} from "@/lib/mutations/bulk";

export type { BulkItemResult };

// ─── Bulk Status Change ────────────────────────────────

/**
 * Change status for many applications at once.
 * Per-item state-machine validation — invalid transitions are skipped and
 * reported, never forced. Returns one result per item.
 */
export async function staffBulkChangeStatus(
  applicationIds: string[],
  newStatus: string,
  reason?: string
): Promise<BulkItemResult[]> {
  await requireStaffSession();
  const results = await bulkChangeApplicationStatus(applicationIds, newStatus, reason);

  if (results.some((r) => r.ok)) {
    revalidatePath("/staff/applications");
    revalidatePath("/staff/dashboard");
  }

  return results;
}

// ─── Bulk Send Offers ──────────────────────────────────

/**
 * Send seat offers to many applications at once.
 * Reuses the single-item sendOffer mutation per row; rows that already have
 * a pending offer or are not in an offerable status are skipped and reported.
 */
export async function staffBulkSendOffers(
  applicationIds: string[],
  expiresAt: string
): Promise<BulkItemResult[]> {
  await requireStaffSession();
  const results = await bulkSendOffers(applicationIds, expiresAt);

  if (results.some((r) => r.ok)) {
    revalidatePath("/staff/applications");
    revalidatePath("/staff/offers");
    revalidatePath("/staff/dashboard");
  }

  return results;
}
