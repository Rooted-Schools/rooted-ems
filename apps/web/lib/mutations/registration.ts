import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";

// ─── Types ─────────────────────────────────────────────

export interface InitializePacketInput {
  enrollment_id: string;
  campus_id: string;
  school_year_id: string;
}

export interface CompleteRegistrationItemInput {
  item_id: string;
  data?: Record<string, unknown>;
}

// ─── Mutations ─────────────────────────────────────────

/**
 * Initialize a registration packet for an enrollment.
 * Creates the packet record + individual items based on campus/year requirements.
 */
export async function initializeRegistrationPacket(
  input: InitializePacketInput
): Promise<MutationResult<{ packet_id: string; items_created: number }>> {
  const supabase = createServiceRoleClient();

  // Check if packet already exists
  const { data: existing } = await supabase
    .from("registration_packet")
    .select("id")
    .eq("enrollment_id", input.enrollment_id)
    .single();

  if (existing) {
    return { data: { packet_id: existing.id, items_created: 0 }, error: null };
  }

  // Create packet
  const { data: packet, error: packetError } = await supabase
    .from("registration_packet")
    .insert({
      enrollment_id: input.enrollment_id,
      status: "pending",
      started_at: null,
      submitted_at: null,
      verified_at: null,
    })
    .select("id")
    .single();

  if (packetError) {
    console.error("[initializeRegistrationPacket]", packetError.message);
    return { data: null, error: "Failed to create registration packet." };
  }

  // Fetch requirements for this campus/year
  const { data: requirements } = await supabase
    .from("packet_requirement")
    .select("item_type")
    .eq("campus_id", input.campus_id)
    .eq("school_year_id", input.school_year_id)
    .eq("is_active", true)
    .order("sort_order");

  // Create registration items for each requirement
  let itemsCreated = 0;
  if (requirements && requirements.length > 0) {
    const itemInserts = requirements.map((req: { item_type: string }) => ({
      enrollment_id: input.enrollment_id,
      item_type: req.item_type,
      status: "pending",
      data: {},
    }));

    const { error: itemsError } = await supabase
      .from("registration_item")
      .insert(itemInserts);

    if (itemsError) {
      console.error("[initializeRegistrationPacket] items", itemsError.message);
      // Packet created but items failed — still return packet
    } else {
      itemsCreated = requirements.length;
    }
  }

  return { data: { packet_id: packet.id, items_created: itemsCreated }, error: null };
}

/**
 * Seed registration_item rows for an enrollment whose packet already exists
 * but whose items were never created (e.g. due to a prior RLS failure).
 * Safe to call multiple times — skips item_types that already have a row.
 */
export async function seedMissingRegistrationItems(input: {
  enrollment_id: string;
  packet_id: string;
  campus_id: string;
  school_year_id: string;
}): Promise<MutationResult<{ items_created: number }>> {
  const supabase = createServiceRoleClient();

  // Fetch requirements for this campus/year
  const { data: requirements } = await supabase
    .from("packet_requirement")
    .select("item_type")
    .eq("campus_id", input.campus_id)
    .eq("school_year_id", input.school_year_id)
    .eq("is_active", true)
    .order("sort_order");

  if (!requirements || requirements.length === 0) {
    return { data: { items_created: 0 }, error: null };
  }

  // Find which item_types already have rows
  const { data: existing } = await supabase
    .from("registration_item")
    .select("item_type")
    .eq("enrollment_id", input.enrollment_id);

  const existingTypes = new Set((existing ?? []).map((r: { item_type: string }) => r.item_type));

  const missing = requirements.filter(
    (req: { item_type: string }) => !existingTypes.has(req.item_type)
  );

  if (missing.length === 0) {
    return { data: { items_created: 0 }, error: null };
  }

  const inserts = missing.map((req: { item_type: string }) => ({
    enrollment_id: input.enrollment_id,
    item_type: req.item_type,
    status: "pending",
    data: {},
  }));

  const { error } = await supabase.from("registration_item").insert(inserts);

  if (error) {
    console.error("[seedMissingRegistrationItems]", error.message);
    return { data: null, error: "Failed to seed registration items." };
  }

  return { data: { items_created: missing.length }, error: null };
}

