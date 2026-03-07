import { createServerClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";

// ─── Create Verification Checklist ─────────────────────

/**
 * Create default verification items for an application.
 * Typically called when application moves to 'submitted'.
 */
export async function createVerificationChecklist(
  applicationId: string
): Promise<MutationResult> {
  const supabase = await createServerClient();

  const defaultItems = [
    { item_name: "Student identity verified", is_required: true },
    { item_name: "Proof of residency verified", is_required: true },
    { item_name: "Immunization records verified", is_required: true },
    { item_name: "Previous school records reviewed", is_required: false },
    { item_name: "IEP/504 documentation reviewed", is_required: false },
    { item_name: "Guardian identity verified", is_required: true },
  ];

  const rows = defaultItems.map((item) => ({
    application_id: applicationId,
    item_name: item.item_name,
    is_required: item.is_required,
    is_verified: false,
  }));

  const { error } = await supabase.from("verification_item").insert(rows);

  if (error) {
    console.error("[createVerificationChecklist]", error.message);
    return { data: null, error: "Failed to create checklist" };
  }

  return { data: null, error: null };
}

// ─── Toggle Verification Item ──────────────────────────

/**
 * Mark a single verification item as verified or unverified (staff only).
 */
export async function toggleVerificationItem(
  itemId: string,
  isVerified: boolean
): Promise<MutationResult> {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const updates: Record<string, unknown> = {
    is_verified: isVerified,
  };

  if (isVerified) {
    updates.verified_by = user.id;
    updates.verified_at = new Date().toISOString();
  } else {
    updates.verified_by = null;
    updates.verified_at = null;
  }

  const { error } = await supabase
    .from("verification_item")
    .update(updates)
    .eq("id", itemId);

  if (error) {
    console.error("[toggleVerificationItem]", error.message);
    return { data: null, error: "Failed to update verification item" };
  }

  return { data: null, error: null };
}

// ─── Get Verification Checklist ────────────────────────

export interface VerificationItemRow {
  id: string;
  item_name: string;
  is_required: boolean;
  is_verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
}

/**
 * Fetch verification checklist for an application.
 */
export async function getVerificationChecklist(
  applicationId: string
): Promise<VerificationItemRow[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("verification_item")
    .select("id, item_name, is_required, is_verified, verified_by, verified_at")
    .eq("application_id", applicationId)
    .order("is_required", { ascending: false })
    .order("item_name");

  if (error) {
    console.error("[getVerificationChecklist]", error.message);
    return [];
  }

  return (data ?? []) as VerificationItemRow[];
}
