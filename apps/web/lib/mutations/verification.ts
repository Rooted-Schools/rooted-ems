import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";
import { AuditAction, logAuditEvent } from "@/lib/audit";

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

/** Which direction a verification item was moved. */
export type VerificationTransition = "verify" | "unverify";

export interface VerificationAuditData {
  transition: VerificationTransition;
  old_data: { status: string; verified_by: string | null; verified_at: string | null };
  new_data: { status: string; verified_by: string | null; verified_at: string | null };
}

/**
 * Shape the before and after of a verification toggle.
 *
 * verification_item keeps current state only: flipping an item verified, then
 * unverified, then verified again overwrites verified_by and verified_at each
 * time and leaves no trace that it ever happened. Who cleared a residency check
 * and who later un-cleared it is exactly the sequence an authorizer asks about,
 * so both ends of every flip go into the audit event.
 *
 * The status strings are "verified" / "unverified" rather than booleans so the
 * Audit Trail's status_change summary renders the transition directly.
 *
 * Pure — no client, no clock.
 */
export function buildVerificationAuditData(input: {
  wasVerified: boolean;
  previousVerifiedBy: string | null;
  previousVerifiedAt: string | null;
  isVerified: boolean;
  actorId: string;
  at: string;
}): VerificationAuditData {
  return {
    transition: input.isVerified ? "verify" : "unverify",
    old_data: {
      status: input.wasVerified ? "verified" : "unverified",
      verified_by: input.previousVerifiedBy,
      verified_at: input.previousVerifiedAt,
    },
    new_data: {
      status: input.isVerified ? "verified" : "unverified",
      verified_by: input.isVerified ? input.actorId : null,
      verified_at: input.isVerified ? input.at : null,
    },
  };
}

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

  // Prior state, for the audit event. Service role for this read alone: the
  // campus comes through the application embed, and embedding application from
  // a user-scoped client trips the latent RLS recursion documented in
  // lib/queries/recruitment-intel.ts. No security decision rests on this read —
  // the write below still goes through the user's own client and its policies.
  const { data: before } = await createServiceRoleClient()
    .from("verification_item")
    .select(
      "id, item_name, is_verified, verified_by, verified_at, application_id, application:application_id (campus_id)"
    )
    .eq("id", itemId)
    .single();

  const at = new Date().toISOString();

  const updates: Record<string, unknown> = {
    is_verified: isVerified,
  };

  if (isVerified) {
    updates.verified_by = user.id;
    updates.verified_at = at;
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

  const beforeRow = (before ?? null) as Record<string, unknown> | null;
  const audit = buildVerificationAuditData({
    wasVerified: beforeRow?.is_verified === true,
    previousVerifiedBy: (beforeRow?.verified_by as string | null) ?? null,
    previousVerifiedAt: (beforeRow?.verified_at as string | null) ?? null,
    isVerified,
    actorId: user.id,
    at,
  });

  await logAuditEvent({
    table_name: "verification_item",
    record_id: itemId,
    action: AuditAction.StatusChange,
    actor_id: user.id,
    campus_id:
      ((beforeRow?.application as Record<string, unknown> | null)?.campus_id as string | null) ??
      null,
    old_data: audit.old_data,
    new_data: audit.new_data,
    metadata: {
      transition: audit.transition,
      item_name: (beforeRow?.item_name as string | null) ?? null,
      application_id: (beforeRow?.application_id as string | null) ?? null,
    },
  });

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
