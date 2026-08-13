"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { requireStaffSession, requireRoleOnCampus } from "@/lib/auth/get-session";
import { AuditAction, logAuditEvent } from "@/lib/audit";

/** Upper bound on a single capacity plan's seat count. */
const MAX_TOTAL_SEATS = 2000;

/**
 * Change a capacity plan's total seats.
 *
 * Total seats is the number every downstream number is measured against:
 * offers to extend, waitlist position, fill rate, the release-seats queue on
 * /staff/today. Any staff member could previously set it to anything, and the
 * change left no trace. Three things had to be true and now are:
 *
 *   1. The caller holds enrollment_manager or better ON THE PLAN'S OWN
 *      CAMPUS, not merely somewhere in the network.
 *   2. The value is a plausible seat count, not a negative number or a
 *      fractional one that silently corrupts every ratio computed from it.
 *   3. The old and new values are written to the audit trail, so a disputed
 *      seat count can be traced to who changed it and when.
 *
 * The campus lookup and role gate sit OUTSIDE the try block deliberately.
 * requireRoleOnCampus denies by redirecting, and Next signals a redirect by
 * throwing, so a catch-all around it would swallow the redirect and report a
 * generic failure instead.
 */
export async function staffUpdateCapacity(
  planId: string,
  totalSeats: number
): Promise<{ error: string | null }> {
  // Auth-first: prove staff before touching the database at all. This is the
  // per-request cached session, so the role gate below costs no extra call.
  await requireStaffSession();

  const supabase = createServiceRoleClient();

  // Resolve the plan's REAL campus from its id. Never trust a campus supplied
  // by the caller — that is the value an attacker controls.
  const { data: plan } = await supabase
    .from("capacity_plan")
    .select("campus_id, total_seats")
    .eq("id", planId)
    .single();

  if (!plan) {
    return { error: "You do not have access to modify this capacity plan." };
  }

  const campusId = plan.campus_id as string;
  const session = await requireRoleOnCampus(campusId, "enrollment_manager");

  if (!Number.isInteger(totalSeats)) {
    return { error: "Total seats must be a whole number." };
  }
  if (totalSeats < 0) {
    return { error: "Total seats cannot be negative." };
  }
  if (totalSeats > MAX_TOTAL_SEATS) {
    return { error: `Total seats cannot exceed ${MAX_TOTAL_SEATS}.` };
  }

  const previousSeats = (plan.total_seats as number | null) ?? null;

  try {
    const { error } = await supabase
      .from("capacity_plan")
      .update({ total_seats: totalSeats })
      .eq("id", planId);

    if (error) return { error: error.message };

    await logAuditEvent({
      table_name: "capacity_plan",
      record_id: planId,
      action: AuditAction.Update,
      actor_id: session.user_id,
      campus_id: campusId,
      old_data: { total_seats: previousSeats },
      new_data: { total_seats: totalSeats },
    });

    revalidatePath("/staff/seats");
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/today");
    revalidatePath("/staff/reports");
    return { error: null };
  } catch {
    return { error: "Failed to update capacity" };
  }
}
