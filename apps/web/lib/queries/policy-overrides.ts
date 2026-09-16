import { createServiceRoleClient } from "@rooted-ems/database/server";

/**
 * Per-campus registration policy content (migration 00066). An absent row for
 * a (campus, item_type) means "use the built-in default" in
 * app/family/registration/policy-content.ts — so this only ever ADDS a
 * school's own wording, it never removes the fallback.
 *
 * Read server-side with the service-role client on purpose: the family
 * registration page needs the policy text to render, but a family is not
 * campus staff, so it cannot read campus_policy_override under RLS. The policy
 * text is not sensitive (it is exactly what the family is asked to read and
 * sign), the caller is an authenticated guardian on their own enrollment, and
 * the page only ever fetches its own enrollment's campuses. The staff Settings
 * editor reads the same rows through RLS (cpo_staff_read).
 *
 * Fail-safe: any error (including the table not existing yet) resolves to an
 * empty map, so registration silently falls back to the built-in policies and
 * never breaks.
 */

export interface PolicyOverride {
  body_en: string;
  body_es: string;
  pdf_storage_path: string | null;
}

/** campus_id -> item_type -> override. */
export type PolicyOverrideMap = Record<string, Record<string, PolicyOverride>>;

export async function getCampusPolicyOverrides(campusIds: string[]): Promise<PolicyOverrideMap> {
  if (campusIds.length === 0) return {};
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("campus_policy_override")
      .select("campus_id, item_type, body_en, body_es, pdf_storage_path")
      .in("campus_id", campusIds)
      .eq("is_active", true);

    if (error) {
      console.error("[getCampusPolicyOverrides]", error.message);
      return {};
    }

    const map: PolicyOverrideMap = {};
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const campusId = row.campus_id as string;
      const itemType = row.item_type as string;
      (map[campusId] ??= {})[itemType] = {
        body_en: (row.body_en as string) ?? "",
        body_es: (row.body_es as string) ?? "",
        pdf_storage_path: (row.pdf_storage_path as string | null) ?? null,
      };
    }
    return map;
  } catch (err) {
    console.error("[getCampusPolicyOverrides]", err instanceof Error ? err.message : String(err));
    return {};
  }
}
