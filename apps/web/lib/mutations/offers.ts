import { createServerClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";

// ─── Types ─────────────────────────────────────────────

export interface SendOfferInput {
  application_id: string;
  campus_id: string;
  grade_level_id: string;
  lottery_entry_id?: string;
  expires_at: string; // ISO timestamp
  offered_by: string; // user_id of staff member
}

// ─── Mutations ─────────────────────────────────────────

/**
 * Send a seat offer to an applicant.
 * Transitions application status to "offered".
 */
export async function sendOffer(
  input: SendOfferInput
): Promise<MutationResult<{ id: string }>> {
  const supabase = await createServerClient();

  // Create the offer record
  const { data: offer, error: offerError } = await supabase
    .from("offer")
    .insert({
      application_id: input.application_id,
      campus_id: input.campus_id,
      grade_level_id: input.grade_level_id,
      lottery_entry_id: input.lottery_entry_id ?? null,
      status: "pending",
      offered_at: new Date().toISOString(),
      expires_at: input.expires_at,
      offered_by: input.offered_by,
    })
    .select("id")
    .single();

  if (offerError) {
    console.error("[sendOffer]", offerError.message);
    return { data: null, error: "Failed to create offer." };
  }

  // Update application status to "offered"
  const { error: statusError } = await supabase
    .from("application")
    .update({ status: "offered", updated_at: new Date().toISOString() })
    .eq("id", input.application_id);

  if (statusError) {
    console.error("[sendOffer] status update", statusError.message);
  }

  return { data: { id: offer.id }, error: null };
}

/**
 * Accept an offer (called by family or staff on behalf of family).
 * Creates an acceptance record and transitions app status to "accepted".
 */
export async function acceptOffer(
  offerId: string,
  guardianId: string
): Promise<MutationResult> {
  const supabase = await createServerClient();

  // Get the offer
  const { data: offer, error: fetchError } = await supabase
    .from("offer")
    .select("id, application_id, status")
    .eq("id", offerId)
    .single();

  if (fetchError || !offer) {
    return { data: null, error: "Offer not found." };
  }

  if (offer.status !== "pending") {
    return { data: null, error: `Offer is ${offer.status}, cannot accept.` };
  }

  // Update offer status
  const { error: offerUpdateError } = await supabase
    .from("offer")
    .update({
      status: "accepted",
      responded_at: new Date().toISOString(),
    })
    .eq("id", offerId);

  if (offerUpdateError) {
    return { data: null, error: "Failed to update offer." };
  }

  // Create acceptance record
  const { error: acceptError } = await supabase
    .from("acceptance")
    .insert({
      offer_id: offerId,
      application_id: offer.application_id,
      accepted_by: guardianId,
      accepted_at: new Date().toISOString(),
    });

  if (acceptError) {
    console.error("[acceptOffer] acceptance record", acceptError.message);
  }

  // Update application status
  const { error: statusError } = await supabase
    .from("application")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", offer.application_id);

  if (statusError) {
    console.error("[acceptOffer] app status", statusError.message);
  }

  return { data: null, error: null };
}

/**
 * Decline an offer (called by family).
 */
export async function declineOffer(offerId: string): Promise<MutationResult> {
  const supabase = await createServerClient();

  const { data: offer, error: fetchError } = await supabase
    .from("offer")
    .select("id, application_id, status")
    .eq("id", offerId)
    .single();

  if (fetchError || !offer) {
    return { data: null, error: "Offer not found." };
  }

  if (offer.status !== "pending") {
    return { data: null, error: `Offer is ${offer.status}, cannot decline.` };
  }

  const { error } = await supabase
    .from("offer")
    .update({
      status: "declined",
      responded_at: new Date().toISOString(),
    })
    .eq("id", offerId);

  if (error) {
    return { data: null, error: "Failed to decline offer." };
  }

  // Update application status
  await supabase
    .from("application")
    .update({ status: "declined", updated_at: new Date().toISOString() })
    .eq("id", offer.application_id);

  return { data: null, error: null };
}

/**
 * Revoke an offer (staff action).
 */
export async function revokeOffer(
  offerId: string,
  revokedBy: string,
  reason?: string
): Promise<MutationResult> {
  const supabase = await createServerClient();

  const { data: offer, error: fetchError } = await supabase
    .from("offer")
    .select("id, application_id, status")
    .eq("id", offerId)
    .single();

  if (fetchError || !offer) {
    return { data: null, error: "Offer not found." };
  }

  if (offer.status !== "pending") {
    return { data: null, error: `Offer is ${offer.status}, cannot revoke.` };
  }

  const { error } = await supabase
    .from("offer")
    .update({
      status: "revoked",
      revoked_by: revokedBy,
      revoke_reason: reason ?? null,
      responded_at: new Date().toISOString(),
    })
    .eq("id", offerId);

  if (error) {
    return { data: null, error: "Failed to revoke offer." };
  }

  // Revert application to verified so it can re-enter lottery/offer flow
  await supabase
    .from("application")
    .update({ status: "verified", updated_at: new Date().toISOString() })
    .eq("id", offer.application_id);

  return { data: null, error: null };
}

/**
 * Expire an offer (called by cron or manual staff action).
 */
export async function expireOffer(offerId: string): Promise<MutationResult> {
  const supabase = await createServerClient();

  const { error } = await supabase
    .from("offer")
    .update({
      status: "expired",
      responded_at: new Date().toISOString(),
    })
    .eq("id", offerId)
    .eq("status", "pending");

  if (error) {
    return { data: null, error: "Failed to expire offer." };
  }

  // Get app ID to update status
  const { data: offer } = await supabase
    .from("offer")
    .select("application_id")
    .eq("id", offerId)
    .single();

  if (offer) {
    await supabase
      .from("application")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", offer.application_id);
  }

  return { data: null, error: null };
}