/**
 * Complete (submit) a registration item.
 * Sets status to "submitted" with optional data payload.
 */
export async function completeRegistrationItem(
  input: CompleteRegistrationItemInput
): Promise<MutationResult> {
  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from("registration_item")
    .update({
      status: "submitted",
      signed_at: new Date().toISOString(),
      data: input.data ?? {},
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.item_id)
    .eq("status", "pending"); // Only update if still pending

  if (error) {
    console.error("[completeRegistrationItem]", error.message);
    return { data: null, error: "Failed to complete registration item." };
  }

  // Check if all items for this enrollment are now submitted/verified
  // First get enrollment_id from the item
  const { data: item } = await supabase
    .from("registration_item")
    .select("enrollment_id")
    .eq("id", input.item_id)
    .single();

  if (item) {
    const { data: pendingItems } = await supabase
      .from("registration_item")
      .select("id")
      .eq("enrollment_id", item.enrollment_id)
      .eq("status", "pending");

    // If no more pending items, update packet status to "submitted"
    if (!pendingItems || pendingItems.length === 0) {
      await supabase
        .from("registration_packet")
        .update({
          status: "submitted",
          submitted_at: new Date().toISOString(),
        })
        .eq("enrollment_id", item.enrollment_id);
    } else {
      // At least one item is done — mark packet as "in_progress"
      await supabase
        .from("registration_packet")
        .update({
          status: "in_progress",
          started_at: new Date().toISOString(),
        })
        .eq("enrollment_id", item.enrollment_id)
        .eq("status", "pending"); // Only update from pending → in_progress
    }
  }

  return { data: null, error: null };
}

/**
 * Submit the full registration packet (after all items are completed).
 */
export async function submitRegistrationPacket(
  enrollmentId: string
): Promise<MutationResult> {
  const supabase = createServiceRoleClient();

  // Check all items are submitted or verified
  const { data: pendingItems } = await supabase
    .from("registration_item")
    .select("id, item_type")
    .eq("enrollment_id", enrollmentId)
    .eq("status", "pending");

  if (pendingItems && pendingItems.length > 0) {
    return {
      data: null,
      error: `${pendingItems.length} required item(s) still pending.`,
    };
  }

  // Update packet status
  const { error } = await supabase
    .from("registration_packet")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .eq("enrollment_id", enrollmentId);

  if (error) {
    console.error("[submitRegistrationPacket]", error.message);
    return { data: null, error: "Failed to submit registration packet." };
  }

  // Update application status to "registered" if enrollment has an application
  const { data: enrollment } = await supabase
    .from("enrollment")
    .select("application_id")
    .eq("id", enrollmentId)
    .single();

  if (enrollment?.application_id) {
    await supabase
      .from("application")
      .update({ status: "registered", updated_at: new Date().toISOString() })
      .eq("id", enrollment.application_id);
  }

  return { data: null, error: null };
}

/**
 * Verify a registration item (staff action).
 */
export async function verifyRegistrationItem(
  itemId: string,
  verifiedBy: string
): Promise<MutationResult> {
  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from("registration_item")
    .update({
      status: "verified",
      verified_at: new Date().toISOString(),
      verified_by: verifiedBy,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) {
    console.error("[verifyRegistrationItem]", error.message);
    return { data: null, error: "Failed to verify registration item." };
  }

  // Check if all items are verified — if so, mark packet as "complete"
  const { data: item } = await supabase
    .from("registration_item")
    .select("enrollment_id")
    .eq("id", itemId)
    .single();

  if (item) {
    const { data: unverified } = await supabase
      .from("registration_item")
      .select("id")
      .eq("enrollment_id", item.enrollment_id)
      .neq("status", "verified");

    if (!unverified || unverified.length === 0) {
      await supabase
        .from("registration_packet")
        .update({
          status: "complete",
          verified_at: new Date().toISOString(),
        })
        .eq("enrollment_id", item.enrollment_id);
    }
  }

  return { data: null, error: null };
}
