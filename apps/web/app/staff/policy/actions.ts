"use server";

import { revalidatePath } from "next/cache";
import { requireMinRole, requireRoleOnCampus } from "@/lib/auth/get-session";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { saveDraftPolicyVersion, adoptPolicyVersion } from "@/lib/mutations";

/**
 * Policy actions change the rules a legally consequential lottery runs under,
 * so they carry the highest gate in the app: system_admin, and system_admin on
 * the specific campus being changed. requireMinRole alone would let a
 * system_admin at one campus rewrite another campus's board-adopted policy.
 *
 * Adoption additionally requires the caller to pass the affirmation and the
 * board's adoption date; the mutation refuses without both.
 */

async function resolvePolicyCampus(policyId: string): Promise<string | undefined> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("lottery_policy")
    .select("campus_id")
    .eq("id", policyId)
    .single();
  return data?.campus_id as string | undefined;
}

export async function staffSaveDraftPolicy(input: {
  campus_id: string;
  name: string;
  config: unknown;
  based_on_version?: number | null;
}) {
  const session = await requireRoleOnCampus(input.campus_id, "system_admin");

  const result = await saveDraftPolicyVersion({
    campus_id: input.campus_id,
    name: input.name,
    config: input.config,
    based_on_version: input.based_on_version ?? null,
    created_by: session.user_id,
  });

  if (!result.error) {
    revalidatePath("/staff/policy");
  }

  return result;
}

export async function staffAdoptPolicy(input: {
  policy_id: string;
  adopted_date: string;
  adopted_note?: string;
  affirmed: boolean;
}) {
  const campusId = await resolvePolicyCampus(input.policy_id);
  const session = await requireRoleOnCampus(campusId, "system_admin");

  const result = await adoptPolicyVersion({
    policy_id: input.policy_id,
    adopted_date: input.adopted_date,
    adopted_note: input.adopted_note,
    affirmed: input.affirmed,
    adopted_by: session.user_id,
  });

  if (!result.error) {
    revalidatePath("/staff/policy");
    revalidatePath("/staff/lottery");
  }

  return result;
}

/** Read gate for the page itself. */
export async function requirePolicyReader() {
  return requireMinRole("enrollment_manager");
}
