/**
 * Writes for the lottery policy governance layer.
 *
 * Two operations, deliberately only two:
 *   - saveDraftPolicyVersion: create a NEW draft version. Adopted versions are
 *     never edited in place; the record of what governed a past run has to
 *     stay readable exactly as it was.
 *   - adoptPolicyVersion: mark a draft adopted as of a stated board date,
 *     superseding whatever was adopted before it.
 *
 * Both refuse to write a configuration that does not validate. A policy that
 * cannot be parsed cannot govern a lottery, and storing one would only move
 * the failure to lottery day.
 */

import { createServiceRoleClient } from "@rooted-ems/database/server";
import { AuditAction, logAuditEvent } from "@/lib/audit";
import { parseLotteryPolicyConfig } from "@/lib/lottery-policy";
import { isMissingRelation } from "@/lib/queries/lottery-policy";
import type { MutationResult } from "./applications";

const MIGRATION_MISSING =
  "The lottery policy tables are not present in this database yet. Apply supabase/migrations/00047_lottery_policy.sql before configuring policy.";

export interface SaveDraftPolicyInput {
  campus_id: string;
  name: string;
  config: unknown;
  /** Version this draft was edited from, for the audit trail. */
  based_on_version?: number | null;
  created_by: string;
}

/**
 * Create a new draft version for a campus. Always version max + 1 — a draft
 * never overwrites an existing row, so version history is append-only.
 */
export async function saveDraftPolicyVersion(
  input: SaveDraftPolicyInput
): Promise<MutationResult<{ id: string; version: number }>> {
  const { errors } = parseLotteryPolicyConfig(input.config);
  if (errors.length > 0) {
    return {
      data: null,
      error: `This configuration cannot be saved: ${errors.join(" ")}`,
    };
  }

  if (!input.name.trim()) {
    return { data: null, error: "The policy needs a name." };
  }

  const supabase = createServiceRoleClient();

  const { data: existing, error: versionError } = await supabase
    .from("lottery_policy")
    .select("version")
    .eq("campus_id", input.campus_id)
    .order("version", { ascending: false })
    .limit(1);

  if (versionError) {
    if (isMissingRelation(versionError)) return { data: null, error: MIGRATION_MISSING };
    console.error("[saveDraftPolicyVersion] version lookup", versionError.message);
    return { data: null, error: "Could not read the existing policy versions." };
  }

  const nextVersion = (((existing ?? [])[0] as { version?: number } | undefined)?.version ?? 0) + 1;

  const { data, error } = await supabase
    .from("lottery_policy")
    .insert({
      campus_id: input.campus_id,
      name: input.name.trim(),
      version: nextVersion,
      status: "draft",
      config: input.config,
      created_by: input.created_by,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (isMissingRelation(error)) return { data: null, error: MIGRATION_MISSING };
    console.error("[saveDraftPolicyVersion]", error?.message);
    return { data: null, error: "Failed to save the policy draft." };
  }

  await logAuditEvent({
    table_name: "lottery_policy",
    record_id: data.id as string,
    action: AuditAction.Create,
    actor_id: input.created_by,
    campus_id: input.campus_id,
    new_data: { version: nextVersion, status: "draft", name: input.name.trim() },
    metadata: { based_on_version: input.based_on_version ?? null },
  });

  return { data: { id: data.id as string, version: nextVersion }, error: null };
}

export interface AdoptPolicyInput {
  policy_id: string;
  /** The date the governing board took the adoption action. */
  adopted_date: string;
  adopted_note?: string;
  /** The affirmation the adopting admin ticked. Must be true. */
  affirmed: boolean;
  adopted_by: string;
}

/**
 * Adopt a draft version. Supersedes the campus's current adopted version in
 * the same operation, so the partial-index guarantee (one adopted policy per
 * campus) is never violated for longer than the two statements take.
 */
export async function adoptPolicyVersion(
  input: AdoptPolicyInput
): Promise<MutationResult<{ superseded: number }>> {
  if (!input.affirmed) {
    return {
      data: null,
      error:
        "Adoption requires the affirmation that this configuration matches the enrollment policy adopted by the governing board and applicable state law.",
    };
  }
  if (!input.adopted_date || !/^\d{4}-\d{2}-\d{2}$/.test(input.adopted_date)) {
    return {
      data: null,
      error: "Enter the date the governing board adopted this policy, as YYYY-MM-DD.",
    };
  }

  const supabase = createServiceRoleClient();

  const { data: policy, error: fetchError } = await supabase
    .from("lottery_policy")
    .select("id, campus_id, name, version, status, config")
    .eq("id", input.policy_id)
    .single();

  if (fetchError || !policy) {
    if (isMissingRelation(fetchError)) return { data: null, error: MIGRATION_MISSING };
    return { data: null, error: "Policy version not found." };
  }

  if (policy.status === "adopted") {
    return { data: null, error: "This version is already the adopted policy." };
  }
  if (policy.status === "superseded") {
    return {
      data: null,
      error:
        "This version was superseded and cannot be re-adopted. Create a new draft from it instead, so the version history stays honest.",
    };
  }

  const { errors } = parseLotteryPolicyConfig(policy.config);
  if (errors.length > 0) {
    return {
      data: null,
      error: `This version cannot be adopted until its configuration is corrected: ${errors.join(" ")}`,
    };
  }

  // Supersede the current adopted version FIRST. The partial unique index
  // (idx_lottery_policy_one_adopted) would reject the new adoption otherwise,
  // and a failed adoption that leaves the previous policy in force is the safe
  // direction to fail in.
  const { data: superseded, error: supersedeError } = await supabase
    .from("lottery_policy")
    .update({ status: "superseded", updated_at: new Date().toISOString() })
    .eq("campus_id", policy.campus_id as string)
    .eq("status", "adopted")
    .select("id");

  if (supersedeError) {
    console.error("[adoptPolicyVersion] supersede", supersedeError.message);
    return { data: null, error: "Could not supersede the current adopted policy." };
  }

  const { error: adoptError } = await supabase
    .from("lottery_policy")
    .update({
      status: "adopted",
      adopted_date: input.adopted_date,
      adopted_note: input.adopted_note ?? null,
      adopted_by: input.adopted_by,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.policy_id);

  if (adoptError) {
    console.error("[adoptPolicyVersion] adopt", adoptError.message);
    return { data: null, error: "Failed to adopt this policy version." };
  }

  await logAuditEvent({
    table_name: "lottery_policy",
    record_id: input.policy_id,
    action: AuditAction.StatusChange,
    actor_id: input.adopted_by,
    campus_id: policy.campus_id as string,
    old_data: { status: "draft" },
    new_data: {
      status: "adopted",
      adopted_date: input.adopted_date,
      version: policy.version,
    },
    metadata: {
      affirmation:
        "This configuration matches the enrollment policy adopted by the governing board and applicable state law.",
      superseded_versions: (superseded ?? []).length,
      adopted_note: input.adopted_note ?? null,
    },
  });

  return { data: { superseded: (superseded ?? []).length }, error: null };
}
