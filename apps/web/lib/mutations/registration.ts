import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";
import {
  notifyFamilyRegistrationComplete,
  notifyFamilyRegistrationReady,
  notifyFamilyRegistrationSubmitted,
  notifyStaffRegistrationSubmitted,
} from "@/lib/notify";

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
    // A packet already exists — most often a re-enrolling family whose packet
    // was created on an earlier pass. Returning silently meant nobody ever
    // told them it was waiting, so the "ready to complete" notification fires
    // on this path too. Never-throw, same as the create path below.
    await notifyPacketReady(supabase, input);
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

  // Notify family that their registration packet is ready to complete
  await notifyPacketReady(supabase, input);

  return { data: { packet_id: packet.id, items_created: itemsCreated }, error: null };
}

/**
 * Tell the family their registration packet is waiting. Shared by both
 * initializeRegistrationPacket paths (fresh packet and already-exists) so a
 * re-enrolling family hears about it either way. Never throws.
 */
async function notifyPacketReady(
  supabase: ReturnType<typeof createServiceRoleClient>,
  input: InitializePacketInput
): Promise<void> {
  const { data: enrollmentRow } = await supabase
    .from("enrollment")
    .select("application_id")
    .eq("id", input.enrollment_id)
    .single();
  if (!enrollmentRow?.application_id) return;
  notifyFamilyRegistrationReady({
    applicationId: enrollmentRow.application_id as string,
    campusId: input.campus_id,
  }).catch(() => {});
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
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const supabase = createServiceRoleClient();

  // Verify the calling user owns this registration item via:
  // registration_item → enrollment → application → guardian → user_id
  const { data: itemCheck } = await supabase
    .from("registration_item")
    .select("id, enrollment:enrollment_id (application:application_id (guardian:guardian_id (user_id)))")
    .eq("id", input.item_id)
    .single();
  const itemGuardian = (itemCheck?.enrollment as unknown as { application: { guardian: { user_id: string } } } | null)?.application?.guardian ?? null;
  if (!itemGuardian || itemGuardian.user_id !== user.id) {
    return { data: null, error: "Not authorized" };
  }

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
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const supabase = createServiceRoleClient();

  // Verify the calling user owns this enrollment via:
  // enrollment → application → guardian → user_id
  const { data: enrollCheck } = await supabase
    .from("enrollment")
    .select("id, application:application_id (guardian:guardian_id (user_id))")
    .eq("id", enrollmentId)
    .single();
  const enrollGuardian = (enrollCheck?.application as unknown as { guardian: { user_id: string } } | null)?.guardian ?? null;
  if (!enrollGuardian || enrollGuardian.user_id !== user.id) {
    return { data: null, error: "Not authorized" };
  }

  // Get enrollment campus + school year so we can look up which items are required
  const { data: enrollment } = await supabase
    .from("enrollment")
    .select("campus_id, school_year_id, application_id")
    .eq("id", enrollmentId)
    .single();

  if (!enrollment) {
    return { data: null, error: "Enrollment not found." };
  }

  // Find which item types are marked required for this campus/year
  const { data: requiredReqs } = await supabase
    .from("packet_requirement")
    .select("item_type")
    .eq("campus_id", enrollment.campus_id)
    .eq("school_year_id", enrollment.school_year_id)
    .eq("is_required", true)
    .eq("is_active", true);

  const requiredTypes = (requiredReqs ?? []).map((r: Record<string, string>) => r.item_type);

  // Only block submission if a *required* item is still pending
  if (requiredTypes.length > 0) {
    const { data: pendingRequired } = await supabase
      .from("registration_item")
      .select("id, item_type")
      .eq("enrollment_id", enrollmentId)
      .eq("status", "pending")
      .in("item_type", requiredTypes);

    if (pendingRequired && pendingRequired.length > 0) {
      return {
        data: null,
        error: `${pendingRequired.length} required item(s) still need to be completed.`,
      };
    }
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

  // NOTE: application status stays "accepted" here.
  // It will move to "placement_review" only after staff verify all registration items.

  // Notify family confirmation + staff to begin verification — fire and forget
  notifyFamilyRegistrationSubmitted({
    enrollmentId,
    campusId: enrollment?.campus_id as string | undefined,
  }).catch(() => {});
  if (enrollment?.campus_id) {
    notifyStaffRegistrationSubmitted({
      campusId: enrollment.campus_id as string,
      enrollmentId,
    }).catch(() => {});
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
    await finalizePacketIfComplete(item.enrollment_id as string, supabase);
  }

  return { data: null, error: null };
}

/**
 * Flip a packet to "complete" — but only when it genuinely is.
 *
 * Two conditions, both required:
 *   1. Nothing is still awaiting staff review (status "submitted").
 *   2. No *required* item is still untouched (status "pending").
 *
 * Condition 2 is the fix: the old check looked at "submitted" alone, so a
 * required item the family never opened counted as done and the packet — and
 * with it the application — advanced on the strength of paperwork nobody
 * filled in. Optional pending items still don't block; staff waive those
 * deliberately through skipRegistrationItem.
 *
 * The flip is guarded on status != "complete" so a second verification on an
 * already-complete packet doesn't re-notify the family. Never throws.
 */
async function finalizePacketIfComplete(
  enrollmentId: string,
  supabase: ReturnType<typeof createServiceRoleClient>
): Promise<void> {
  const { data: stillSubmitted } = await supabase
    .from("registration_item")
    .select("id")
    .eq("enrollment_id", enrollmentId)
    .eq("status", "submitted");

  if (stillSubmitted && stillSubmitted.length > 0) return;

  const { data: enrollment } = await supabase
    .from("enrollment")
    .select("campus_id, school_year_id, student:student_id (first_name, last_name)")
    .eq("id", enrollmentId)
    .single();

  if (!enrollment) return;

  const { data: requiredReqs } = await supabase
    .from("packet_requirement")
    .select("item_type")
    .eq("campus_id", enrollment.campus_id as string)
    .eq("school_year_id", enrollment.school_year_id as string)
    .eq("is_required", true)
    .eq("is_active", true);

  const requiredTypes = (requiredReqs ?? []).map(
    (r: Record<string, string>) => r.item_type
  );

  if (requiredTypes.length > 0) {
    const { data: pendingRequired } = await supabase
      .from("registration_item")
      .select("id")
      .eq("enrollment_id", enrollmentId)
      .eq("status", "pending")
      .in("item_type", requiredTypes);

    if (pendingRequired && pendingRequired.length > 0) return;
  }

  const { data: flipped } = await supabase
    .from("registration_packet")
    .update({ status: "complete", verified_at: new Date().toISOString() })
    .eq("enrollment_id", enrollmentId)
    .neq("status", "complete")
    .select("id");

  // Move application to placement_review — next step is academic audit
  await advanceApplicationAfterPacketComplete(enrollmentId, supabase);

  // Only the run that actually flipped the packet tells the family, so a
  // repeat verification pass can't send "enrollment complete" twice.
  if (!flipped || flipped.length === 0) return;

  const student = enrollment.student as unknown as
    | { first_name?: string; last_name?: string }
    | null;
  const studentName = student
    ? [student.first_name, student.last_name].filter(Boolean).join(" ") || undefined
    : undefined;

  notifyFamilyRegistrationComplete({
    enrollmentId,
    studentName,
    campusId: (enrollment.campus_id as string) ?? undefined,
  }).catch((err) => console.error("[finalizePacketIfComplete] notify failed", err));
}

/**
 * Advance the linked application to placement_review once its packet is complete.
 * Tries enrollment.application_id first; falls back to matching by student/campus/year
 * for older records where application_id was not set on the enrollment row.
 */
async function advanceApplicationAfterPacketComplete(
  enrollmentId: string,
  supabase: ReturnType<typeof createServiceRoleClient>
) {
  const { data: enrollment } = await supabase
    .from("enrollment")
    .select("application_id, student_id, campus_id, school_year_id")
    .eq("id", enrollmentId)
    .single();

  if (!enrollment) return;

  // Primary path — application_id set directly on enrollment
  if (enrollment.application_id) {
    await supabase
      .from("application")
      .update({ status: "placement_review", updated_at: new Date().toISOString() })
      .eq("id", enrollment.application_id as string)
      .in("status", ["accepted", "registered"]); // only advance if not already past this point
    return;
  }

  // Fallback — find the application by matching student + campus + school_year
  const { data: app } = await supabase
    .from("application")
    .select("id")
    .eq("student_id", enrollment.student_id as string)
    .eq("campus_id", enrollment.campus_id as string)
    .in("status", ["accepted", "registered"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (app) {
    await supabase
      .from("application")
      .update({ status: "placement_review", updated_at: new Date().toISOString() })
      .eq("id", app.id);

    // Also patch the enrollment so future cascades use the fast path
    await supabase
      .from("enrollment")
      .update({ application_id: app.id })
      .eq("id", enrollmentId);
  }
}

/**
 * Skip (waive) an optional registration item that the family hasn't completed.
 * Marks it as verified so it doesn't block packet completion.
 * Only valid for items in "pending" status — items the family hasn't touched.
 */
export async function skipRegistrationItem(
  itemId: string,
  skippedBy: string
): Promise<MutationResult> {
  const supabase = createServiceRoleClient();

  const { data: existing } = await supabase
    .from("registration_item")
    .select("status, enrollment_id")
    .eq("id", itemId)
    .single();

  if (!existing) return { data: null, error: "Item not found." };
  if ((existing as Record<string, unknown>).status !== "pending") {
    return { data: null, error: "Only pending (unsubmitted) items can be skipped." };
  }

  const { error } = await supabase
    .from("registration_item")
    .update({
      status: "verified",
      verified_at: new Date().toISOString(),
      verified_by: skippedBy,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) {
    console.error("[skipRegistrationItem]", error.message);
    return { data: null, error: "Failed to skip item." };
  }

  // Run the same completion check — skipping may complete the packet
  const enrollmentId = (existing as Record<string, unknown>).enrollment_id as string;
  await finalizePacketIfComplete(enrollmentId, supabase);

  return { data: null, error: null };
}
