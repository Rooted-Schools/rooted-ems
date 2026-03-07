import { createServerClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";

// ─── Types ─────────────────────────────────────────────

export interface AddToWaitlistInput {
  waitlist_id: string;
  application_id: string;
  position_number: number;
}

// ─── Mutations ─────────────────────────────────────────

/**
 * Add an application to a waitlist at a given position.
 * Updates the application status to "waitlisted".
 */
export async function addToWaitlist(
  input: AddToWaitlistInput
): Promise<MutationResult<{ id: string }>> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("waitlist_position")
    .insert({
      waitlist_id: input.waitlist_id,
      application_id: input.application_id,
      position_number: input.position_number,
      added_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("[addToWaitlist]", error.message);
    return { data: null, error: "Failed to add to waitlist." };
  }

  // Update application status
  await supabase
    .from("application")
    .update({ status: "waitlisted", updated_at: new Date().toISOString() })
    .eq("id", input.application_id);

  return { data: { id: data.id }, error: null };
}

/**
 * Promote a student from the waitlist — removes them and creates an offer.
 * This is the most common waitlist action.
 */
export async function promoteFromWaitlist(
  waitlistPositionId: string,
  offeredBy: string,
  expiresAt: string
): Promise<MutationResult<{ offer_id: string }>> {
  const supabase = await createServerClient();

  // Get the waitlist position with related data
  const { data: position, error: fetchError } = await supabase
    .from("waitlist_position")
    .select(`
      id, application_id, waitlist_id,
      waitlist:waitlist_id (campus_id, grade_level_id)
    `)
    .eq("id", waitlistPositionId)
    .is("removed_at", null)
    .single();

  if (fetchError || !position) {
    return { data: null, error: "Waitlist position not found." };
  }

  const pos = position as unknown as Record<string, unknown>;
  const wl = pos.waitlist as unknown as Record<string, string> | null;

  if (!wl) {
    return { data: null, error: "Waitlist data not found." };
  }

  // Mark position as promoted
  const { error: updateError } = await supabase
    .from("waitlist_position")
    .update({
      promoted_at: new Date().toISOString(),
      removed_at: new Date().toISOString(),
      removal_reason: "promoted",
    })
    .eq("id", waitlistPositionId);

  if (updateError) {
    return { data: null, error: "Failed to update waitlist position." };
  }

  // Create an offer for this student
  const { data: offer, error: offerError } = await supabase
    .from("offer")
    .insert({
      application_id: pos.application_id as string,
      campus_id: wl.campus_id,
      grade_level_id: wl.grade_level_id,
      status: "pending",
      offered_at: new Date().toISOString(),
      expires_at: expiresAt,
      offered_by: offeredBy,
    })
    .select("id")
    .single();

  if (offerError) {
    console.error("[promoteFromWaitlist] offer", offerError.message);
    return { data: null, error: "Failed to create offer." };
  }

  // Update application status to offered
  await supabase
    .from("application")
    .update({ status: "offered", updated_at: new Date().toISOString() })
    .eq("id", pos.application_id as string);

  return { data: { offer_id: offer.id }, error: null };
}

/**
 * Remove a student from the waitlist (withdrawn, no longer interested, etc.)
 */
export async function removeFromWaitlist(
  waitlistPositionId: string,
  reason: string
): Promise<MutationResult> {
  const supabase = await createServerClient();

  const { error } = await supabase
    .from("waitlist_position")
    .update({
      removed_at: new Date().toISOString(),
      removal_reason: reason,
    })
    .eq("id", waitlistPositionId)
    .is("removed_at", null);

  if (error) {
    return { data: null, error: "Failed to remove from waitlist." };
  }

  return { data: null, error: null };
}

/**
 * Ensure a waitlist record exists for a campus/grade/school_year.
 * Returns the waitlist ID (creates if needed).
 */
export async function ensureWaitlist(
  campusId: string,
  gradeLevelId: string,
  schoolYearId: string,
  enrollmentWindowId: string
): Promise<MutationResult<{ id: string }>> {
  const supabase = await createServerClient();

  // Try to find existing
  const { data: existing } = await supabase
    .from("waitlist")
    .select("id")
    .eq("campus_id", campusId)
    .eq("grade_level_id", gradeLevelId)
    .eq("school_year_id", schoolYearId)
    .single();

  if (existing) {
    return { data: { id: existing.id }, error: null };
  }

  // Create new
  const { data, error } = await supabase
    .from("waitlist")
    .insert({
      campus_id: campusId,
      grade_level_id: gradeLevelId,
      school_year_id: schoolYearId,
      enrollment_window_id: enrollmentWindowId,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    return { data: null, error: "Failed to create waitlist." };
  }

  return { data: { id: data.id }, error: null };
}
