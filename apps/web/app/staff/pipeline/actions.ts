"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { requireStaffSession, getAccessibleCampusIds } from "@/lib/auth/get-session";
import {
  bulkChangeApplicationStatus,
  sendNotification,
  type BulkItemResult,
} from "@/lib/mutations";

export type { BulkItemResult };

/**
 * "Request the same document" — the Pipeline bulk bar's primary action on the
 * Needs review tab. Reuses the exact same state-machine-validated mutation as
 * the Applications bulk bar (bulkChangeApplicationStatus -> needs_info), so
 * the same honesty guarantees apply: rows that cannot legally move to
 * needs_info (e.g. already needs_info — the document was already requested)
 * are skipped and reported, never forced. notifyFamilyNeedsInfo (fired inside
 * bulkChangeApplicationStatus) is in-app only today — no email/SMS claim is
 * made, matching what actually happens.
 */
export async function requestSameDocument(
  applicationIds: string[],
  causeLabel: string
): Promise<BulkItemResult[]> {
  await requireStaffSession();
  const reason = `Please upload: ${causeLabel}.`;
  const results = await bulkChangeApplicationStatus(applicationIds, "needs_info", reason);

  if (results.some((r) => r.ok)) {
    revalidatePath("/staff/pipeline");
    revalidatePath("/staff/applications");
    revalidatePath("/staff/today");
  }

  return results;
}

export interface MessageSelectionResult {
  ok: boolean;
  /** Families that actually received an in-app notification (real guardian on file). */
  notified: number;
  /** Applications considered (in-scope, campus-checked). */
  total: number;
  error?: string;
}

/**
 * "Message" bulk action — sends a real in-app notification (not a queued
 * placeholder) to every guardian on the selected applications. Unlike email/
 * SMS, the in_app channel in lib/mutations/communications.ts writes real
 * `notification` rows synchronously, so "notified" here is a true count, not
 * an optimistic guess — families see this in their portal the moment this
 * resolves.
 */
export async function messageSelection(
  applicationIds: string[],
  body: string
): Promise<MessageSelectionResult> {
  const session = await requireStaffSession();
  const accessibleIds = getAccessibleCampusIds(session);

  const trimmed = body.trim();
  if (!trimmed) {
    return { ok: false, notified: 0, total: 0, error: "Message body is empty." };
  }
  if (applicationIds.length === 0) {
    return { ok: true, notified: 0, total: 0 };
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("application")
    .select("id, campus_id, guardian:guardian_id (user_id)")
    .in("id", applicationIds);

  if (error) {
    console.error("[messageSelection]", error.message);
    return { ok: false, notified: 0, total: 0, error: "Could not load the selected applications." };
  }

  const rows = (data ?? []).filter((row: Record<string, unknown>) =>
    accessibleIds.length === 0 || accessibleIds.includes(row.campus_id as string)
  );

  const userIds = [
    ...new Set(
      rows
        .map((row: Record<string, unknown>) => (row.guardian as Record<string, unknown> | null)?.user_id as string | undefined)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  if (userIds.length === 0) {
    return { ok: true, notified: 0, total: rows.length };
  }

  const result = await sendNotification({
    recipientUserIds: userIds,
    channel: "in_app",
    subject: "Message from the enrollment team",
    body: trimmed,
    link: "/family/applications",
  });

  if (result.error) {
    return { ok: false, notified: 0, total: rows.length, error: result.error };
  }

  return { ok: true, notified: userIds.length, total: rows.length };
}
